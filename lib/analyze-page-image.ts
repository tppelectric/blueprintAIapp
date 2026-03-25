import sharp from "sharp";

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
