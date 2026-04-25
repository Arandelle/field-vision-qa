import sharp from "sharp";

export async function compressImage(
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