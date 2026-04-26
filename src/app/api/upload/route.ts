import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY!;
  const formData = await req.formData();
  const file = formData.get("image") as File;

  const buffer = await file.arrayBuffer();

  // Step 1: initiate resumable upload
  const initRes = await fetch(
    "https://generativelanguage.googleapis.com/upload/v1beta/files",
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": buffer.byteLength.toString(),
        "X-Goog-Upload-Header-Content-Type": file.type,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: file.name } }),
    }
  );

  const uploadUrl = initRes.headers.get("x-goog-upload-url")!;

  // Step 2: upload the bytes
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Length": buffer.byteLength.toString(),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: buffer,
  });

  const fileData = await uploadRes.json();
  const fileUri = fileData.file.uri;
  const mimeType = fileData.file.mimeType;

  return NextResponse.json({ fileUri, mimeType });
}