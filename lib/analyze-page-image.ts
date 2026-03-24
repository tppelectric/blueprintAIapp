import sharp from "sharp";

export type ClaudeImagePayload = {
  base64: string;
  mediaType: "image/png" | "image/jpeg";
};

/**
 * Heuristic: nearly uniform near-white raster (no meaningful linework).
 */
export async function imageBufferAppearsBlank(buffer: Buffer): Promise<{
  blank: boolean;
  width: number | undefined;
  height: number | undefined;
  sampleMean: number | null;
  sampleStd: number | null;
}> {
  try {
    const { data, info } = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    let sum = 0;
    let sum2 = 0;
    let n = 0;
    const stride = Math.max(1, Math.floor(data.length / (ch * 4000)));
    for (let i = 0; i < data.length; i += ch * stride) {
      const r = data[i] ?? 255;
      const g = data[i + 1] ?? 255;
      const b = data[i + 2] ?? 255;
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      sum += y;
      sum2 += y * y;
      n++;
    }
    const mean = n ? sum / n : 255;
    const variance = n ? sum2 / n - mean * mean : 0;
    const std = Math.sqrt(Math.max(0, variance));
    const blank = mean > 249 && std < 4;
    return {
      blank,
      width: info.width,
      height: info.height,
      sampleMean: mean,
      sampleStd: std,
    };
  } catch {
    return {
      blank: false,
      width: undefined,
      height: undefined,
      sampleMean: null,
      sampleStd: null,
    };
  }
}

/**
 * Second Claude attempt: mild upscale (when small) + higher JPEG quality / PNG encode.
 */
export async function reencodeForAnalyzeRetry(
  buffer: Buffer,
  mediaType: "image/png" | "image/jpeg",
): Promise<ClaudeImagePayload> {
  const meta = await sharp(buffer).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const maxDim = 4096;
  let pipeline = sharp(buffer);
  if (w > 0 && h > 0 && w < 2400 && h < 2400) {
    pipeline = pipeline.resize({
      width: Math.min(maxDim, Math.round(w * 1.5)),
      height: Math.min(maxDim, Math.round(h * 1.5)),
      fit: "inside",
      kernel: sharp.kernel.lanczos3,
    });
  }
  if (mediaType === "image/jpeg") {
    const out = await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    return { base64: out.toString("base64"), mediaType: "image/jpeg" };
  }
  const out = await pipeline.png({ compressionLevel: 3, effort: 4 }).toBuffer();
  return { base64: out.toString("base64"), mediaType: "image/png" };
}
