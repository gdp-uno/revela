"use client";

const VERT_SRC = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_image;
uniform sampler2D u_tone_curve; // 256×1 RGBA: R/G/B per-channel

// Basic corrections
uniform float u_exposure;    // -5 to +5 EV
uniform float u_contrast;    // -100 to +100
uniform float u_highlights;  // -100 to +100
uniform float u_shadows;     // -100 to +100
uniform float u_whites;      // -100 to +100
uniform float u_blacks;      // -100 to +100

// LAB
uniform float u_L;
uniform float u_A;
uniform float u_B;

// Global HSV
uniform float u_hue;
uniform float u_saturation;
uniform float u_value;

// Color mixer: Red/Orange/Yellow/Green/Aqua/Blue/Purple/Magenta
uniform float u_cm_hue[8];
uniform float u_cm_sat[8];
uniform float u_cm_lum[8];

// ── Color space conversions ────────────────────────────────────

vec3 linear_to_xyz(vec3 c) {
  return mat3(0.4124564,0.3575761,0.1804375,
              0.2126729,0.7151522,0.0721750,
              0.0193339,0.1191920,0.9503041) * c;
}
vec3 xyz_to_linear(vec3 xyz) {
  return mat3( 3.2404542,-1.5371385,-0.4985314,
              -0.9692660, 1.8760108, 0.0415560,
               0.0556434,-0.2040259, 1.0572252) * xyz;
}
float f_lab(float t) {
  float d = 6.0/29.0;
  return t > d*d*d ? pow(t,1.0/3.0) : t/(3.0*d*d)+4.0/29.0;
}
float f_lab_inv(float t) {
  float d = 6.0/29.0;
  return t > d ? t*t*t : 3.0*d*d*(t-4.0/29.0);
}
vec3 xyz_to_lab(vec3 xyz) {
  vec3 n = xyz/vec3(0.95047,1.0,1.08883);
  float fx=f_lab(n.x),fy=f_lab(n.y),fz=f_lab(n.z);
  return vec3(116.0*fy-16.0, 500.0*(fx-fy), 200.0*(fy-fz));
}
vec3 lab_to_xyz(vec3 lab) {
  float fy=(lab.x+16.0)/116.0, fx=lab.y/500.0+fy, fz=fy-lab.z/200.0;
  return vec3(0.95047*f_lab_inv(fx), f_lab_inv(fy), 1.08883*f_lab_inv(fz));
}
vec3 rgb_to_hsv(vec3 c) {
  float mx=max(c.r,max(c.g,c.b)), mn=min(c.r,min(c.g,c.b)), d=mx-mn;
  float h=0.0;
  if(d>0.0){
    if(mx==c.r)      h=mod((c.g-c.b)/d,6.0);
    else if(mx==c.g) h=(c.b-c.r)/d+2.0;
    else             h=(c.r-c.g)/d+4.0;
    h/=6.0;
  }
  return vec3(h, mx>0.0?d/mx:0.0, mx);
}
vec3 hsv_to_rgb(vec3 h) {
  float hh=h.x*6.0,s=h.y,v=h.z,c=v*s,x=c*(1.0-abs(mod(hh,2.0)-1.0)),m=v-c;
  vec3 rgb;
  if(hh<1.0)      rgb=vec3(c,x,0);
  else if(hh<2.0) rgb=vec3(x,c,0);
  else if(hh<3.0) rgb=vec3(0,c,x);
  else if(hh<4.0) rgb=vec3(0,x,c);
  else if(hh<5.0) rgb=vec3(x,0,c);
  else            rgb=vec3(c,0,x);
  return rgb+m;
}

// ── Main ──────────────────────────────────────────────────────

void main() {
  vec4 px = texture(u_image, v_uv);
  vec3 c = px.rgb;

  // 1. Exposure
  c *= pow(2.0, u_exposure);

  // 2. Blacks & Whites (point adjustment)
  float bk = u_blacks / 100.0 * 0.08;
  float wh = 1.0 + u_whites / 100.0 * 0.08;
  c = clamp((c - bk) / max(wh - bk, 0.01), 0.0, 1.0);

  // 3. Highlights / Shadows (zone-masked)
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float hi_mask = smoothstep(0.45, 0.95, luma);
  float lo_mask = 1.0 - smoothstep(0.05, 0.55, luma);
  float hi_adj = u_highlights / 100.0 * 0.6;
  float lo_adj = u_shadows    / 100.0 * 0.5;
  c = clamp(c + c * hi_mask * hi_adj, 0.0, 1.0);
  c = clamp(c + (c * 0.5 + vec3(0.04)) * lo_mask * lo_adj, 0.0, 1.0);

  // 4. Contrast (S-curve, pivot at 0.18 linear)
  float cs = 1.0 + u_contrast / 100.0;
  c = clamp(0.18 + (c - 0.18) * cs, 0.0, 1.0);

  // 5. Tone curve (per-channel LUT 256×1)
  c = vec3(
    texture(u_tone_curve, vec2(c.r, 0.5)).r,
    texture(u_tone_curve, vec2(c.g, 0.5)).g,
    texture(u_tone_curve, vec2(c.b, 0.5)).b
  );

  // 6. LAB node
  vec3 lab = xyz_to_lab(linear_to_xyz(c));
  lab.x = clamp(lab.x + u_L,  0.0,  100.0);
  lab.y = clamp(lab.y + u_A, -128.0, 127.0);
  lab.z = clamp(lab.z + u_B, -128.0, 127.0);
  c = clamp(xyz_to_linear(lab_to_xyz(lab)), 0.0, 1.0);

  // 7. Global HSV
  vec3 hsv = rgb_to_hsv(c);
  hsv.x = fract(hsv.x + u_hue / 360.0);
  hsv.y = clamp(hsv.y + u_saturation / 100.0, 0.0, 1.0);
  hsv.z = clamp(hsv.z + u_value       / 100.0, 0.0, 1.0);
  c = hsv_to_rgb(hsv);

  // 8. Color Mixer (per-hue targeting, density coupling)
  // Centers: Red(0°) Orange(30°) Yellow(60°) Green(120°) Aqua(180°) Blue(240°) Purple(270°) Magenta(300°)
  const float HW = 0.0833; // 30°/360° falloff half-width
  hsv = rgb_to_hsv(c);
  float h_d=0.0, s_d=0.0, v_d=0.0;

  float centers[8];
  centers[0]=0.0;    centers[1]=0.0833; centers[2]=0.1667; centers[3]=0.3333;
  centers[4]=0.5;    centers[5]=0.6667; centers[6]=0.75;   centers[7]=0.8333;

  for(int i=0;i<8;i++){
    float dist = abs(fract(hsv.x - centers[i] + 0.5) - 0.5);
    float w    = 1.0 - smoothstep(0.0, HW, dist);
    float sa   = u_cm_sat[i] / 100.0 * w;
    h_d += u_cm_hue[i] / 100.0 * (45.0/360.0) * w;
    s_d += sa;
    v_d += (u_cm_lum[i] / 100.0 - sa * 0.3) * w; // density coupling
  }
  hsv.x = fract(hsv.x + h_d);
  hsv.y = clamp(hsv.y + s_d, 0.0, 1.0);
  hsv.z = clamp(hsv.z + v_d, 0.0, 1.0);
  c = hsv_to_rgb(hsv);

  fragColor = vec4(clamp(c, 0.0, 1.0), px.a);
}`;

// ── Types ─────────────────────────────────────────────────────

export interface GlState {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  imageTexture: WebGLTexture;
  toneCurveTex: WebGLTexture;
  vao: WebGLVertexArrayObject;
  uniforms: Record<string, WebGLUniformLocation | null>;
  texWidth: number;
  texHeight: number;
}

export interface BasicParams {
  exposure: number;   // -5 to +5
  contrast: number;   // -100 to +100
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
}

export interface LabParams { L: number; A: number; B: number; }
export interface HsvParams { hue: number; saturation: number; value: number; }

export interface ColorChannel { hue: number; sat: number; lum: number; }

export interface AllParams {
  basic: BasicParams;
  lab: LabParams;
  hsv: HsvParams;
  colorMixer: ColorChannel[]; // 8 entries
}

// ── Internal helpers ──────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(`Shader compile error: ${gl.getShaderInfoLog(s)}`);
  return s;
}

function identityLUT(): Float32Array {
  const d = new Float32Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = v;
  }
  return d;
}

// ── Public API ────────────────────────────────────────────────

export function initGl(canvas: HTMLCanvasElement): GlState {
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 not supported");

  const prog = gl.createProgram()!;
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VERT_SRC));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    throw new Error(`Link error: ${gl.getProgramInfoLog(prog)}`);
  gl.useProgram(prog);

  // Fullscreen quad
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a_position");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  // Image texture (unit 0)
  const imageTexture = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, imageTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // Tone curve LUT texture (unit 1) — 256×1 RGBA32F
  const toneCurveTex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, toneCurveTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 256, 1, 0, gl.RGBA, gl.FLOAT, identityLUT());

  // Uniform locations
  const uniformNames = [
    "u_image", "u_tone_curve",
    "u_exposure","u_contrast","u_highlights","u_shadows","u_whites","u_blacks",
    "u_L","u_A","u_B",
    "u_hue","u_saturation","u_value",
    "u_cm_hue","u_cm_sat","u_cm_lum",
  ];
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  for (const n of uniformNames) uniforms[n] = gl.getUniformLocation(prog, n);

  gl.uniform1i(uniforms["u_image"], 0);
  gl.uniform1i(uniforms["u_tone_curve"], 1);

  return { gl, program: prog, imageTexture, toneCurveTex, vao, uniforms, texWidth: 0, texHeight: 0 };
}

export function uploadTexture(
  state: GlState,
  imageData: globalThis.ImageData | HTMLImageElement | Float32Array,
  w?: number, h?: number
): GlState {
  const { gl, imageTexture } = state;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, imageTexture);

  if (imageData instanceof Float32Array && w && h) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, imageData);
    return { ...state, texWidth: w, texHeight: h };
  }
  if (imageData instanceof HTMLImageElement) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
    return { ...state, texWidth: imageData.naturalWidth, texHeight: imageData.naturalHeight };
  }
  const id = imageData as globalThis.ImageData;
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, id);
  return { ...state, texWidth: id.width, texHeight: id.height };
}

export function updateToneCurveLUT(state: GlState, lut: Float32Array): void {
  const { gl, toneCurveTex } = state;
  const data = new Float32Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const v = lut[i];
    data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = v;
  }
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, toneCurveTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.FLOAT, data);
}

export function render(state: GlState, params: AllParams): void {
  const { gl, uniforms, vao, texWidth, texHeight } = state;
  if (texWidth === 0) return;

  gl.canvas.width = texWidth;
  gl.canvas.height = texHeight;
  gl.viewport(0, 0, texWidth, texHeight);

  const { basic, lab, hsv, colorMixer } = params;
  gl.uniform1f(uniforms["u_exposure"],   basic.exposure);
  gl.uniform1f(uniforms["u_contrast"],   basic.contrast);
  gl.uniform1f(uniforms["u_highlights"], basic.highlights);
  gl.uniform1f(uniforms["u_shadows"],    basic.shadows);
  gl.uniform1f(uniforms["u_whites"],     basic.whites);
  gl.uniform1f(uniforms["u_blacks"],     basic.blacks);
  gl.uniform1f(uniforms["u_L"],  lab.L);
  gl.uniform1f(uniforms["u_A"],  lab.A);
  gl.uniform1f(uniforms["u_B"],  lab.B);
  gl.uniform1f(uniforms["u_hue"],        hsv.hue);
  gl.uniform1f(uniforms["u_saturation"], hsv.saturation);
  gl.uniform1f(uniforms["u_value"],      hsv.value);

  const cm = colorMixer;
  gl.uniform1fv(uniforms["u_cm_hue"], new Float32Array(cm.map(c => c.hue)));
  gl.uniform1fv(uniforms["u_cm_sat"], new Float32Array(cm.map(c => c.sat)));
  gl.uniform1fv(uniforms["u_cm_lum"], new Float32Array(cm.map(c => c.lum)));

  // Bind both textures
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.imageTexture);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, state.toneCurveTex);

  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

export function readPixels(state: GlState): Float32Array {
  const { gl, texWidth, texHeight } = state;
  const buf = new Float32Array(texWidth * texHeight * 4);
  gl.readPixels(0, 0, texWidth, texHeight, gl.RGBA, gl.FLOAT, buf);
  return buf;
}
