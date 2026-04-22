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

  const ai_instruction = `Analyze the image and answer the question using only visible evidence. Be concise. If unsure, say you cannot determine it`;
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

    console.log(JSON.stringify(data, null, 2));

    const answer =
      data.candidates?.[0]?.content?.parts?.[0]?.text ?? "No answer returned.";
    return NextResponse.json({ answer });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
