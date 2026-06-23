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
// Tone curve: R=red_curve G=green_curve B=blue_curve A=master_curve
uniform sampler2D u_tone_curve;

// Pipeline mode
uniform float u_linear_in;    // 1=linear (rawler), 0=sRGB

// White Balance
uniform float u_temp;          // -100 to +100
uniform float u_tint;          // -150 to +150

// Calibration (raw primaries — applied before tone)
uniform float u_cal_sh_tint;   // -100 to +100 shadow green/magenta tint
uniform float u_cal_r_hue;     // -100 to +100
uniform float u_cal_r_sat;
uniform float u_cal_g_hue;
uniform float u_cal_g_sat;
uniform float u_cal_b_hue;
uniform float u_cal_b_sat;

// Tone
uniform float u_exposure;
uniform float u_contrast;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_whites;
uniform float u_blacks;

// Presence
uniform float u_texture;
uniform float u_clarity;
uniform float u_dehaze;
uniform float u_vibrance;
uniform float u_pres_sat;

// LAB
uniform float u_L;
uniform float u_A;
uniform float u_B;

// Global HSV
uniform float u_hue;
uniform float u_saturation;
uniform float u_value;

// Color Mixer (8 hue ranges)
uniform float u_cm_hue[8];
uniform float u_cm_sat[8];
uniform float u_cm_lum[8];

// Color Grading (3-way LAB wheels)
uniform float u_cg_sh_hue;    // 0-1 (wheel angle)
uniform float u_cg_sh_sat;    // 0-1 (wheel radius)
uniform float u_cg_sh_lum;    // -100 to +100
uniform float u_cg_mid_hue;
uniform float u_cg_mid_sat;
uniform float u_cg_mid_lum;
uniform float u_cg_hi_hue;
uniform float u_cg_hi_sat;
uniform float u_cg_hi_lum;
uniform float u_cg_blend;     // 0-100 zone overlap
uniform float u_cg_balance;   // -100 to +100

// Effects
uniform float u_vig_amount;    // -100 to +100
uniform float u_vig_midpoint;  // 0-100
uniform float u_vig_feather;   // 0-100
uniform float u_vig_roundness; // -100 to +100

uniform float u_grain_amount;  // 0-100
uniform float u_grain_size;    // 1-50
uniform float u_grain_rough;   // 0-100

// ── Helpers ───────────────────────────────────────────────────

vec3 srgb_to_linear(vec3 c) {
  return vec3(
    c.r <= 0.04045 ? c.r/12.92 : pow((c.r+0.055)/1.055, 2.4),
    c.g <= 0.04045 ? c.g/12.92 : pow((c.g+0.055)/1.055, 2.4),
    c.b <= 0.04045 ? c.b/12.92 : pow((c.b+0.055)/1.055, 2.4)
  );
}
vec3 linear_to_srgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return vec3(
    c.r <= 0.0031308 ? c.r*12.92 : 1.055*pow(c.r,1.0/2.4)-0.055,
    c.g <= 0.0031308 ? c.g*12.92 : 1.055*pow(c.g,1.0/2.4)-0.055,
    c.b <= 0.0031308 ? c.b*12.92 : 1.055*pow(c.b,1.0/2.4)-0.055
  );
}
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
  float d=6.0/29.0;
  return t>d*d*d ? pow(t,1.0/3.0) : t/(3.0*d*d)+4.0/29.0;
}
float f_lab_inv(float t) {
  float d=6.0/29.0;
  return t>d ? t*t*t : 3.0*d*d*(t-4.0/29.0);
}
vec3 xyz_to_lab(vec3 xyz) {
  vec3 n=xyz/vec3(0.95047,1.0,1.08883);
  float fx=f_lab(n.x),fy=f_lab(n.y),fz=f_lab(n.z);
  return vec3(116.0*fy-16.0, 500.0*(fx-fy), 200.0*(fy-fz));
}
vec3 lab_to_xyz(vec3 lab) {
  float fy=(lab.x+16.0)/116.0, fx=lab.y/500.0+fy, fz=fy-lab.z/200.0;
  return vec3(0.95047*f_lab_inv(fx), f_lab_inv(fy), 1.08883*f_lab_inv(fz));
}
vec3 rgb_to_hsv(vec3 c) {
  float mx=max(c.r,max(c.g,c.b)),mn=min(c.r,min(c.g,c.b)),d=mx-mn;
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
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.346));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// ── Main pipeline ─────────────────────────────────────────────

void main() {
  vec4 px = texture(u_image, v_uv);
  vec3 c = px.rgb;

  // 0. Linearize sRGB input
  if (u_linear_in < 0.5) c = srgb_to_linear(c);

  // 1. White Balance (multiplicative in linear)
  c.r *= (1.0 + u_temp/100.0 * 0.25);
  c.b *= (1.0 - u_temp/100.0 * 0.25);
  c.g *= (1.0 - u_tint/100.0 * 0.15);
  c.r *= (1.0 + u_tint/100.0 * 0.05);
  c.b *= (1.0 + u_tint/100.0 * 0.05);
  c = max(c, 0.0);

  // 2. Calibration (raw primary adjustments — before tone)
  // Shadow tint (green–magenta in shadows)
  float cal_luma = dot(c, vec3(0.2126,0.7152,0.0722));
  float sh_cal_mask = 1.0 - smoothstep(0.0, 0.35, cal_luma);
  float st = u_cal_sh_tint / 100.0;
  c.g += st * 0.05 * sh_cal_mask;
  c.r -= st * 0.025 * sh_cal_mask;
  c.b -= st * 0.025 * sh_cal_mask;
  // RGB primary hue + sat
  if (abs(u_cal_r_hue)+abs(u_cal_r_sat)+abs(u_cal_g_hue)+abs(u_cal_g_sat)+abs(u_cal_b_hue)+abs(u_cal_b_sat) > 0.001) {
    const float CHW = 0.25;
    vec3 cal_hsv = rgb_to_hsv(c);
    float rw = max(1.0-smoothstep(0.0,CHW,cal_hsv.x), 1.0-smoothstep(0.85,1.0,cal_hsv.x));
    float gw = 1.0-smoothstep(0.0,CHW,abs(fract(cal_hsv.x-0.333+0.5)-0.5));
    float bw = 1.0-smoothstep(0.0,CHW,abs(fract(cal_hsv.x-0.667+0.5)-0.5));
    cal_hsv.x = fract(cal_hsv.x + (u_cal_r_hue*rw + u_cal_g_hue*gw + u_cal_b_hue*bw)/100.0*(30.0/360.0));
    cal_hsv.y = clamp(cal_hsv.y + (u_cal_r_sat*rw + u_cal_g_sat*gw + u_cal_b_sat*bw)/100.0, 0.0, 1.0);
    c = hsv_to_rgb(cal_hsv);
  }

  // 3. Exposure
  c *= pow(2.0, u_exposure);

  // 4. Blacks / Whites
  float bk = u_blacks/100.0 * 0.08;
  float wh = 1.0 + u_whites/100.0 * 0.08;
  c = (c - bk) / max(wh - bk, 0.01);

  // 5. Highlights / Shadows
  float luma = dot(c, vec3(0.2126,0.7152,0.0722));
  float hi_mask = smoothstep(0.45, 0.95, luma);
  float lo_mask = 1.0 - smoothstep(0.05, 0.55, luma);
  c += c * hi_mask * (u_highlights/100.0 * 0.6);
  c += (c*0.5 + vec3(0.04)) * lo_mask * (u_shadows/100.0 * 0.5);

  // 6. Contrast (S-curve, 0.18 linear pivot)
  c = 0.18 + (c - 0.18) * (1.0 + u_contrast/100.0);

  // 7. Dehaze (approx; true dark-channel-prior = multi-pass)
  if (abs(u_dehaze) > 0.001) {
    float dh = u_dehaze/100.0;
    float dhl = dot(c, vec3(0.2126,0.7152,0.0722));
    c /= max(1.0 - dh*(1.0-dhl)*0.6, 0.01);
    c.r += dh*0.015; c.b -= dh*0.025;
  }

  // 8. Clarity (midtone contrast, approx; true = Gaussian blur pass)
  if (abs(u_clarity) > 0.001) {
    float cl = u_clarity/100.0;
    float cll = clamp(dot(c, vec3(0.2126,0.7152,0.0722)), 0.0, 1.0);
    float mid = smoothstep(0.1,0.5,cll)*(1.0-smoothstep(0.5,0.9,cll));
    c = mix(c, 0.5+(c-0.5)*(1.0+cl*0.8), mid*abs(cl)*2.0);
  }

  // 9. Texture (1px USM; true = medium-radius blur pass)
  if (abs(u_texture) > 0.001) {
    float tx = u_texture/100.0;
    vec2 ts = vec2(1.0)/vec2(textureSize(u_image, 0));
    vec3 np=texture(u_image,v_uv+vec2(0,ts.y)).rgb, sp=texture(u_image,v_uv-vec2(0,ts.y)).rgb;
    vec3 ep=texture(u_image,v_uv+vec2(ts.x,0)).rgb, wp=texture(u_image,v_uv-vec2(ts.x,0)).rgb;
    if (u_linear_in<0.5){np=srgb_to_linear(np);sp=srgb_to_linear(sp);ep=srgb_to_linear(ep);wp=srgb_to_linear(wp);}
    c += (c - (np+sp+ep+wp)*0.25) * tx * 1.5;
  }

  // 10. Tone Curve — master pass (.a), then per-channel pass (.rgb)
  c = clamp(c, 0.0, 1.0);
  vec3 cm_tc;
  cm_tc.r = texture(u_tone_curve, vec2(c.r, 0.5)).a;
  cm_tc.g = texture(u_tone_curve, vec2(c.g, 0.5)).a;
  cm_tc.b = texture(u_tone_curve, vec2(c.b, 0.5)).a;
  c.r = texture(u_tone_curve, vec2(cm_tc.r, 0.5)).r;
  c.g = texture(u_tone_curve, vec2(cm_tc.g, 0.5)).g;
  c.b = texture(u_tone_curve, vec2(cm_tc.b, 0.5)).b;

  // 11. Presence: Saturation + Vibrance
  if (abs(u_pres_sat)+abs(u_vibrance) > 0.001) {
    vec3 hp = rgb_to_hsv(c);
    hp.y = clamp(hp.y + u_pres_sat/100.0, 0.0, 1.0);
    if (abs(u_vibrance) > 0.001) {
      float skin_d = abs(fract(hp.x - 0.069 + 0.5) - 0.5);
      float skin_p = 1.0 - smoothstep(0.0, 0.083, skin_d);
      float vs = (1.0-hp.y*0.6)*(1.0-skin_p*0.7);
      hp.y = clamp(hp.y + u_vibrance/100.0*vs, 0.0, 1.0);
    }
    c = hsv_to_rgb(hp);
  }

  // 12. LAB node
  vec3 lab = xyz_to_lab(linear_to_xyz(c));
  lab.x = clamp(lab.x + u_L,   0.0,  100.0);
  lab.y = clamp(lab.y + u_A, -128.0,  127.0);
  lab.z = clamp(lab.z + u_B, -128.0,  127.0);
  c = clamp(xyz_to_linear(lab_to_xyz(lab)), 0.0, 1.0);

  // 13. Global HSV
  vec3 hsv = rgb_to_hsv(c);
  hsv.x = fract(hsv.x + u_hue/360.0);
  hsv.y = clamp(hsv.y + u_saturation/100.0, 0.0, 1.0);
  hsv.z = clamp(hsv.z + u_value/100.0,      0.0, 1.0);
  c = hsv_to_rgb(hsv);

  // 14. Color Mixer (8 hue ranges, density coupling)
  const float HW = 0.0833;
  hsv = rgb_to_hsv(c);
  float hd=0.0,sd=0.0,vd=0.0;
  float centers[8];
  centers[0]=0.0;centers[1]=0.0833;centers[2]=0.1667;centers[3]=0.3333;
  centers[4]=0.5;centers[5]=0.6667;centers[6]=0.75; centers[7]=0.8333;
  for(int i=0;i<8;i++){
    float dist=abs(fract(hsv.x-centers[i]+0.5)-0.5);
    float w=1.0-smoothstep(0.0,HW,dist);
    float sa=u_cm_sat[i]/100.0*w;
    hd+=u_cm_hue[i]/100.0*(45.0/360.0)*w;
    sd+=sa;
    vd+=(u_cm_lum[i]/100.0-sa*0.3)*w;
  }
  hsv.x=fract(hsv.x+hd);
  hsv.y=clamp(hsv.y+sd,0.0,1.0);
  hsv.z=clamp(hsv.z+vd,0.0,1.0);
  c=hsv_to_rgb(hsv);

  // 15. Color Grading (3-way zone LAB)
  if (abs(u_cg_sh_sat)+abs(u_cg_mid_sat)+abs(u_cg_hi_sat)+
      abs(u_cg_sh_lum)+abs(u_cg_mid_lum)+abs(u_cg_hi_lum) > 0.001) {
    vec3 cg_lab = xyz_to_lab(linear_to_xyz(c));
    float cg_l  = cg_lab.x / 100.0;
    float bw    = u_cg_blend/100.0 * 0.15 + 0.05;
    float bal   = u_cg_balance/100.0 * 0.12;
    float sh_m  = 1.0 - smoothstep(0.0, 0.3+bw+bal, cg_l);
    float hi_m  = smoothstep(0.7+bal-bw, 1.0, cg_l);
    float mid_m = max(0.0, 1.0 - sh_m - hi_m);
    const float CG_SCALE = 40.0;
    vec2 sh_ab  = vec2(cos(u_cg_sh_hue  *6.2832), sin(u_cg_sh_hue  *6.2832)) * u_cg_sh_sat  * CG_SCALE;
    vec2 mid_ab = vec2(cos(u_cg_mid_hue *6.2832), sin(u_cg_mid_hue *6.2832)) * u_cg_mid_sat * CG_SCALE;
    vec2 hi_ab  = vec2(cos(u_cg_hi_hue  *6.2832), sin(u_cg_hi_hue  *6.2832)) * u_cg_hi_sat  * CG_SCALE;
    cg_lab.x += (u_cg_sh_lum/100.0*18.0)*sh_m + (u_cg_mid_lum/100.0*18.0)*mid_m + (u_cg_hi_lum/100.0*18.0)*hi_m;
    cg_lab.y += sh_ab.x*sh_m + mid_ab.x*mid_m + hi_ab.x*hi_m;
    cg_lab.z += sh_ab.y*sh_m + mid_ab.y*mid_m + hi_ab.y*hi_m;
    cg_lab.x = clamp(cg_lab.x, 0.0, 100.0);
    cg_lab.y = clamp(cg_lab.y, -128.0, 127.0);
    cg_lab.z = clamp(cg_lab.z, -128.0, 127.0);
    c = clamp(xyz_to_linear(lab_to_xyz(cg_lab)), 0.0, 1.0);
  }

  // 16. Vignette (post-crop style)
  if (abs(u_vig_amount) > 0.001) {
    vec2 vu = (v_uv - 0.5) * 2.0;
    float rnd = (u_vig_roundness / 100.0) * 0.8 + 1.2; // 0.4 to 2.0 power
    float vd_px = pow(pow(abs(vu.x), rnd) + pow(abs(vu.y), rnd), 1.0/rnd);
    float mp = u_vig_midpoint/100.0;
    float fw = u_vig_feather/100.0 * 0.5 + 0.01;
    float vmask = 1.0 - smoothstep(mp-fw, mp+fw, vd_px);
    float va = u_vig_amount/100.0;
    if (va < 0.0) c = c * (1.0 + va*(1.0-vmask)); // darken
    else          c = c + (1.0-c)*va*(1.0-vmask);  // lighten (rare)
  }

  // 17. Grain (UV hash — deterministic, no Date.now() needed)
  if (u_grain_amount > 0.001) {
    float ga = u_grain_amount/100.0;
    float gs = max(1.0, u_grain_size);
    vec2 img_sz = vec2(textureSize(u_image, 0));
    vec2 gp = floor(v_uv * img_sz / gs);
    float g_mono = hash21(gp) - 0.5;
    vec3 g_rgb = vec3(hash21(gp+0.1), hash21(gp+0.2), hash21(gp+0.3)) - 0.5;
    vec3 gnoise = mix(vec3(g_mono), g_rgb, u_grain_rough/100.0);
    float gl = dot(c, vec3(0.2126,0.7152,0.0722));
    float glum_scale = 4.0*gl*(1.0-gl); // peak in midtones
    c += gnoise * ga * 0.12 * glum_scale;
  }

  // 18. Output: linear → sRGB display
  fragColor = vec4(linear_to_srgb(c), px.a);
}`;

// ── Types ─────────────────────────────────────────────────────

export interface ToneCurveLUTs {
  master: Float32Array; // 256 values → packed into .a
  r:      Float32Array; // → .r
  g:      Float32Array; // → .g
  b:      Float32Array; // → .b
}

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
  temp: number; tint: number;
  exposure: number; contrast: number;
  highlights: number; shadows: number; whites: number; blacks: number;
  texture: number; clarity: number; dehaze: number; vibrance: number; saturation: number;
}
export interface LabParams  { L: number; A: number; B: number; }
export interface HsvParams  { hue: number; saturation: number; value: number; }
export interface ColorChannel { hue: number; sat: number; lum: number; }

export interface ColorGradingZone { hue: number; sat: number; lum: number; }
export interface ColorGradingParams {
  shadows:    ColorGradingZone;
  midtones:   ColorGradingZone;
  highlights: ColorGradingZone;
  blend:   number; // 0-100
  balance: number; // -100 to +100
}

export interface VignetteParams {
  amount: number; midpoint: number; feather: number; roundness: number;
}
export interface GrainParams {
  amount: number; size: number; roughness: number;
}
export interface CalibrationParams {
  shadowTint: number;
  redHue: number;   redSat: number;
  greenHue: number; greenSat: number;
  blueHue: number;  blueSat: number;
}

export interface AllParams {
  basic:        BasicParams;
  lab:          LabParams;
  hsv:          HsvParams;
  colorMixer:   ColorChannel[];
  colorGrading: ColorGradingParams;
  vignette:     VignetteParams;
  grain:        GrainParams;
  calibration:  CalibrationParams;
}

// ── Internal ─────────────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(`Shader: ${gl.getShaderInfoLog(s)}`);
  return s;
}

function identityLUT(): Float32Array {
  const d = new Float32Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    d[i*4]=v; d[i*4+1]=v; d[i*4+2]=v; d[i*4+3]=v;
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
    throw new Error(`Link: ${gl.getProgramInfoLog(prog)}`);
  gl.useProgram(prog);

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a_position");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const imageTexture = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, imageTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const toneCurveTex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, toneCurveTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 256, 1, 0, gl.RGBA, gl.FLOAT, identityLUT());

  const uniformNames = [
    "u_image","u_tone_curve","u_linear_in",
    "u_temp","u_tint",
    "u_cal_sh_tint","u_cal_r_hue","u_cal_r_sat","u_cal_g_hue","u_cal_g_sat","u_cal_b_hue","u_cal_b_sat",
    "u_exposure","u_contrast","u_highlights","u_shadows","u_whites","u_blacks",
    "u_texture","u_clarity","u_dehaze","u_vibrance","u_pres_sat",
    "u_L","u_A","u_B",
    "u_hue","u_saturation","u_value",
    "u_cm_hue","u_cm_sat","u_cm_lum",
    "u_cg_sh_hue","u_cg_sh_sat","u_cg_sh_lum",
    "u_cg_mid_hue","u_cg_mid_sat","u_cg_mid_lum",
    "u_cg_hi_hue","u_cg_hi_sat","u_cg_hi_lum",
    "u_cg_blend","u_cg_balance",
    "u_vig_amount","u_vig_midpoint","u_vig_feather","u_vig_roundness",
    "u_grain_amount","u_grain_size","u_grain_rough",
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
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, imageData);
    return { ...state, texWidth: w, texHeight: h, linearIn: true };
  }
  if (imageData instanceof HTMLImageElement) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
    return { ...state, texWidth: imageData.naturalWidth, texHeight: imageData.naturalHeight, linearIn: false };
  }
  const id = imageData as globalThis.ImageData;
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, id);
  return { ...state, texWidth: id.width, texHeight: id.height, linearIn: false };
}

export function updateToneCurveLUT(state: GlState, luts: ToneCurveLUTs): void {
  const { gl, toneCurveTex } = state;
  const data = new Float32Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    data[i*4]   = luts.r[i];
    data[i*4+1] = luts.g[i];
    data[i*4+2] = luts.b[i];
    data[i*4+3] = luts.master[i];
  }
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, toneCurveTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.FLOAT, data);
}

export function render(state: GlState, params: AllParams): void {
  const { gl, uniforms, vao, texWidth, texHeight } = state;
  if (texWidth === 0) return;

  gl.canvas.width = texWidth; gl.canvas.height = texHeight;
  gl.viewport(0, 0, texWidth, texHeight);

  const { basic, lab, hsv, colorMixer, colorGrading: cg, vignette: vig, grain, calibration: cal } = params;

  gl.uniform1f(uniforms["u_linear_in"],  state.linearIn ? 1.0 : 0.0);
  gl.uniform1f(uniforms["u_temp"],       basic.temp);
  gl.uniform1f(uniforms["u_tint"],       basic.tint);
  gl.uniform1f(uniforms["u_cal_sh_tint"],cal.shadowTint);
  gl.uniform1f(uniforms["u_cal_r_hue"],  cal.redHue);
  gl.uniform1f(uniforms["u_cal_r_sat"],  cal.redSat);
  gl.uniform1f(uniforms["u_cal_g_hue"],  cal.greenHue);
  gl.uniform1f(uniforms["u_cal_g_sat"],  cal.greenSat);
  gl.uniform1f(uniforms["u_cal_b_hue"],  cal.blueHue);
  gl.uniform1f(uniforms["u_cal_b_sat"],  cal.blueSat);
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
  gl.uniform1fv(uniforms["u_cm_hue"], new Float32Array(colorMixer.map(c => c.hue)));
  gl.uniform1fv(uniforms["u_cm_sat"], new Float32Array(colorMixer.map(c => c.sat)));
  gl.uniform1fv(uniforms["u_cm_lum"], new Float32Array(colorMixer.map(c => c.lum)));
  gl.uniform1f(uniforms["u_cg_sh_hue"],  cg.shadows.hue);
  gl.uniform1f(uniforms["u_cg_sh_sat"],  cg.shadows.sat);
  gl.uniform1f(uniforms["u_cg_sh_lum"],  cg.shadows.lum);
  gl.uniform1f(uniforms["u_cg_mid_hue"], cg.midtones.hue);
  gl.uniform1f(uniforms["u_cg_mid_sat"], cg.midtones.sat);
  gl.uniform1f(uniforms["u_cg_mid_lum"], cg.midtones.lum);
  gl.uniform1f(uniforms["u_cg_hi_hue"],  cg.highlights.hue);
  gl.uniform1f(uniforms["u_cg_hi_sat"],  cg.highlights.sat);
  gl.uniform1f(uniforms["u_cg_hi_lum"],  cg.highlights.lum);
  gl.uniform1f(uniforms["u_cg_blend"],   cg.blend);
  gl.uniform1f(uniforms["u_cg_balance"], cg.balance);
  gl.uniform1f(uniforms["u_vig_amount"],    vig.amount);
  gl.uniform1f(uniforms["u_vig_midpoint"],  vig.midpoint);
  gl.uniform1f(uniforms["u_vig_feather"],   vig.feather);
  gl.uniform1f(uniforms["u_vig_roundness"], vig.roundness);
  gl.uniform1f(uniforms["u_grain_amount"], grain.amount);
  gl.uniform1f(uniforms["u_grain_size"],   grain.size);
  gl.uniform1f(uniforms["u_grain_rough"],  grain.roughness);

  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, state.imageTexture);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, state.toneCurveTex);
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

export function readPixels(state: GlState): Float32Array {
  const { gl, texWidth, texHeight } = state;
  const buf = new Float32Array(texWidth * texHeight * 4);
  gl.readPixels(0, 0, texWidth, texHeight, gl.RGBA, gl.FLOAT, buf);
  return buf;
}
