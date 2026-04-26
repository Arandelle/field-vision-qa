import { compressImage } from "@/app/lib/compressImage";
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
  const image = formData.get("image") as File | null;
  const question = formData.get("question") as string | null;
  const historyRaw = formData.get("history") as string | null;
  const history: { role: string; parts: { text: string }[] }[] =
    historyRaw ? JSON.parse(historyRaw) : [];

  if (!image || !question) {
    return Response.json({ error: "Missing image or question" }, { status: 400 });
  }

  if (image.size > 5 * 1024 * 1024) {
    return Response.json({ error: "Image must be under 5 MB" }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const imageBytes = await image.arrayBuffer();
  const rawBuffer = Buffer.from(imageBytes);
  const originalSizeKB = (rawBuffer.byteLength / 1024).toFixed(1);

  const { data: compressedBuffer, mimeType: compressedMimeType } =
    await compressImage(rawBuffer);

  const base64Image = compressedBuffer.toString("base64");
  const compressedSizeKB = (compressedBuffer.byteLength / 1024).toFixed(1);

  log.info("image compressed", { originalSizeKB, compressedSizeKB });

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
            { inline_data: { mime_type: compressedMimeType, data: base64Image } },
            { text: ai_instruction },
            { text: question },
          ],
        },
      ]
    : [
        // Re-attach image only on the first turn stored in history
        ...history,
        {
          role: "user",
          parts: [{ text: question }],
        },
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

  log.info("calling gemini", { model: "gemini-3-flash-preview", turns: contents.length });

  // ── Streaming response ─────────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: object) =>
        controller.enqueue(new TextEncoder().encode(encodeSSE(data)));

      // Always send requestId first so client can display it
      enqueue({ type: "meta", requestId });

      try {
        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent",
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

        // Send the full assistant turn back so client can append to history
        const assistantText = steps
          .filter((s) => s.type === "answer")
          .map((s) => s.content)
          .join("\n");

        enqueue({
          type: "done",
          assistantTurn: {
            role: "model",
            parts: [{ text: assistantText }],
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