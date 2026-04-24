import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

async function compressImage(
  buffer: Buffer,
): Promise<{ data: Buffer; mimeType: string }> {
  const compressed = await sharp(buffer)
    .resize(1024, 1024, {
      fit: "inside", // to preserve aspect ratio
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  return { data: compressed, mimeType: "image/jpeg" };
}

export interface StepPart {
  type: "thought" | "code" | "result" | "image" | "answer";
  content: string;
  mimeType?: string;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const image = formData.get("image") as File | null;
  const question = formData.get("question") as string | null;

  if (!image || !question) {
    return Response.json(
      { error: "Missing image or question" },
      { status: 400 },
    );
  }

  if (image.size > 5 * 1024 * 1024) {
    return Response.json(
      { error: "Image must be under 5 MB" },
      { status: 400 },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 },
    );
  }

  const imageBytes = await image.arrayBuffer();
  const rawBuffer = Buffer.from(imageBytes);

  // Log original size
  const originalSizeKB = (rawBuffer.byteLength / 1024).toFixed(1);

  const { data: compressedBuffer, mimeType: compressedMimeType } =
    await compressImage(rawBuffer);

  const base64Image = compressedBuffer.toString("base64");

  // Log compressed size
  const compressedSizeKB = (compressedBuffer.byteLength / 1024).toFixed(1);
  console.log(
    `[image] original: ${originalSizeKB} KB → compressed: ${compressedSizeKB} KB`,
  );

  const ai_instruction = `You are a precise visual analysis assistant for field operations.
You MUST use the code execution tool to analyze this image. Do not answer directly.
Write and execute Python code to:
1. Load and inspect the image
2. Crop or zoom into relevant regions
3. Annotate what you find with bounding boxes
4. Print your findings`;

  const payload = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: compressedMimeType, data: base64Image } },
          { text: ai_instruction },
          { text: question },
        ],
      },
    ],
    tools: [{ codeExecution: {} }],

    generationConfig: {
      thinkingConfig: {
        includeThoughts: true,
        thinkingLevel: "HIGH",
      },
    },
  };

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": apiKey,
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const err = await response.json();
      return NextResponse.json(
        { error: err.error?.message ?? "Gemini API error" },
        { status: response.status },
      );
    }

    const data = await response.json();

    const sanitized = JSON.parse(JSON.stringify(data)); // deep clone
    for (const part of sanitized?.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        part.inlineData.data =
          part.inlineData.data.slice(0, 40) + "...[truncated]";
      }
    }

    console.log(JSON.stringify(sanitized, null, 2));

    const parts = data?.candidates[0]?.content?.parts ?? [];

    const steps: StepPart[] = [];

    for (const part of parts) {
      if (part.text) {
        const trimmed = part.text.trim();
        if (!trimmed) continue;

        const isAfterCode = steps.some((s) => s.type === "code");

        steps.push({
          type: isAfterCode ? "answer" : "thought",
          content: trimmed,
        });
      } else if (part.executableCode) {
        steps.push({
          type: "code",
          content: part.executableCode.code,
        });
      } else if (part.codeExecutionResult) {
        steps.push({
          type: "result",
          content: part.codeExecutionResult.output ?? "",
        });
      } else if (part.inlineData) {
        // Intermediate or annotated image produced by the code
        steps.push({
          type: "image",
          content: part.inlineData.data, // raw base64
          mimeType: part.inlineData.mimeType,
        });
      }
    }

    // Fallback: if nothing parsed, return raw text
    if (steps.length === 0) {
      steps.push({ type: "answer", content: "No answer returned." });
    }

    return NextResponse.json({ steps });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
