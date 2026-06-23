"use client";
import LibRaw from "libraw-wasm";

export const RAW_EXTENSIONS = new Set([
  "arw", "sr2", "srf",   // Sony
  "cr2", "cr3", "crw",   // Canon
  "nef", "nrw",          // Nikon
  "orf",                 // Olympus / OM System
  "raf",                 // Fujifilm
  "rw2",                 // Panasonic / Leica
  "pef", "ptx",          // Pentax / Ricoh
  "dng",                 // Adobe DNG
  "3fr",                 // Hasselblad
  "mrw",                 // Minolta / Konica Minolta
  "x3f",                 // Sigma
  "iiq",                 // Phase One
  "srw",                 // Samsung
]);

export function isRawFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return RAW_EXTENSIONS.has(ext);
}

// ファイル選択 accept 文字列
export const RAW_ACCEPT = [...RAW_EXTENSIONS].map(e => `.${e}`).join(",");

// サムネイル生成（高速：埋め込みJPEGを優先）
export async function decodeRawThumbnail(
  file: File,
  maxSize = 256
): Promise<{ dataURL: string; width: number; height: number }> {
  const buffer = await file.arrayBuffer();
  const raw = new LibRaw();
  try {
    // サムネイル取得のみなら軽量設定
    await raw.open(new Uint8Array(buffer), {
      outputBps: 8,
      outputColor: 1,
      useCameraWb: true,
      halfSize: true,
      userQual: 0,
    });

    const [thumb, meta] = await Promise.all([raw.thumbnailData(), raw.metadata()]);
    const fullW = meta?.width ?? 0;
    const fullH = meta?.height ?? 0;

    if (thumb && thumb.format === "jpeg") {
      // 埋め込みJPEGを使う（最速）
      const jpegCopy = new Uint8Array(thumb.data.byteLength);
      jpegCopy.set(thumb.data);
      const blob = new Blob([jpegCopy.buffer], { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          const scale = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight, 1);
          const w = Math.round(img.naturalWidth * scale);
          const h = Math.round(img.naturalHeight * scale);
          const cv = document.createElement("canvas");
          cv.width = w; cv.height = h;
          cv.getContext("2d")!.drawImage(img, 0, 0, w, h);
          resolve({ dataURL: cv.toDataURL("image/jpeg", 0.72), width: fullW || thumb.width, height: fullH || thumb.height });
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("thumb decode failed")); };
        img.src = url;
      });
    }

    // 埋め込みサムネイルがない場合はデコード済みデータから生成
    const imgData = await raw.imageData();
    if (!imgData) throw new Error("RAWデコード失敗");
    return rgbDataToThumbnail(imgData.data as Uint8Array, imgData.width, imgData.height, imgData.colors, maxSize);
  } finally {
    raw.dispose();
  }
}

// フルデコード（現像用）→ ImageData を返す
export async function decodeRawToImageData(file: File): Promise<{
  imageData: ImageData;
  width: number;
  height: number;
}> {
  const buffer = await file.arrayBuffer();
  const raw = new LibRaw();
  try {
    await raw.open(new Uint8Array(buffer), {
      outputBps: 8,
      outputColor: 1,    // sRGB（既存パイプラインと同じ入力）
      useCameraWb: true, // カメラWBを初期値として使用
      userQual: 3,       // AHD補間（高品質デモザイク）
      noAutoBright: false,
      highlight: 0,
    });

    const imgData = await raw.imageData();
    if (!imgData) throw new Error("RAWデコード失敗");

    const { width, height, data, colors } = imgData;
    const rgba = rgbToRgba(data as Uint8Array, width * height, colors);
    return { imageData: new ImageData(rgba, width, height), width, height };
  } finally {
    raw.dispose();
  }
}

// ── helpers ──────────────────────────────────────────────────────

function rgbToRgba(src: Uint8Array, pixels: number, colors: number): Uint8ClampedArray<ArrayBuffer> {
  const buf = new ArrayBuffer(pixels * 4);
  const dst = new Uint8ClampedArray(buf);
  for (let i = 0; i < pixels; i++) {
    dst[i * 4 + 0] = src[i * colors + 0];
    dst[i * 4 + 1] = src[i * colors + 1];
    dst[i * 4 + 2] = src[i * colors + 2];
    dst[i * 4 + 3] = 255;
  }
  return dst;
}

function rgbDataToThumbnail(
  data: Uint8Array, w: number, h: number, colors: number, maxSize: number
): Promise<{ dataURL: string; width: number; height: number }> {
  const rgba = rgbToRgba(data, w * h, colors);
  const scale = Math.min(maxSize / w, maxSize / h, 1);
  const tw = Math.round(w * scale);
  const th = Math.round(h * scale);
  const temp = document.createElement("canvas");
  temp.width = w; temp.height = h;
  temp.getContext("2d")!.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
  const cv = document.createElement("canvas");
  cv.width = tw; cv.height = th;
  cv.getContext("2d")!.drawImage(temp, 0, 0, tw, th);
  return Promise.resolve({ dataURL: cv.toDataURL("image/jpeg", 0.72), width: w, height: h });
}
