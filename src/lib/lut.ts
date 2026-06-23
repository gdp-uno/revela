// .cube LUT parser + WebGL2 3D texture upload

export interface CubeLUT {
  size:  number;
  title: string;
  data:  Float32Array;  // size^3 × 3 floats (R G B interleaved)
}

export function parseCubeLUT(text: string): CubeLUT {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  let size  = 0;
  let title = "Untitled";
  const values: number[] = [];

  for (const line of lines) {
    if (line.startsWith("LUT_3D_SIZE")) {
      size = parseInt(line.split(/\s+/)[1]);
    } else if (line.startsWith("TITLE")) {
      title = line.replace("TITLE", "").trim().replace(/"/g, "");
    } else if (/^[\d.e+-]/.test(line)) {
      const p = line.split(/\s+/);
      if (p.length >= 3) values.push(parseFloat(p[0]), parseFloat(p[1]), parseFloat(p[2]));
    }
  }

  if (size === 0) throw new Error("LUT_3D_SIZE not found in .cube file");
  const expected = size * size * size;
  if (values.length < expected * 3) throw new Error(`LUT data incomplete: got ${values.length/3}, need ${expected}`);

  return { size, title, data: new Float32Array(values.slice(0, expected * 3)) };
}

export async function loadCubeFile(file: File): Promise<CubeLUT> {
  const text = await file.text();
  return parseCubeLUT(text);
}
