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
uniform sampler2D u_tone_curve; // 256×1 RGBA32F

// Pipeline mode
uniform float u_linear_in;   // 1=linear (rawler), 0=sRGB (browser JPEG/PNG)

// White Balance
uniform float u_temp;         // -100 to +100 (cool → warm)
uniform float u_tint;         // -150 to +150 (green → magenta)

// Tone
uniform float u_exposure;     // -5 to +5 EV
uniform float u_contrast;     // -100 to +100
uniform float u_highlights;   // -100 to +100
uniform float u_shadows;      // -100 to +100
uniform float u_whites;       // -100 to +100
uniform float u_blacks;       // -100 to +100

// Presence
uniform float u_texture;      // -100 to +100 (1px USM approx; multi-pass later)
uniform float u_clarity;      // -100 to +100 (midtone contrast approx)
uniform float u_dehaze;       // -100 to +100 (contrast lift + color shift approx)
uniform float u_vibrance;     // -100 to +100 (saturation, skin-protected)
uniform float u_pres_sat;     // -100 to +100 (global saturation in Basic panel)

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

// ── Color space helpers ────────────────────────────────────────

vec3 srgb_to_linear(vec3 c) {
  return vec3(
    c.r <= 0.04045 ? c.r / 12.92 : pow((c.r + 0.055) / 1.055, 2.4),
    c.g <= 0.04045 ? c.g / 12.92 : pow((c.g + 0.055) / 1.055, 2.4),
    c.b <= 0.04045 ? c.b / 12.92 : pow((c.b + 0.055) / 1.055, 2.4)
  );
}
vec3 linear_to_srgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return vec3(
    c.r <= 0.0031308 ? c.r * 12.92 : 1.055 * pow(c.r, 1.0 / 2.4) - 0.055,
    c.g <= 0.0031308 ? c.g * 12.92 : 1.055 * pow(c.g, 1.0 / 2.4) - 0.055,
    c.b <= 0.0031308 ? c.b * 12.92 : 1.055 * pow(c.b, 1.0 / 2.4) - 0.055
  );
}

vec3 linear_to_xyz(vec3 c) {
  return mat3(0.4124564, 0.3575761, 0.1804375,
              0.2126729, 0.7151522, 0.0721750,
              0.0193339, 0.1191920, 0.9503041) * c;
}
vec3 xyz_to_linear(vec3 xyz) {
  return mat3( 3.2404542,-1.5371385,-0.4985314,
              -0.9692660, 1.8760108, 0.0415560,
               0.0556434,-0.2040259, 1.0572252) * xyz;
}
float f_lab(float t) {
  float d = 6.0 / 29.0;
  return t > d * d * d ? pow(t, 1.0 / 3.0) : t / (3.0 * d * d) + 4.0 / 29.0;
}
float f_lab_inv(float t) {
  float d = 6.0 / 29.0;
  return t > d ? t * t * t : 3.0 * d * d * (t - 4.0 / 29.0);
}
vec3 xyz_to_lab(vec3 xyz) {
  vec3 n = xyz / vec3(0.95047, 1.0, 1.08883);
  float fx = f_lab(n.x), fy = f_lab(n.y), fz = f_lab(n.z);
  return vec3(116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz));
}
vec3 lab_to_xyz(vec3 lab) {
  float fy = (lab.x + 16.0) / 116.0, fx = lab.y / 500.0 + fy, fz = fy - lab.z / 200.0;
  return vec3(0.95047 * f_lab_inv(fx), f_lab_inv(fy), 1.08883 * f_lab_inv(fz));
}
vec3 rgb_to_hsv(vec3 c) {
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), d = mx - mn;
  float h = 0.0;
  if (d > 0.0) {
    if (mx == c.r)      h = mod((c.g - c.b) / d, 6.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else                h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, mx > 0.0 ? d / mx : 0.0, mx);
}
vec3 hsv_to_rgb(vec3 h) {
  float hh = h.x * 6.0, s = h.y, v = h.z, c = v * s, x = c * (1.0 - abs(mod(hh, 2.0) - 1.0)), m = v - c;
  vec3 rgb;
  if      (hh < 1.0) rgb = vec3(c, x, 0);
  else if (hh < 2.0) rgb = vec3(x, c, 0);
  else if (hh < 3.0) rgb = vec3(0, c, x);
  else if (hh < 4.0) rgb = vec3(0, x, c);
  else if (hh < 5.0) rgb = vec3(x, 0, c);
  else               rgb = vec3(c, 0, x);
  return rgb + m;
}

// ── Main ──────────────────────────────────────────────────────

void main() {
  vec4 px = texture(u_image, v_uv);
  vec3 c = px.rgb;

  // 0. Input linearize (sRGB JPEG/PNG → scene-linear)
  if (u_linear_in < 0.5) c = srgb_to_linear(c);

  // 1. White Balance (multiplicative in linear, luma-preserving)
  float t  = u_temp / 100.0;   // positive = warm
  float ti = u_tint / 100.0;   // positive = magenta
  c.r *= (1.0 + t  * 0.25);
  c.b *= (1.0 - t  * 0.25);
  c.g *= (1.0 - ti * 0.15);
  c.r *= (1.0 + ti * 0.05);
  c.b *= (1.0 + ti * 0.05);
  c = max(c, vec3(0.0));

  // 2. Exposure (in linear: multiply by 2^EV)
  c *= pow(2.0, u_exposure);

  // 3. Blacks / Whites point remap
  float bk = u_blacks / 100.0 * 0.08;
  float wh = 1.0 + u_whites / 100.0 * 0.08;
  c = (c - bk) / max(wh - bk, 0.01);

  // 4. Highlights / Shadows (zone-masked)
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float hi_mask = smoothstep(0.45, 0.95, luma);
  float lo_mask = 1.0 - smoothstep(0.05, 0.55, luma);
  c = c + c * hi_mask * (u_highlights / 100.0 * 0.6);
  c = c + (c * 0.5 + vec3(0.04)) * lo_mask * (u_shadows / 100.0 * 0.5);

  // 5. Contrast (S-curve around 0.18 linear pivot)
  c = 0.18 + (c - 0.18) * (1.0 + u_contrast / 100.0);

  // 6. Dehaze — fog lifting (contrast in shadows + blue-yellow shift)
  // Approximate: true dark-channel-prior requires multi-pass FBO
  if (abs(u_dehaze) > 0.001) {
    float dh = u_dehaze / 100.0;
    float dhluma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c /= max(1.0 - dh * (1.0 - dhluma) * 0.6, 0.01);
    c.r += dh * 0.015;
    c.b -= dh * 0.025;
  }

  // 7. Clarity — midtone local contrast (approx S-curve; true: Gaussian blur pass)
  if (abs(u_clarity) > 0.001) {
    float cl = u_clarity / 100.0;
    float cl_luma = clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
    float mid = smoothstep(0.1, 0.5, cl_luma) * (1.0 - smoothstep(0.5, 0.9, cl_luma));
    vec3 contrast_c = 0.5 + (c - 0.5) * (1.0 + cl * 0.8);
    c = mix(c, contrast_c, mid * abs(cl) * 2.0);
  }

  // 8. Texture — edge local contrast (1-px USM; true: medium-radius blur pass)
  if (abs(u_texture) > 0.001) {
    float tx = u_texture / 100.0;
    vec2 ts = vec2(1.0) / vec2(textureSize(u_image, 0));
    vec3 n_px = texture(u_image, v_uv + vec2(0.0,  ts.y)).rgb;
    vec3 s_px = texture(u_image, v_uv - vec2(0.0,  ts.y)).rgb;
    vec3 e_px = texture(u_image, v_uv + vec2(ts.x,  0.0)).rgb;
    vec3 w_px = texture(u_image, v_uv - vec2(ts.x,  0.0)).rgb;
    if (u_linear_in < 0.5) {
      n_px = srgb_to_linear(n_px); s_px = srgb_to_linear(s_px);
      e_px = srgb_to_linear(e_px); w_px = srgb_to_linear(w_px);
    }
    vec3 blur1 = (n_px + s_px + e_px + w_px) * 0.25;
    c = c + (c - blur1) * tx * 1.5;
  }

  // 9. Tone Curve (clamp to [0,1] for LUT lookup; HDR extension planned)
  c = clamp(c, 0.0, 1.0);
  c = vec3(
    texture(u_tone_curve, vec2(c.r, 0.5)).r,
    texture(u_tone_curve, vec2(c.g, 0.5)).g,
    texture(u_tone_curve, vec2(c.b, 0.5)).b
  );

  // 10. Presence: Saturation + Vibrance
  if (abs(u_pres_sat) > 0.001 || abs(u_vibrance) > 0.001) {
    vec3 hsv_p = rgb_to_hsv(c);
    // Global saturation (presence)
    hsv_p.y = clamp(hsv_p.y + u_pres_sat / 100.0, 0.0, 1.0);
    // Vibrance: protect already-saturated pixels and skin tone (~25°)
    if (abs(u_vibrance) > 0.001) {
      float skin_dist = abs(fract(hsv_p.x - 0.069 + 0.5) - 0.5); // ~25° = 0.069
      float skin_prot = 1.0 - smoothstep(0.0, 0.083, skin_dist);
      float vib_scale = (1.0 - hsv_p.y * 0.6) * (1.0 - skin_prot * 0.7);
      hsv_p.y = clamp(hsv_p.y + u_vibrance / 100.0 * vib_scale, 0.0, 1.0);
    }
    c = hsv_to_rgb(hsv_p);
  }

  // 11. LAB node
  vec3 lab = xyz_to_lab(linear_to_xyz(c));
  lab.x = clamp(lab.x + u_L,   0.0,   100.0);
  lab.y = clamp(lab.y + u_A, -128.0,   127.0);
  lab.z = clamp(lab.z + u_B, -128.0,   127.0);
  c = clamp(xyz_to_linear(lab_to_xyz(lab)), 0.0, 1.0);

  // 12. Global HSV
  vec3 hsv = rgb_to_hsv(c);
  hsv.x = fract(hsv.x + u_hue / 360.0);
  hsv.y = clamp(hsv.y + u_saturation / 100.0, 0.0, 1.0);
  hsv.z = clamp(hsv.z + u_value       / 100.0, 0.0, 1.0);
  c = hsv_to_rgb(hsv);

  // 13. Color Mixer (8 hue ranges, density coupling)
  const float HW = 0.0833;
  hsv = rgb_to_hsv(c);
  float h_d = 0.0, s_d = 0.0, v_d = 0.0;
  float centers[8];
  centers[0]=0.0;    centers[1]=0.0833; centers[2]=0.1667; centers[3]=0.3333;
  centers[4]=0.5;    centers[5]=0.6667; centers[6]=0.75;   centers[7]=0.8333;
  for (int i = 0; i < 8; i++) {
    float dist = abs(fract(hsv.x - centers[i] + 0.5) - 0.5);
    float w    = 1.0 - smoothstep(0.0, HW, dist);
    float sa   = u_cm_sat[i] / 100.0 * w;
    h_d += u_cm_hue[i] / 100.0 * (45.0 / 360.0) * w;
    s_d += sa;
    v_d += (u_cm_lum[i] / 100.0 - sa * 0.3) * w;
  }
  hsv.x = fract(hsv.x + h_d);
  hsv.y = clamp(hsv.y + s_d, 0.0, 1.0);
  hsv.z = clamp(hsv.z + v_d, 0.0, 1.0);
  c = hsv_to_rgb(hsv);

  // 14. Output: linear → sRGB display transform (always)
  fragColor = vec4(linear_to_srgb(c), px.a);
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
  linearIn: boolean;
}

export interface BasicParams {
  // White Balance
  temp: number;         // -100 to +100
  tint: number;         // -150 to +150
  // Tone
  exposure: number;     // -5 to +5
  contrast: number;     // -100 to +100
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  // Presence
  texture: number;      // -100 to +100
  clarity: number;      // -100 to +100
  dehaze: number;       // -100 to +100
  vibrance: number;     // -100 to +100
  saturation: number;   // -100 to +100 (presence saturation)
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
    "u_image", "u_tone_curve", "u_linear_in",
    "u_temp", "u_tint",
    "u_exposure","u_contrast","u_highlights","u_shadows","u_whites","u_blacks",
    "u_texture","u_clarity","u_dehaze","u_vibrance","u_pres_sat",
    "u_L","u_A","u_B",
    "u_hue","u_saturation","u_value",
    "u_cm_hue","u_cm_sat","u_cm_lum",
  ];
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  for (const n of uniformNames) uniforms[n] = gl.getUniformLocation(prog, n);

  gl.uniform1i(uniforms["u_image"], 0);
  gl.uniform1i(uniforms["u_tone_curve"], 1);
  gl.uniform1f(uniforms["u_linear_in"], 0.0);

  return { gl, program: prog, imageTexture, toneCurveTex, vao, uniforms, texWidth: 0, texHeight: 0, linearIn: false };
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
    // Linear float from rawler — already scene-linear
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, imageData);
    return { ...state, texWidth: w, texHeight: h, linearIn: true };
  }
  if (imageData instanceof HTMLImageElement) {
    // sRGB-encoded JPEG/PNG — shader will linearize
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
    return { ...state, texWidth: imageData.naturalWidth, texHeight: imageData.naturalHeight, linearIn: false };
  }
  const id = imageData as globalThis.ImageData;
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, id);
  return { ...state, texWidth: id.width, texHeight: id.height, linearIn: false };
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

  gl.uniform1f(uniforms["u_linear_in"],  state.linearIn ? 1.0 : 0.0);
  gl.uniform1f(uniforms["u_temp"],       basic.temp);
  gl.uniform1f(uniforms["u_tint"],       basic.tint);
  gl.uniform1f(uniforms["u_exposure"],   basic.exposure);
  gl.uniform1f(uniforms["u_contrast"],   basic.contrast);
  gl.uniform1f(uniforms["u_highlights"], basic.highlights);
  gl.uniform1f(uniforms["u_shadows"],    basic.shadows);
  gl.uniform1f(uniforms["u_whites"],     basic.whites);
  gl.uniform1f(uniforms["u_blacks"],     basic.blacks);
  gl.uniform1f(uniforms["u_texture"],    basic.texture);
  gl.uniform1f(uniforms["u_clarity"],    basic.clarity);
  gl.uniform1f(uniforms["u_dehaze"],     basic.dehaze);
  gl.uniform1f(uniforms["u_vibrance"],   basic.vibrance);
  gl.uniform1f(uniforms["u_pres_sat"],   basic.saturation);
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
