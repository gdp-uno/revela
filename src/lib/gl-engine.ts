"use client";

// ----------------------------------------------------------------
// Vertex shader (shared)
// ----------------------------------------------------------------
const VERT_SRC = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

// ----------------------------------------------------------------
// Fragment shader: Linear RGB → LAB adjust → HSV adjust → Linear RGB
// ----------------------------------------------------------------
const FRAG_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_image;

// LAB params
uniform float u_L;   // -100 to +100
uniform float u_A;   // -100 to +100
uniform float u_B;   // -100 to +100

// HSV params
uniform float u_hue;        // -180 to +180
uniform float u_saturation; // -100 to +100
uniform float u_value;      // -100 to +100

// ---- Color space conversions ----

// Linear → XYZ (D65)
vec3 linear_to_xyz(vec3 c) {
  return mat3(
    0.4124564, 0.3575761, 0.1804375,
    0.2126729, 0.7151522, 0.0721750,
    0.0193339, 0.1191920, 0.9503041
  ) * c;
}

// XYZ → Linear
vec3 xyz_to_linear(vec3 xyz) {
  return mat3(
     3.2404542, -1.5371385, -0.4985314,
    -0.9692660,  1.8760108,  0.0415560,
     0.0556434, -0.2040259,  1.0572252
  ) * xyz;
}

float f_lab(float t) {
  const float delta = 6.0 / 29.0;
  return t > delta * delta * delta
    ? pow(t, 1.0 / 3.0)
    : t / (3.0 * delta * delta) + 4.0 / 29.0;
}

float f_lab_inv(float t) {
  const float delta = 6.0 / 29.0;
  return t > delta
    ? t * t * t
    : 3.0 * delta * delta * (t - 4.0 / 29.0);
}

// XYZ → LAB
vec3 xyz_to_lab(vec3 xyz) {
  // D65 white point
  vec3 n = xyz / vec3(0.95047, 1.0, 1.08883);
  float fx = f_lab(n.x);
  float fy = f_lab(n.y);
  float fz = f_lab(n.z);
  return vec3(
    116.0 * fy - 16.0,
    500.0 * (fx - fy),
    200.0 * (fy - fz)
  );
}

// LAB → XYZ
vec3 lab_to_xyz(vec3 lab) {
  float fy = (lab.x + 16.0) / 116.0;
  float fx = lab.y / 500.0 + fy;
  float fz = fy - lab.z / 200.0;
  return vec3(
    0.95047 * f_lab_inv(fx),
    1.0     * f_lab_inv(fy),
    1.08883 * f_lab_inv(fz)
  );
}

// RGB → HSV
vec3 rgb_to_hsv(vec3 c) {
  float maxC = max(c.r, max(c.g, c.b));
  float minC = min(c.r, min(c.g, c.b));
  float delta = maxC - minC;
  float h = 0.0;
  if (delta > 0.0) {
    if (maxC == c.r)      h = mod((c.g - c.b) / delta, 6.0);
    else if (maxC == c.g) h = (c.b - c.r) / delta + 2.0;
    else                  h = (c.r - c.g) / delta + 4.0;
    h /= 6.0;
  }
  float s = maxC > 0.0 ? delta / maxC : 0.0;
  return vec3(h, s, maxC);
}

// HSV → RGB
vec3 hsv_to_rgb(vec3 hsv) {
  float h = hsv.x * 6.0;
  float s = hsv.y;
  float v = hsv.z;
  float c = v * s;
  float x = c * (1.0 - abs(mod(h, 2.0) - 1.0));
  float m = v - c;
  vec3 rgb;
  if      (h < 1.0) rgb = vec3(c, x, 0);
  else if (h < 2.0) rgb = vec3(x, c, 0);
  else if (h < 3.0) rgb = vec3(0, c, x);
  else if (h < 4.0) rgb = vec3(0, x, c);
  else if (h < 5.0) rgb = vec3(x, 0, c);
  else              rgb = vec3(c, 0, x);
  return rgb + m;
}

void main() {
  vec4 px = texture(u_image, v_uv);
  vec3 linear = px.rgb;

  // ---- LAB node ----
  vec3 xyz = linear_to_xyz(linear);
  vec3 lab = xyz_to_lab(xyz);

  lab.x = clamp(lab.x + u_L, 0.0, 100.0);
  lab.y = clamp(lab.y + u_A, -128.0, 127.0);
  lab.z = clamp(lab.z + u_B, -128.0, 127.0);

  vec3 xyz2 = lab_to_xyz(lab);
  vec3 out_linear = clamp(xyz_to_linear(xyz2), 0.0, 1.0);

  // ---- HSV node ----
  vec3 hsv = rgb_to_hsv(out_linear);

  hsv.x = fract(hsv.x + u_hue / 360.0);
  hsv.y = clamp(hsv.y + u_saturation / 100.0, 0.0, 1.0);
  hsv.z = clamp(hsv.z + u_value / 100.0, 0.0, 1.0);

  vec3 final_linear = hsv_to_rgb(hsv);

  fragColor = vec4(final_linear, px.a);
}`;

// ----------------------------------------------------------------
// Engine state
// ----------------------------------------------------------------
export interface GlState {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  texture: WebGLTexture;
  vao: WebGLVertexArrayObject;
  uniforms: Record<string, WebGLUniformLocation>;
  texWidth: number;
  texHeight: number;
}

export interface LabParams {
  L: number;
  A: number;
  B: number;
}

export interface HsvParams {
  hue: number;
  saturation: number;
  value: number;
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile error: ${gl.getShaderInfoLog(s)}`);
  }
  return s;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VERT_SRC));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link error: ${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

export function initGl(canvas: HTMLCanvasElement): GlState {
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 not supported");

  const program = createProgram(gl);
  gl.useProgram(program);

  // Fullscreen quad
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );
  const loc = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const uniforms: Record<string, WebGLUniformLocation> = {};
  for (const name of ["u_image", "u_L", "u_A", "u_B", "u_hue", "u_saturation", "u_value"]) {
    uniforms[name] = gl.getUniformLocation(program, name)!;
  }
  gl.uniform1i(uniforms["u_image"], 0);

  return { gl, program, texture, vao, uniforms, texWidth: 0, texHeight: 0 };
}

export function uploadTexture(state: GlState, imageData: ImageData | HTMLImageElement | Float32Array, w?: number, h?: number): GlState {
  const { gl, texture } = state;
  gl.bindTexture(gl.TEXTURE_2D, texture);

  if (imageData instanceof Float32Array && w && h) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, imageData);
    return { ...state, texWidth: w, texHeight: h };
  }

  if (imageData instanceof HTMLImageElement) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
    return { ...state, texWidth: imageData.naturalWidth, texHeight: imageData.naturalHeight };
  }

  // ImageData (canvas)
  const id = imageData as ImageData;
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, id);
  return { ...state, texWidth: id.width, texHeight: id.height };
}

export function render(state: GlState, lab: LabParams, hsv: HsvParams): void {
  const { gl, uniforms, vao, texWidth, texHeight } = state;
  if (texWidth === 0) return;

  gl.canvas.width = texWidth;
  gl.canvas.height = texHeight;
  gl.viewport(0, 0, texWidth, texHeight);

  gl.uniform1f(uniforms["u_L"], lab.L);
  gl.uniform1f(uniforms["u_A"], lab.A);
  gl.uniform1f(uniforms["u_B"], lab.B);
  gl.uniform1f(uniforms["u_hue"], hsv.hue);
  gl.uniform1f(uniforms["u_saturation"], hsv.saturation);
  gl.uniform1f(uniforms["u_value"], hsv.value);

  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

export function readPixels(state: GlState): Float32Array {
  const { gl, texWidth, texHeight } = state;
  const buf = new Float32Array(texWidth * texHeight * 4);
  gl.readPixels(0, 0, texWidth, texHeight, gl.RGBA, gl.FLOAT, buf);
  return buf;
}
