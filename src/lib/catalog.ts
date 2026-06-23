"use client";

// Revela photo catalog — IndexedDB-backed

export type Flag        = "flagged" | "unflagged" | "rejected";
export type ColorLabel  = "red" | "yellow" | "green" | "blue" | "purple" | null;
export type Rating      = 0 | 1 | 2 | 3 | 4 | 5;
export type SortField   = "dateAdded" | "dateTaken" | "filename" | "rating";

export interface CatalogPhoto {
  id:                string;
  filename:          string;
  thumbnailDataURL:  string;   // 256px JPEG data URL, persisted
  dateAdded:         number;
  dateTaken:         number | null;
  flag:              Flag;
  rating:            Rating;
  colorLabel:        ColorLabel;
  width:             number;
  height:            number;
  fileSize:          number;
  developSettings:   string | null;  // JSON of AllParams
  collectionIds:     string[];
}

export interface Collection {
  id:        string;
  name:      string;
  photoIds:  string[];
  createdAt: number;
}

export interface Preset {
  id:        string;
  name:      string;
  settings:  string;  // JSON of AllParams
  createdAt: number;
}

export type SmartFilter =
  | { type: "all" }
  | { type: "flagged" }
  | { type: "rejected" }
  | { type: "unflagged" }
  | { type: "rated"; minRating: Rating }
  | { type: "label"; label: ColorLabel }
  | { type: "collection"; collectionId: string };

const DB_NAME    = "revela-catalog";
const DB_VERSION = 1;

// ── DB bootstrap ──────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("photos")) {
        const s = db.createObjectStore("photos", { keyPath: "id" });
        s.createIndex("dateAdded", "dateAdded");
        s.createIndex("rating",    "rating");
        s.createIndex("flag",      "flag");
      }
      if (!db.objectStoreNames.contains("blobs"))       db.createObjectStore("blobs",       { keyPath: "id" });
      if (!db.objectStoreNames.contains("collections")) db.createObjectStore("collections", { keyPath: "id" });
      if (!db.objectStoreNames.contains("presets"))     db.createObjectStore("presets",     { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function tx<T>(
  db: IDBDatabase,
  stores: string | string[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => Promise<T>
): Promise<T> {
  const t = db.transaction(stores, mode);
  return fn(t).then(result =>
    new Promise<T>((res, rej) => {
      t.oncomplete = () => res(result);
      t.onerror    = () => rej(t.error);
    })
  );
}

const idbGet = <T>(store: IDBObjectStore, key: string): Promise<T | undefined> =>
  new Promise((res, rej) => { const r=store.get(key); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });

const idbGetAll = <T>(store: IDBObjectStore): Promise<T[]> =>
  new Promise((res, rej) => { const r=store.getAll(); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });

const idbPut = (store: IDBObjectStore, val: unknown): Promise<void> =>
  new Promise((res, rej) => { const r=store.put(val); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); });

const idbDel = (store: IDBObjectStore, key: string): Promise<void> =>
  new Promise((res, rej) => { const r=store.delete(key); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); });

// ── Thumbnail ─────────────────────────────────────────────────

export async function generateThumbnail(file: File, maxSize = 256): Promise<{ dataURL: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight, 1);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      cv.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve({ dataURL: cv.toDataURL("image/jpeg", 0.72), width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("load failed")); };
    img.src = url;
  });
}

// ── Photos ────────────────────────────────────────────────────

export async function importFiles(files: File[]): Promise<CatalogPhoto[]> {
  const db = await openDB();
  const added: CatalogPhoto[] = [];
  for (const file of files) {
    const id = crypto.randomUUID();
    const { dataURL, width, height } = await generateThumbnail(file);
    const photo: CatalogPhoto = {
      id, filename: file.name, thumbnailDataURL: dataURL,
      dateAdded: Date.now(), dateTaken: file.lastModified || null,
      flag: "unflagged", rating: 0, colorLabel: null,
      width, height, fileSize: file.size,
      developSettings: null, collectionIds: [],
    };
    await tx(db, ["photos","blobs"], "readwrite", async t => {
      await idbPut(t.objectStore("photos"), photo);
      await idbPut(t.objectStore("blobs"),  { id, blob: file });
    });
    added.push(photo);
  }
  return added;
}

export async function getAllPhotos(): Promise<CatalogPhoto[]> {
  const db = await openDB();
  return idbGetAll<CatalogPhoto>(db.transaction("photos","readonly").objectStore("photos"));
}

export async function getPhotoBlob(id: string): Promise<File | undefined> {
  const db = await openDB();
  const r = await idbGet<{ id: string; blob: File }>(db.transaction("blobs","readonly").objectStore("blobs"), id);
  return r?.blob;
}

export async function updatePhoto(id: string, patch: Partial<CatalogPhoto>): Promise<void> {
  const db = await openDB();
  await tx(db, "photos", "readwrite", async t => {
    const store = t.objectStore("photos");
    const existing = await idbGet<CatalogPhoto>(store, id);
    if (existing) await idbPut(store, { ...existing, ...patch });
  });
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await openDB();
  await tx(db, ["photos","blobs"], "readwrite", async t => {
    await idbDel(t.objectStore("photos"), id);
    await idbDel(t.objectStore("blobs"),  id);
  });
}

// ── Filter / Sort ─────────────────────────────────────────────

export function filterPhotos(photos: CatalogPhoto[], filter: SmartFilter): CatalogPhoto[] {
  switch (filter.type) {
    case "all":        return photos;
    case "flagged":    return photos.filter(p => p.flag === "flagged");
    case "rejected":   return photos.filter(p => p.flag === "rejected");
    case "unflagged":  return photos.filter(p => p.flag === "unflagged");
    case "rated":      return photos.filter(p => p.rating >= filter.minRating);
    case "label":      return photos.filter(p => p.colorLabel === filter.label);
    case "collection": return photos.filter(p => p.collectionIds.includes(filter.collectionId));
  }
}

export function sortPhotos(photos: CatalogPhoto[], by: SortField, desc = true): CatalogPhoto[] {
  return [...photos].sort((a, b) => {
    const av = a[by as keyof CatalogPhoto] ?? 0;
    const bv = b[by as keyof CatalogPhoto] ?? 0;
    return desc ? (bv as number) - (av as number) : (av as number) - (bv as number);
  });
}

// ── Collections ───────────────────────────────────────────────

export async function getCollections(): Promise<Collection[]> {
  const db = await openDB();
  return idbGetAll<Collection>(db.transaction("collections","readonly").objectStore("collections"));
}

export async function createCollection(name: string): Promise<Collection> {
  const c: Collection = { id: crypto.randomUUID(), name, photoIds: [], createdAt: Date.now() };
  const db = await openDB();
  await idbPut(db.transaction("collections","readwrite").objectStore("collections"), c);
  return c;
}

export async function addToCollection(collectionId: string, photoId: string): Promise<void> {
  const db = await openDB();
  // Update collection
  await tx(db, "collections", "readwrite", async t => {
    const store = t.objectStore("collections");
    const c = await idbGet<Collection>(store, collectionId);
    if (c && !c.photoIds.includes(photoId)) await idbPut(store, { ...c, photoIds: [...c.photoIds, photoId] });
  });
  // Update photo
  await tx(db, "photos", "readwrite", async t => {
    const store = t.objectStore("photos");
    const p = await idbGet<CatalogPhoto>(store, photoId);
    if (p && !p.collectionIds.includes(collectionId)) await idbPut(store, { ...p, collectionIds: [...p.collectionIds, collectionId] });
  });
}

export async function deleteCollection(id: string): Promise<void> {
  const db = await openDB();
  await idbDel(db.transaction("collections","readwrite").objectStore("collections"), id);
}

// ── Presets ───────────────────────────────────────────────────

export async function getPresets(): Promise<Preset[]> {
  const db = await openDB();
  return idbGetAll<Preset>(db.transaction("presets","readonly").objectStore("presets"));
}

export async function savePreset(name: string, settings: string): Promise<Preset> {
  const p: Preset = { id: crypto.randomUUID(), name, settings, createdAt: Date.now() };
  const db = await openDB();
  await idbPut(db.transaction("presets","readwrite").objectStore("presets"), p);
  return p;
}

export async function deletePreset(id: string): Promise<void> {
  const db = await openDB();
  await idbDel(db.transaction("presets","readwrite").objectStore("presets"), id);
}
