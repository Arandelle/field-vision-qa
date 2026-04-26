import { NextRequest } from "next/server";

export interface StepPart {
  type: "thought" | "code" | "result" | "image" | "answer";
  content: string;
  mimeType?: string;
}

// ── Logger ────────────────────────────────────────────────────────────────────
function makeLogger(requestId: string) {
  return {
    info: (msg: string, meta?: object) =>
      console.log(JSON.stringify({ level: "info", requestId, msg, ...meta, ts: new Date().toISOString() })),
    error: (msg: string, meta?: object) =>
      console.error(JSON.stringify({ level: "error", requestId, msg, ...meta, ts: new Date().toISOString() })),
  };
}

// ── SSE helpers ───────────────────────────────────────────────────────────────
function encodeSSE(data: object) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const log = makeLogger(requestId);

  log.info("request received");

  const formData = await req.formData();

  const question = formData.get("question") as string | null;
  const historyRaw = formData.get("history") as string | null;
  const history: { role: string; parts: { text: string }[] }[] =
    historyRaw ? JSON.parse(historyRaw) : [];



  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Server misconfiguration" }, { status: 500 });
  }


  const fileUri = formData.get("fileUri") as string | null;
  const fileMime = formData.get("fileMime") as string | null;

  if (!fileUri || !question) {
    return Response.json({ error: "Missing image or question" }, { status: 400 });
  }

  const ai_instruction = `You are a precise visual analysis assistant for field operations.
You MUST use the code execution tool to analyze this image. Do not answer directly.
Write and execute Python code to:
1. Load and inspect the image
2. Crop or zoom into relevant regions
3. Annotate what you find with bounding boxes
4. Print your findings`;

  // ── Build conversation turns ───────────────────────────────────────────────
  // First turn always includes the image + instruction
  // Subsequent turns (history) are plain text
  const isFirstTurn = history.length === 0;

  const contents = isFirstTurn
    ? [
      {
        role: "user",
        parts: [
          { file_data: { mime_type: fileMime, file_uri: fileUri } }, // ← changed
          { text: ai_instruction },
          { text: question },
        ],
      },
    ]
    : [
      {
        ...history[0],
        parts: [
          { file_data: { mime_type: fileMime, file_uri: fileUri } },
          ...history[0].parts,
        ],
      },
      ...history.slice(1),
      { role: "user", parts: [{ text: question }] },
    ];

  const payload = {
    contents,
    tools: [{ codeExecution: {} }],
    generationConfig: {
      thinkingConfig: {
        includeThoughts: true,
        thinkingLevel: "HIGH",
      },
    },
  };
  const payloadString = JSON.stringify(payload);
  const payloadSizeKB = (Buffer.byteLength(payloadString, "utf8") / 1024).toFixed(1);
  const hasFileData = contents.some((c: any) =>
    c.parts?.some((p: any) => p.file_data)
  );
  log.info("payload size", { payloadSizeKB, turns: contents.length, hasFileData });

  // ── Streaming response ─────────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: object) =>
        controller.enqueue(new TextEncoder().encode(encodeSSE(data)));

      // Always send requestId first so client can display it
      enqueue({ type: "meta", requestId });

      try {
        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify(payload),
          }
        );

        if (!response.ok) {
          const err = await response.json();
          log.error("gemini error", { status: response.status });
          enqueue({ type: "error", message: err.error?.message ?? "Gemini API error" });
          controller.close();
          return;
        }

        const data = await response.json();
        const parts = data?.candidates?.[0]?.content?.parts ?? [];

        log.info("gemini responded", { partCount: parts.length });

        const steps: StepPart[] = [];

        // Stream each step as it's parsed
        for (const part of parts) {
          if (part.text) {
            const trimmed = part.text.trim();
            if (!trimmed) continue;

            const isAfterCode = steps.some((s) => s.type === "code");
            const step: StepPart = {
              type: isAfterCode ? "answer" : "thought",
              content: trimmed,
            };
            steps.push(step);
            enqueue({ type: "step", step });

          } else if (part.executableCode) {
            const step: StepPart = { type: "code", content: part.executableCode.code };
            steps.push(step);
            enqueue({ type: "step", step });

          } else if (part.codeExecutionResult) {
            const step: StepPart = { type: "result", content: part.codeExecutionResult.output ?? "" };
            steps.push(step);
            enqueue({ type: "step", step });

          } else if (part.inlineData) {
            const step: StepPart = {
              type: "image",
              content: part.inlineData.data,
              mimeType: part.inlineData.mimeType,
            };
            steps.push(step);
            enqueue({ type: "step", step });
          }
        }

        if (steps.length === 0) {
          const fallback: StepPart = { type: "answer", content: "No answer returned." };
          enqueue({ type: "step", step: fallback });
        }

        const assistantParts = parts.map((part: any) => {
          if (part.inlineData) {
            // Don't store the full image in history
            return { text: "[image output]" };
          }
          // Keep everything else including thoughtSignature
          return part;
        });

        enqueue({
          type: "done",
          assistantTurn: {
            role: "model",
            parts: assistantParts,
          },
        });

        log.info("stream complete", { stepCount: steps.length });

      } catch (error) {
        log.error("unexpected error", {
          message: error instanceof Error ? error.message : String(error),
        });
        enqueue({ type: "error", message: "Internal server error" });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "x-request-id": requestId,
    },
  });
}