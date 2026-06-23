export const isTauri = typeof window !== "undefined" && "__TAURI__" in window;

interface ImageData {
  width: number;
  height: number;
  data: number[];
}

export async function loadImageNative(path: string): Promise<ImageData> {
  if (!isTauri) throw new Error("Not running in Tauri");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ImageData>("load_image", { path });
}

export async function exportImageNative(
  path: string,
  width: number,
  height: number,
  data: Float32Array,
  quality: number = 95
): Promise<void> {
  if (!isTauri) throw new Error("Not running in Tauri");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke("export_image", { path, width, height, data: Array.from(data), quality });
}

export async function openFileDialog(): Promise<string | null> {
  if (!isTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const result = await open({
    multiple: false,
    filters: [
      {
        name: "Image",
        extensions: ["jpg", "jpeg", "png", "cr2", "cr3", "nef", "arw", "raf", "orf", "rw2", "dng"],
      },
    ],
  });
  return typeof result === "string" ? result : null;
}

export async function saveFileDialog(): Promise<string | null> {
  if (!isTauri) return null;
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({ filters: [{ name: "JPEG", extensions: ["jpg"] }] });
}
