import { NextRequest, NextResponse } from "next/server";

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
  const base64Image = Buffer.from(imageBytes).toString("base64");

  const ai_instruction = `You are a precise visual analysis assistant for field operations. Analyze the image and answer the user's question with actionable and factual information.
Rules:
- Base your answer strictly on what is visible in the image.
- Be concise and direct.
- Prefer exact values (e.g., counts, labels, text) when possible.
- If uncertain or not visible, respond: "I cannot determine that from the image."
- Do not guess or infer beyond the image.
`;

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: image.type, data: base64Image } },
                { text: question },
              ],
            },
          ],
        }),
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
