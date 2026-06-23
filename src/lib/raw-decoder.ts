"use client";

// Side-effect import: forces webpack to emit libraw.wasm to static/chunks/
// so the libraw-wasm WebWorker can fetch it at the correct relative URL.
import "libraw-wasm/dist/libraw.wasm";

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

export const RAW_ACCEPT = [...RAW_EXTENSIONS].map(e => `.${e}`).join(",");

// Lazy-load LibRaw to avoid Worker creation during SSR / module init
async function createLibRaw() {
  const { default: LibRaw } = await import("libraw-wasm");
  return new LibRaw();
}

// Thumbnail generation (fast: prefers embedded JPEG)
export async function decodeRawThumbnail(
  file: File,
  maxSize = 256
): Promise<{ dataURL: string; width: number; height: number }> {
  const buffer = await file.arrayBuffer();
  const raw = await createLibRaw();
  try {
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

    const imgData = await raw.imageData();
    if (!imgData) throw new Error("RAWデコード失敗");
    return rgbDataToThumbnail(imgData.data as Uint8Array, imgData.width, imgData.height, imgData.colors, maxSize);
  } finally {
    raw.dispose();
  }
}

// Full decode for develop view → returns ImageData
export async function decodeRawToImageData(file: File): Promise<{
  imageData: ImageData;
  width: number;
  height: number;
}> {
  const buffer = await file.arrayBuffer();
  const raw = await createLibRaw();
  try {
    await raw.open(new Uint8Array(buffer), {
      outputBps: 8,
      outputColor: 1,
      useCameraWb: true,
      userQual: 3,
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
