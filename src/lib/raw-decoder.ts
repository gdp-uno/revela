"use client";

export const RAW_EXTENSIONS = new Set([
  "arw", "sr2", "srf",
  "cr2", "cr3", "crw",
  "nef", "nrw",
  "orf",
  "raf",
  "rw2",
  "pef", "ptx",
  "dng",
  "3fr",
  "mrw",
  "x3f",
  "iiq",
  "srw",
]);

export function isRawFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return RAW_EXTENSIONS.has(ext);
}

export const RAW_ACCEPT = [...RAW_EXTENSIONS].map(e => `.${e}`).join(",");

// ── Minimal LibRaw client ─────────────────────────────────────────
// Uses the worker.js copied to public/libraw-wasm/ by the postinstall script.
// This avoids webpack/Turbopack worker-bundling issues with the npm package.

interface WorkerMsg {
  id: number;
  out?: unknown;
  error?: string;
}

interface ThumbnailData {
  data: Uint8Array;
  width: number;
  height: number;
  format: string;
}

interface ImageDataResult {
  width: number;
  height: number;
  colors: number;
  data: Uint8Array;
}

interface MetaResult {
  width?: number;
  height?: number;
  thumb_format?: number | string;
  [key: string]: unknown;
}

class RawDecoder {
  private worker: Worker;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private nextId = 0;
  private tail: Promise<unknown> = Promise.resolve();

  constructor() {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    this.worker = new Worker(`${basePath}/libraw-wasm/worker.js`, { type: "module" });
    this.worker.onmessage = ({ data }: MessageEvent<WorkerMsg>) => {
      const p = this.pending.get(data?.id);
      if (!p) return;
      this.pending.delete(data.id);
      if (data?.error) p.reject(new Error(data.error));
      else p.resolve(data?.out);
    };
  }

  private runFn(fn: string, ...args: unknown[]): Promise<unknown> {
    const doRun = () => new Promise<unknown>((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      const transferable = (args as unknown[]).flatMap(a =>
        a instanceof ArrayBuffer ? [a] :
        a instanceof Uint8Array  ? [a.buffer] : []
      ) as Transferable[];
      this.worker.postMessage({ id, fn, args }, transferable);
    });
    const p = this.tail.then(doRun, doRun);
    this.tail = p.then(() => {}, () => {});
    return p;
  }

  async open(bytes: BufferSource, settings?: object): Promise<void> {
    await this.runFn("open", bytes, settings);
  }

  async thumbnailData(): Promise<ThumbnailData | undefined> {
    return this.runFn("thumbnailData") as Promise<ThumbnailData | undefined>;
  }

  async metadata(): Promise<MetaResult | undefined> {
    const out = await this.runFn("metadata", false) as MetaResult | undefined;
    if (out && typeof out.thumb_format === "number") {
      const fmts = ["unknown", "jpeg", "bitmap", "bitmap16", "layer", "rollei", "h265"];
      out.thumb_format = fmts[out.thumb_format] ?? "unknown";
    }
    return out;
  }

  async imageData(): Promise<ImageDataResult | undefined> {
    return this.runFn("imageData") as Promise<ImageDataResult | undefined>;
  }

  dispose(): void {
    this.worker.terminate();
    for (const { reject } of this.pending.values()) reject(new Error("LibRaw disposed"));
    this.pending.clear();
  }
}

// ── Public API ────────────────────────────────────────────────────

export async function decodeRawThumbnail(
  file: File,
  maxSize = 256
): Promise<{ dataURL: string; width: number; height: number }> {
  const buffer = await file.arrayBuffer();
  const raw = new RawDecoder();
  try {
    await raw.open(new Uint8Array(buffer), {
      outputBps: 8, outputColor: 1, useCameraWb: true, halfSize: true, userQual: 0,
    });

    const [thumb, meta] = await Promise.all([raw.thumbnailData(), raw.metadata()]);
    const fullW = (meta?.width as number) ?? 0;
    const fullH = (meta?.height as number) ?? 0;

    if (thumb && thumb.format === "jpeg") {
      const copy = new Uint8Array(thumb.data.byteLength);
      copy.set(thumb.data);
      const blob = new Blob([copy.buffer], { type: "image/jpeg" });
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
    return rgbDataToThumbnail(imgData.data, imgData.width, imgData.height, imgData.colors, maxSize);
  } finally {
    raw.dispose();
  }
}

export async function decodeRawToImageData(file: File): Promise<{
  imageData: ImageData;
  width: number;
  height: number;
}> {
  const buffer = await file.arrayBuffer();
  const raw = new RawDecoder();
  try {
    await raw.open(new Uint8Array(buffer), {
      outputBps: 8, outputColor: 1, useCameraWb: true, userQual: 3, noAutoBright: false, highlight: 0,
    });

    const imgData = await raw.imageData();
    if (!imgData) throw new Error("RAWデコード失敗");

    const { width, height, data, colors } = imgData;
    const rgba = rgbToRgba(data, width * height, colors);
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
    dst[i * 4]     = src[i * colors];
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
