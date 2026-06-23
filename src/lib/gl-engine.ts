"use client";
import type { CubeLUT } from "./lut";

const VERT_SRC = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() { v_uv = a_position*0.5+0.5; gl_Position = vec4(a_position,0,1); }`;

const FRAG_SRC = `#version 300 es
precision highp float;
precision mediump sampler3D;
in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_image;
uniform sampler2D u_tone_curve;  // 256×1 RGBA: R=r G=g B=b A=master
uniform sampler3D u_lut_3d;
uniform float u_linear_in;
uniform float u_lut_strength;    // 0-1

// White Balance
uniform float u_temp; uniform float u_tint;

// Calibration
uniform float u_cal_sh_tint;
uniform float u_cal_r_hue; uniform float u_cal_r_sat;
uniform float u_cal_g_hue; uniform float u_cal_g_sat;
uniform float u_cal_b_hue; uniform float u_cal_b_sat;

// Tone
uniform float u_exposure; uniform float u_contrast;
uniform float u_highlights; uniform float u_shadows;
uniform float u_whites; uniform float u_blacks;

// Presence
uniform float u_texture; uniform float u_clarity; uniform float u_dehaze;
uniform float u_vibrance; uniform float u_pres_sat;

// Detail
uniform float u_sharp_amount; uniform float u_sharp_radius; uniform float u_sharp_detail;
uniform float u_nr_lum; uniform float u_nr_color;

// LAB
uniform float u_L; uniform float u_A; uniform float u_B;

// Global HSV
uniform float u_hue; uniform float u_saturation; uniform float u_value;

// Color Mixer
uniform float u_cm_hue[8]; uniform float u_cm_sat[8]; uniform float u_cm_lum[8];

// Color Grading
uniform float u_cg_sh_hue;  uniform float u_cg_sh_sat;  uniform float u_cg_sh_lum;
uniform float u_cg_mid_hue; uniform float u_cg_mid_sat; uniform float u_cg_mid_lum;
uniform float u_cg_hi_hue;  uniform float u_cg_hi_sat;  uniform float u_cg_hi_lum;
uniform float u_cg_blend; uniform float u_cg_balance;

// Vignette
uniform float u_vig_amount; uniform float u_vig_midpoint;
uniform float u_vig_feather; uniform float u_vig_roundness;

// Grain
uniform float u_grain_amount; uniform float u_grain_size; uniform float u_grain_rough;

// Luminance-based Saturation
uniform float u_lum_sat_sh; uniform float u_lum_sat_mid; uniform float u_lum_sat_hi;

// Halation
uniform float u_halation_amount; uniform float u_halation_radius;

// Mask (single layer; Wave D)
// type: 0=none 1=linear_gradient 2=radial_gradient 3=lum_range 4=color_range
uniform int   u_mask_type;
uniform float u_mask_invert;
uniform vec4  u_mask_p0; // type-specific params set A
uniform vec4  u_mask_p1; // type-specific params set B
// Mask adjustments (differential)
uniform float u_mask_exposure; uniform float u_mask_contrast;
uniform float u_mask_highlights; uniform float u_mask_shadows;
uniform float u_mask_sat; uniform float u_mask_temp; uniform float u_mask_tint;

// ── Helpers ──────────────────────────────────────────────────

vec3 srgb_to_linear(vec3 c){
  return vec3(
    c.r<=0.04045?c.r/12.92:pow((c.r+0.055)/1.055,2.4),
    c.g<=0.04045?c.g/12.92:pow((c.g+0.055)/1.055,2.4),
    c.b<=0.04045?c.b/12.92:pow((c.b+0.055)/1.055,2.4));
}
vec3 linear_to_srgb(vec3 c){
  c=clamp(c,0.,1.);
  return vec3(
    c.r<=0.0031308?c.r*12.92:1.055*pow(c.r,1./2.4)-0.055,
    c.g<=0.0031308?c.g*12.92:1.055*pow(c.g,1./2.4)-0.055,
    c.b<=0.0031308?c.b*12.92:1.055*pow(c.b,1./2.4)-0.055);
}
vec3 lin_to_xyz(vec3 c){return mat3(0.4124564,0.3575761,0.1804375,0.2126729,0.7151522,0.0721750,0.0193339,0.1191920,0.9503041)*c;}
vec3 xyz_to_lin(vec3 x){return mat3(3.2404542,-1.5371385,-0.4985314,-0.9692660,1.8760108,0.0415560,0.0556434,-0.2040259,1.0572252)*x;}
float fl(float t){float d=6./29.;return t>d*d*d?pow(t,1./3.):t/(3.*d*d)+4./29.;}
float fi(float t){float d=6./29.;return t>d?t*t*t:3.*d*d*(t-4./29.);}
vec3 xyz_to_lab(vec3 xyz){vec3 n=xyz/vec3(0.95047,1.,1.08883);float fx=fl(n.x),fy=fl(n.y),fz=fl(n.z);return vec3(116.*fy-16.,500.*(fx-fy),200.*(fy-fz));}
vec3 lab_to_xyz(vec3 lab){float fy=(lab.x+16.)/116.,fx=lab.y/500.+fy,fz=fy-lab.z/200.;return vec3(0.95047*fi(fx),fi(fy),1.08883*fi(fz));}
vec3 rgb_to_hsv(vec3 c){float mx=max(c.r,max(c.g,c.b)),mn=min(c.r,min(c.g,c.b)),d=mx-mn;float h=0.;if(d>0.){if(mx==c.r)h=mod((c.g-c.b)/d,6.);else if(mx==c.g)h=(c.b-c.r)/d+2.;else h=(c.r-c.g)/d+4.;h/=6.;}return vec3(h,mx>0.?d/mx:0.,mx);}
vec3 hsv_to_rgb(vec3 h){float hh=h.x*6.,s=h.y,v=h.z,c=v*s,x=c*(1.-abs(mod(hh,2.)-1.)),m=v-c;vec3 r;if(hh<1.)r=vec3(c,x,0);else if(hh<2.)r=vec3(x,c,0);else if(hh<3.)r=vec3(0,c,x);else if(hh<4.)r=vec3(0,x,c);else if(hh<5.)r=vec3(x,0,c);else r=vec3(c,0,x);return r+m;}
float hash21(vec2 p){p=fract(p*vec2(234.34,435.346));p+=dot(p,p+34.23);return fract(p.x*p.y);}

// Inline full tone+color pipeline for a given c (used by mask)
vec3 apply_wb_cal(vec3 c, float temp, float tint) {
  c.r*=(1.+temp/100.*.25); c.b*=(1.-temp/100.*.25);
  c.g*=(1.-tint/100.*.15); c.r*=(1.+tint/100.*.05); c.b*=(1.+tint/100.*.05);
  return max(c,0.);
}
vec3 apply_exposure_tone(vec3 c, float exposure, float contrast, float highlights, float shadows, float whites, float blacks) {
  c*=pow(2.,exposure);
  float bk=blacks/100.*.08, wh=1.+whites/100.*.08;
  c=(c-bk)/max(wh-bk,0.01);
  float luma=dot(c,vec3(0.2126,0.7152,0.0722));
  float hi_m=smoothstep(0.45,0.95,luma), lo_m=1.-smoothstep(0.05,0.55,luma);
  c+=c*hi_m*(highlights/100.*.6);
  c+=(c*.5+vec3(0.04))*lo_m*(shadows/100.*.5);
  c=0.18+(c-0.18)*(1.+contrast/100.);
  return c;
}

// ── Main ─────────────────────────────────────────────────────

void main() {
  vec4 px = texture(u_image, v_uv);
  vec3 c = px.rgb;

  // 0. Linearize
  if(u_linear_in<0.5) c=srgb_to_linear(c);

  // 1. White Balance
  c=apply_wb_cal(c, u_temp, u_tint);

  // 2. Calibration
  float cal_luma=dot(c,vec3(0.2126,0.7152,0.0722));
  float sh_cal_m=1.-smoothstep(0.,0.35,cal_luma);
  float st=u_cal_sh_tint/100.;
  c.g+=st*.05*sh_cal_m; c.r-=st*.025*sh_cal_m; c.b-=st*.025*sh_cal_m;
  if(abs(u_cal_r_hue)+abs(u_cal_r_sat)+abs(u_cal_g_hue)+abs(u_cal_g_sat)+abs(u_cal_b_hue)+abs(u_cal_b_sat)>0.001){
    const float CHW=0.25;
    vec3 cv=rgb_to_hsv(c);
    float rw=max(1.-smoothstep(0.,CHW,cv.x),1.-smoothstep(0.85,1.,cv.x));
    float gw=1.-smoothstep(0.,CHW,abs(fract(cv.x-.333+.5)-.5));
    float bw=1.-smoothstep(0.,CHW,abs(fract(cv.x-.667+.5)-.5));
    cv.x=fract(cv.x+(u_cal_r_hue*rw+u_cal_g_hue*gw+u_cal_b_hue*bw)/100.*(30./360.));
    cv.y=clamp(cv.y+(u_cal_r_sat*rw+u_cal_g_sat*gw+u_cal_b_sat*bw)/100.,0.,1.);
    c=hsv_to_rgb(cv);
  }

  // 3-6. Exposure / Blacks-Whites / Hi-Shadows / Contrast
  c=apply_exposure_tone(c, u_exposure, u_contrast, u_highlights, u_shadows, u_whites, u_blacks);

  // 7. Dehaze (approx)
  if(abs(u_dehaze)>0.001){
    float dh=u_dehaze/100., dl=dot(c,vec3(0.2126,0.7152,0.0722));
    c/=max(1.-dh*(1.-dl)*.6,0.01); c.r+=dh*.015; c.b-=dh*.025;
  }

  // 8. Clarity (midtone contrast approx)
  if(abs(u_clarity)>0.001){
    float cl=u_clarity/100., cl_l=clamp(dot(c,vec3(0.2126,0.7152,0.0722)),0.,1.);
    float mid=smoothstep(.1,.5,cl_l)*(1.-smoothstep(.5,.9,cl_l));
    c=mix(c,.5+(c-.5)*(1.+cl*.8),mid*abs(cl)*2.);
  }

  // 9. Texture + Sharpening (neighbor USM; true = Gaussian blur pass)
  if(abs(u_texture)>0.001 || u_sharp_amount>0.001){
    vec2 ts=vec2(1.)/vec2(textureSize(u_image,0));
    float sr=max(u_sharp_radius,0.5);
    vec3 blur_s=vec3(0.); float w_s=0.;
    for(int dy=-1;dy<=1;dy++){for(int dx=-1;dx<=1;dx++){
      vec3 nb=texture(u_image,v_uv+vec2(float(dx),float(dy))*ts*sr).rgb;
      if(u_linear_in<0.5) nb=srgb_to_linear(nb);
      float ww=dx==0&&dy==0?4.:1.; blur_s+=nb*ww; w_s+=ww;
    }}
    vec3 blurred=blur_s/w_s;
    // Texture (fine local contrast)
    if(abs(u_texture)>0.001) c+=(c-blurred)*(u_texture/100.*1.5);
    // Sharpening (edge-masked USM)
    if(u_sharp_amount>0.001){
      float edge=abs(dot(c,vec3(0.2126,0.7152,0.0722))-dot(blurred,vec3(0.2126,0.7152,0.0722)));
      float detail_thr=u_sharp_detail/100.*.05;
      float sh_m=smoothstep(0.,detail_thr,edge);
      c+=(c-blurred)*(u_sharp_amount/100.*2.)*sh_m;
    }
  }

  // 10. Noise Reduction (bilateral 3×3; true = FBO blur pass)
  if(u_nr_lum>0.001 || u_nr_color>0.001){
    vec2 ts=vec2(1.)/vec2(textureSize(u_image,0));
    float sigma_l=max(u_nr_lum/100.*.12,0.001);
    vec3 nr_sum=vec3(0.); float nr_w=0.;
    for(int dy=-1;dy<=1;dy++){for(int dx=-1;dx<=1;dx++){
      vec2 off=vec2(float(dx),float(dy))*ts;
      vec3 nb=texture(u_image,v_uv+off).rgb;
      if(u_linear_in<0.5) nb=srgb_to_linear(nb);
      float d2=float(dx*dx+dy*dy);
      float ld=abs(dot(c,vec3(0.2126,0.7152,0.0722))-dot(nb,vec3(0.2126,0.7152,0.0722)));
      float w=exp(-d2/(2.*1.5*1.5)-ld*ld/(2.*sigma_l*sigma_l));
      nr_sum+=nb*w; nr_w+=w;
    }}
    vec3 nr_out=nr_sum/nr_w;
    // Luminance NR
    float luma_c=dot(c,vec3(0.2126,0.7152,0.0722));
    float luma_nr=dot(nr_out,vec3(0.2126,0.7152,0.0722));
    c=mix(c, c+(nr_out-c)*vec3(0.2126,0.7152,0.0722).r, u_nr_lum/100.*.8);
    // Simplified: blend full
    vec3 c_lum_only=c*(luma_nr/max(luma_c,0.001));
    c=mix(c, mix(c,nr_out,u_nr_color/100.*.5), u_nr_color/100.*.5);
    c=mix(c,c_lum_only,u_nr_lum/100.*.3);
  }

  // 11. Tone Curve (master→.a, per-channel→.rgb, 2-pass)
  c=clamp(c,0.,1.);
  vec3 cm_tc;
  cm_tc.r=texture(u_tone_curve,vec2(c.r,.5)).a;
  cm_tc.g=texture(u_tone_curve,vec2(c.g,.5)).a;
  cm_tc.b=texture(u_tone_curve,vec2(c.b,.5)).a;
  c.r=texture(u_tone_curve,vec2(cm_tc.r,.5)).r;
  c.g=texture(u_tone_curve,vec2(cm_tc.g,.5)).g;
  c.b=texture(u_tone_curve,vec2(cm_tc.b,.5)).b;

  // 12. Presence: Saturation + Vibrance
  if(abs(u_pres_sat)+abs(u_vibrance)>0.001){
    vec3 hp=rgb_to_hsv(c);
    hp.y=clamp(hp.y+u_pres_sat/100.,0.,1.);
    if(abs(u_vibrance)>0.001){
      float sd=abs(fract(hp.x-.069+.5)-.5);
      float sp=1.-smoothstep(0.,.083,sd);
      float vs=(1.-hp.y*.6)*(1.-sp*.7);
      hp.y=clamp(hp.y+u_vibrance/100.*vs,0.,1.);
    }
    c=hsv_to_rgb(hp);
  }

  // 13. LAB
  vec3 lab=xyz_to_lab(lin_to_xyz(c));
  lab.x=clamp(lab.x+u_L,0.,100.); lab.y=clamp(lab.y+u_A,-128.,127.); lab.z=clamp(lab.z+u_B,-128.,127.);
  c=clamp(xyz_to_lin(lab_to_xyz(lab)),0.,1.);

  // 14. Global HSV
  vec3 hsv=rgb_to_hsv(c);
  hsv.x=fract(hsv.x+u_hue/360.);
  hsv.y=clamp(hsv.y+u_saturation/100.,0.,1.);
  hsv.z=clamp(hsv.z+u_value/100.,0.,1.);
  c=hsv_to_rgb(hsv);

  // 14.5. Luminance-based Saturation
  if(abs(u_lum_sat_sh)+abs(u_lum_sat_mid)+abs(u_lum_sat_hi)>0.001){
    float lbs_lm=dot(c,vec3(0.2126,0.7152,0.0722));
    float sh_wt=1.-smoothstep(0.,0.35,lbs_lm);
    float hi_wt=smoothstep(0.65,1.,lbs_lm);
    float mid_wt=max(0.,1.-sh_wt-hi_wt);
    float sdelta=(u_lum_sat_sh*sh_wt+u_lum_sat_mid*mid_wt+u_lum_sat_hi*hi_wt)/100.;
    vec3 lbs_h=rgb_to_hsv(c); lbs_h.y=clamp(lbs_h.y+sdelta,0.,1.); c=hsv_to_rgb(lbs_h);
  }

  // 15. Color Mixer
  const float HW=0.0833;
  hsv=rgb_to_hsv(c);
  float hd=0.,sd=0.,vd=0.;
  float ctr[8]; ctr[0]=0.;ctr[1]=0.0833;ctr[2]=0.1667;ctr[3]=0.3333;ctr[4]=0.5;ctr[5]=0.6667;ctr[6]=0.75;ctr[7]=0.8333;
  for(int i=0;i<8;i++){
    float dist=abs(fract(hsv.x-ctr[i]+.5)-.5), w=1.-smoothstep(0.,HW,dist), sa=u_cm_sat[i]/100.*w;
    hd+=u_cm_hue[i]/100.*(45./360.)*w; sd+=sa; vd+=(u_cm_lum[i]/100.-sa*.3)*w;
  }
  hsv.x=fract(hsv.x+hd); hsv.y=clamp(hsv.y+sd,0.,1.); hsv.z=clamp(hsv.z+vd,0.,1.);
  c=hsv_to_rgb(hsv);

  // 16. Color Grading (3-way LAB)
  if(abs(u_cg_sh_sat)+abs(u_cg_mid_sat)+abs(u_cg_hi_sat)+abs(u_cg_sh_lum)+abs(u_cg_mid_lum)+abs(u_cg_hi_lum)>0.001){
    vec3 cgl=xyz_to_lab(lin_to_xyz(c));
    float cg_n=cgl.x/100., bw=u_cg_blend/100.*.15+.05, bal=u_cg_balance/100.*.12;
    float sh_m=1.-smoothstep(0.,.3+bw+bal,cg_n), hi_m=smoothstep(.7+bal-bw,1.,cg_n), mid_m=max(0.,1.-sh_m-hi_m);
    const float S=40.;
    vec2 sh_ab=vec2(cos(u_cg_sh_hue*6.2832),sin(u_cg_sh_hue*6.2832))*u_cg_sh_sat*S;
    vec2 mid_ab=vec2(cos(u_cg_mid_hue*6.2832),sin(u_cg_mid_hue*6.2832))*u_cg_mid_sat*S;
    vec2 hi_ab=vec2(cos(u_cg_hi_hue*6.2832),sin(u_cg_hi_hue*6.2832))*u_cg_hi_sat*S;
    cgl.x+=(u_cg_sh_lum/100.*18.)*sh_m+(u_cg_mid_lum/100.*18.)*mid_m+(u_cg_hi_lum/100.*18.)*hi_m;
    cgl.y+=sh_ab.x*sh_m+mid_ab.x*mid_m+hi_ab.x*hi_m;
    cgl.z+=sh_ab.y*sh_m+mid_ab.y*mid_m+hi_ab.y*hi_m;
    cgl=clamp(cgl,vec3(0.,-128.,-128.),vec3(100.,127.,127.));
    c=clamp(xyz_to_lin(lab_to_xyz(cgl)),0.,1.);
  }

  // 17. 3D LUT (creative profile / film emulation)
  if(u_lut_strength>0.001){
    vec3 lut_c=texture(u_lut_3d,c).rgb;
    c=mix(c,lut_c,u_lut_strength);
  }

  // 18. Mask layer (Wave D)
  if(u_mask_type>0){
    float mv=0.;
    if(u_mask_type==1){
      // Linear Gradient: p0=(angle, position, feather, 0)
      vec2 dir=vec2(cos(u_mask_p0.x),sin(u_mask_p0.x));
      float proj=dot(v_uv-0.5,dir)+0.5;
      float fw=max(u_mask_p0.z,0.01);
      mv=smoothstep(u_mask_p0.y-fw,u_mask_p0.y+fw,proj);
    } else if(u_mask_type==2){
      // Radial Gradient: p0=(cx,cy,rx,ry) p1=(feather,...)
      vec2 d=(v_uv-u_mask_p0.xy)/max(u_mask_p0.zw,0.001);
      float r=length(d), fw=max(u_mask_p1.x,0.01);
      mv=1.-smoothstep(1.-fw,1.,r);
    } else if(u_mask_type==3){
      // Luminance Range: p0=(min,max,smooth_lo,smooth_hi)
      float luma_m=dot(c,vec3(0.2126,0.7152,0.0722));
      float lo=smoothstep(u_mask_p0.x-u_mask_p0.z,u_mask_p0.x+u_mask_p0.z,luma_m);
      float hi=1.-smoothstep(u_mask_p0.y-u_mask_p0.w,u_mask_p0.y+u_mask_p0.w,luma_m);
      mv=lo*hi;
    } else if(u_mask_type==4){
      // Color Range: p0=(hue_center, hue_width, sat_min, sat_max)
      vec3 mhsv=rgb_to_hsv(c);
      float hdist=abs(fract(mhsv.x-u_mask_p0.x+.5)-.5);
      float hw=smoothstep(u_mask_p0.y,u_mask_p0.y*.5,hdist);
      float sw=smoothstep(u_mask_p0.z,u_mask_p0.z+.1,mhsv.y)*smoothstep(u_mask_p0.w+.1,u_mask_p0.w,mhsv.y);
      mv=hw*sw;
    }
    if(u_mask_invert>0.5) mv=1.-mv;

    // Compute adjusted version of c
    vec3 c_adj=c;
    // WB delta
    if(abs(u_mask_temp)+abs(u_mask_tint)>0.001){
      vec3 c_wbadj=apply_wb_cal(c_adj,u_mask_temp,u_mask_tint);
      c_adj=mix(c_adj,c_wbadj,1.0);
    }
    // Exposure + tone delta
    vec3 c_tone=apply_exposure_tone(c_adj,u_mask_exposure,u_mask_contrast,u_mask_highlights,u_mask_shadows,0.,0.);
    c_adj=mix(c_adj,c_tone,1.0);
    // Saturation delta
    if(abs(u_mask_sat)>0.001){
      vec3 madj_hsv=rgb_to_hsv(c_adj);
      madj_hsv.y=clamp(madj_hsv.y+u_mask_sat/100.,0.,1.);
      c_adj=hsv_to_rgb(madj_hsv);
    }
    // Blend with mask weight
    c=mix(c,c_adj,mv);
  }

  // 18.5. Halation (warm light bleed around highlight areas, simulates film)
  if(u_halation_amount>0.001){
    vec2 hts=vec2(1.)/vec2(textureSize(u_image,0));
    float hr=u_halation_radius;
    vec3 hbloom=vec3(0.); float hbw=0.;
    for(int hdy=-1;hdy<=1;hdy++){for(int hdx=-1;hdx<=1;hdx++){
      vec3 hnb=texture(u_image,clamp(v_uv+vec2(float(hdx),float(hdy))*hts*hr,0.,1.)).rgb;
      if(u_linear_in<0.5) hnb=srgb_to_linear(hnb);
      float hlum=dot(hnb,vec3(0.2126,0.7152,0.0722));
      float hw=smoothstep(0.5,1.,hlum); hbloom+=hnb*hw; hbw+=hw;
    }}
    if(hbw>0.001){
      hbloom/=hbw;
      hbloom=vec3(hbloom.r*1.3,hbloom.g*0.85,hbloom.b*0.4);
      c+=hbloom*(u_halation_amount/100.)*0.8;
      c=clamp(c,0.,1.);
    }
  }

  // 19. Vignette
  if(abs(u_vig_amount)>0.001){
    vec2 vu=(v_uv-.5)*2.;
    float rnd=(u_vig_roundness/100.)*.8+1.2;
    float vd=pow(pow(abs(vu.x),rnd)+pow(abs(vu.y),rnd),1./rnd);
    float mp=u_vig_midpoint/100., fw=u_vig_feather/100.*.5+0.01;
    float vmask=1.-smoothstep(mp-fw,mp+fw,vd);
    float va=u_vig_amount/100.;
    if(va<0.) c=c*(1.+va*(1.-vmask)); else c=c+(1.-c)*va*(1.-vmask);
  }

  // 20. Grain
  if(u_grain_amount>0.001){
    float ga=u_grain_amount/100., gs=max(1.,u_grain_size);
    vec2 gp=floor(v_uv*vec2(textureSize(u_image,0))/gs);
    float g_mono=hash21(gp)-.5;
    vec3 g_rgb=vec3(hash21(gp+.1),hash21(gp+.2),hash21(gp+.3))-.5;
    vec3 gnoise=mix(vec3(g_mono),g_rgb,u_grain_rough/100.);
    float gl2=dot(c,vec3(0.2126,0.7152,0.0722));
    c+=gnoise*ga*.12*4.*gl2*(1.-gl2);
  }

  // 21. Output: linear → sRGB
  fragColor=vec4(linear_to_srgb(c),px.a);
}`;

// ── Types ─────────────────────────────────────────────────────

export interface ToneCurveLUTs {
  master: Float32Array; r: Float32Array; g: Float32Array; b: Float32Array;
}
export interface BasicParams {
  temp: number; tint: number;
  exposure: number; contrast: number;
  highlights: number; shadows: number; whites: number; blacks: number;
  texture: number; clarity: number; dehaze: number; vibrance: number; saturation: number;
}
export interface DetailParams {
  sharpAmount: number;   // 0-150
  sharpRadius: number;   // 0.5-3.0
  sharpDetail: number;   // 0-100
  nrLum:   number;       // 0-100
  nrColor: number;       // 0-100
}
export interface LabParams  { L: number; A: number; B: number; }
export interface HsvParams  { hue: number; saturation: number; value: number; }
export interface ColorChannel { hue: number; sat: number; lum: number; }
export interface ColorGradingZone { hue: number; sat: number; lum: number; }
export interface ColorGradingParams {
  shadows: ColorGradingZone; midtones: ColorGradingZone; highlights: ColorGradingZone;
  blend: number; balance: number;
}
export interface VignetteParams { amount: number; midpoint: number; feather: number; roundness: number; }
export interface GrainParams    { amount: number; size: number; roughness: number; }
export interface HalationParams { amount: number; radius: number; }
export interface LumSatParams   { shadows: number; midtones: number; highlights: number; }
export interface CalibrationParams {
  shadowTint: number;
  redHue: number; redSat: number; greenHue: number; greenSat: number; blueHue: number; blueSat: number;
}

// Mask
export type MaskType = "none" | "linear_gradient" | "radial_gradient" | "lum_range" | "color_range";
export interface MaskParams {
  type:       MaskType;
  invert:     boolean;
  // Linear gradient: angle(rad), position(0-1), feather(0-1)
  // Radial gradient: cx, cy, rx, ry, feather
  // Lum range:       min, max, smooth_lo, smooth_hi (all 0-1)
  // Color range:     hue_center(0-1), hue_width(0-1), sat_min(0-1), sat_max(0-1)
  p0:  [number, number, number, number];
  p1:  [number, number, number, number];
  // Adjustments
  exposure:   number;
  contrast:   number;
  highlights: number;
  shadows:    number;
  sat:        number;
  temp:       number;
  tint:       number;
}

export interface AllParams {
  basic:        BasicParams;
  detail:       DetailParams;
  lab:          LabParams;
  hsv:          HsvParams;
  colorMixer:   ColorChannel[];
  colorGrading: ColorGradingParams;
  vignette:     VignetteParams;
  grain:        GrainParams;
  calibration:  CalibrationParams;
  mask:         MaskParams;
  lutStrength:  number;  // 0-1
  halation:     HalationParams;
  lumSat:       LumSatParams;
}

export interface GlState {
  gl:           WebGL2RenderingContext;
  program:      WebGLProgram;
  imageTexture: WebGLTexture;
  toneCurveTex: WebGLTexture;
  lut3dTex:     WebGLTexture;
  vao:          WebGLVertexArrayObject;
  uniforms:     Record<string, WebGLUniformLocation | null>;
  texWidth:     number;
  texHeight:    number;
  linearIn:     boolean;
}

// ── Internal ──────────────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(`Shader: ${gl.getShaderInfoLog(s)}`);
  return s;
}
function identityLUT(): Float32Array {
  const d = new Float32Array(256*4);
  for (let i=0;i<256;i++){const v=i/255;d[i*4]=v;d[i*4+1]=v;d[i*4+2]=v;d[i*4+3]=v;}
  return d;
}
function identityLUT3D(size=2): Float32Array {
  const d = new Float32Array(size*size*size*3);
  let k=0;
  for (let b=0;b<size;b++) for(let g=0;g<size;g++) for(let r=0;r<size;r++) {
    d[k++]=r/(size-1); d[k++]=g/(size-1); d[k++]=b/(size-1);
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
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`Link: ${gl.getProgramInfoLog(prog)}`);
  gl.useProgram(prog);

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog,"a_position");
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);

  // Image texture (unit 0)
  const imageTexture = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,imageTexture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);

  // Tone curve LUT (unit 1, 256×1 RGBA32F)
  const toneCurveTex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,toneCurveTex);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,256,1,0,gl.RGBA,gl.FLOAT,identityLUT());

  // 3D LUT texture (unit 2, 2×2×2 identity default)
  const lut3dTex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_3D,lut3dTex);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE);
  gl.texImage3D(gl.TEXTURE_3D,0,gl.RGB32F,2,2,2,0,gl.RGB,gl.FLOAT,identityLUT3D(2));

  const uniformNames = [
    "u_image","u_tone_curve","u_lut_3d","u_linear_in","u_lut_strength",
    "u_temp","u_tint",
    "u_cal_sh_tint","u_cal_r_hue","u_cal_r_sat","u_cal_g_hue","u_cal_g_sat","u_cal_b_hue","u_cal_b_sat",
    "u_exposure","u_contrast","u_highlights","u_shadows","u_whites","u_blacks",
    "u_texture","u_clarity","u_dehaze","u_vibrance","u_pres_sat",
    "u_sharp_amount","u_sharp_radius","u_sharp_detail","u_nr_lum","u_nr_color",
    "u_L","u_A","u_B","u_hue","u_saturation","u_value",
    "u_cm_hue","u_cm_sat","u_cm_lum",
    "u_cg_sh_hue","u_cg_sh_sat","u_cg_sh_lum",
    "u_cg_mid_hue","u_cg_mid_sat","u_cg_mid_lum",
    "u_cg_hi_hue","u_cg_hi_sat","u_cg_hi_lum","u_cg_blend","u_cg_balance",
    "u_vig_amount","u_vig_midpoint","u_vig_feather","u_vig_roundness",
    "u_grain_amount","u_grain_size","u_grain_rough",
    "u_mask_type","u_mask_invert","u_mask_p0","u_mask_p1",
    "u_mask_exposure","u_mask_contrast","u_mask_highlights","u_mask_shadows","u_mask_sat","u_mask_temp","u_mask_tint",
    "u_lum_sat_sh","u_lum_sat_mid","u_lum_sat_hi",
    "u_halation_amount","u_halation_radius",
  ];
  const uniforms: Record<string,WebGLUniformLocation|null> = {};
  for (const n of uniformNames) uniforms[n] = gl.getUniformLocation(prog,n);

  gl.uniform1i(uniforms["u_image"],0);
  gl.uniform1i(uniforms["u_tone_curve"],1);
  gl.uniform1i(uniforms["u_lut_3d"],2);
  gl.uniform1f(uniforms["u_linear_in"],0);
  gl.uniform1f(uniforms["u_lut_strength"],0);
  gl.uniform1i(uniforms["u_mask_type"],0);

  return { gl, program:prog, imageTexture, toneCurveTex, lut3dTex, vao, uniforms, texWidth:0, texHeight:0, linearIn:false };
}

export function uploadTexture(
  state: GlState,
  imageData: globalThis.ImageData | HTMLImageElement | Float32Array,
  w?: number, h?: number
): GlState {
  const { gl, imageTexture } = state;
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,imageTexture);
  if (imageData instanceof Float32Array && w && h) {
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,w,h,0,gl.RGBA,gl.FLOAT,imageData);
    return {...state, texWidth:w, texHeight:h, linearIn:true};
  }
  if (imageData instanceof HTMLImageElement) {
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,imageData);
    return {...state, texWidth:imageData.naturalWidth, texHeight:imageData.naturalHeight, linearIn:false};
  }
  const id = imageData as globalThis.ImageData;
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,id);
  return {...state, texWidth:id.width, texHeight:id.height, linearIn:false};
}

export function updateToneCurveLUT(state: GlState, luts: ToneCurveLUTs): void {
  const { gl, toneCurveTex } = state;
  const data = new Float32Array(256*4);
  for (let i=0;i<256;i++){data[i*4]=luts.r[i];data[i*4+1]=luts.g[i];data[i*4+2]=luts.b[i];data[i*4+3]=luts.master[i];}
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,toneCurveTex);
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,256,1,gl.RGBA,gl.FLOAT,data);
}

export function upload3DLUT(state: GlState, lut: CubeLUT): void {
  const { gl, lut3dTex } = state;
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_3D,lut3dTex);
  gl.texImage3D(gl.TEXTURE_3D,0,gl.RGB32F,lut.size,lut.size,lut.size,0,gl.RGB,gl.FLOAT,lut.data);
}

const MASK_TYPE_INT: Record<MaskType, number> = {
  none:0, linear_gradient:1, radial_gradient:2, lum_range:3, color_range:4,
};

export function render(state: GlState, params: AllParams): void {
  const { gl, program, uniforms, vao, texWidth, texHeight } = state;
  if (texWidth===0) return;
  gl.canvas.width=texWidth; gl.canvas.height=texHeight;
  gl.viewport(0,0,texWidth,texHeight);
  // Re-bind program and sampler units after potential canvas resize state reset
  gl.useProgram(program);
  gl.uniform1i(uniforms["u_image"],0);
  gl.uniform1i(uniforms["u_tone_curve"],1);
  gl.uniform1i(uniforms["u_lut_3d"],2);

  const { basic:b, detail:d, lab, hsv, colorMixer:cm, colorGrading:cg, vignette:vig, grain, calibration:cal, mask, lutStrength, halation, lumSat } = params;

  gl.uniform1f(uniforms["u_linear_in"], state.linearIn?1:0);
  gl.uniform1f(uniforms["u_lut_strength"], lutStrength);
  gl.uniform1f(uniforms["u_temp"],b.temp); gl.uniform1f(uniforms["u_tint"],b.tint);
  gl.uniform1f(uniforms["u_cal_sh_tint"],cal.shadowTint);
  gl.uniform1f(uniforms["u_cal_r_hue"],cal.redHue);   gl.uniform1f(uniforms["u_cal_r_sat"],cal.redSat);
  gl.uniform1f(uniforms["u_cal_g_hue"],cal.greenHue); gl.uniform1f(uniforms["u_cal_g_sat"],cal.greenSat);
  gl.uniform1f(uniforms["u_cal_b_hue"],cal.blueHue);  gl.uniform1f(uniforms["u_cal_b_sat"],cal.blueSat);
  gl.uniform1f(uniforms["u_exposure"],b.exposure); gl.uniform1f(uniforms["u_contrast"],b.contrast);
  gl.uniform1f(uniforms["u_highlights"],b.highlights); gl.uniform1f(uniforms["u_shadows"],b.shadows);
  gl.uniform1f(uniforms["u_whites"],b.whites); gl.uniform1f(uniforms["u_blacks"],b.blacks);
  gl.uniform1f(uniforms["u_texture"],b.texture); gl.uniform1f(uniforms["u_clarity"],b.clarity);
  gl.uniform1f(uniforms["u_dehaze"],b.dehaze); gl.uniform1f(uniforms["u_vibrance"],b.vibrance);
  gl.uniform1f(uniforms["u_pres_sat"],b.saturation);
  gl.uniform1f(uniforms["u_sharp_amount"],d.sharpAmount); gl.uniform1f(uniforms["u_sharp_radius"],d.sharpRadius);
  gl.uniform1f(uniforms["u_sharp_detail"],d.sharpDetail);
  gl.uniform1f(uniforms["u_nr_lum"],d.nrLum); gl.uniform1f(uniforms["u_nr_color"],d.nrColor);
  gl.uniform1f(uniforms["u_L"],lab.L); gl.uniform1f(uniforms["u_A"],lab.A); gl.uniform1f(uniforms["u_B"],lab.B);
  gl.uniform1f(uniforms["u_hue"],hsv.hue); gl.uniform1f(uniforms["u_saturation"],hsv.saturation); gl.uniform1f(uniforms["u_value"],hsv.value);
  gl.uniform1fv(uniforms["u_cm_hue"],new Float32Array(cm.map(c=>c.hue)));
  gl.uniform1fv(uniforms["u_cm_sat"],new Float32Array(cm.map(c=>c.sat)));
  gl.uniform1fv(uniforms["u_cm_lum"],new Float32Array(cm.map(c=>c.lum)));
  gl.uniform1f(uniforms["u_cg_sh_hue"],cg.shadows.hue);    gl.uniform1f(uniforms["u_cg_sh_sat"],cg.shadows.sat);    gl.uniform1f(uniforms["u_cg_sh_lum"],cg.shadows.lum);
  gl.uniform1f(uniforms["u_cg_mid_hue"],cg.midtones.hue);  gl.uniform1f(uniforms["u_cg_mid_sat"],cg.midtones.sat);  gl.uniform1f(uniforms["u_cg_mid_lum"],cg.midtones.lum);
  gl.uniform1f(uniforms["u_cg_hi_hue"],cg.highlights.hue); gl.uniform1f(uniforms["u_cg_hi_sat"],cg.highlights.sat); gl.uniform1f(uniforms["u_cg_hi_lum"],cg.highlights.lum);
  gl.uniform1f(uniforms["u_cg_blend"],cg.blend); gl.uniform1f(uniforms["u_cg_balance"],cg.balance);
  gl.uniform1f(uniforms["u_vig_amount"],vig.amount); gl.uniform1f(uniforms["u_vig_midpoint"],vig.midpoint);
  gl.uniform1f(uniforms["u_vig_feather"],vig.feather); gl.uniform1f(uniforms["u_vig_roundness"],vig.roundness);
  gl.uniform1f(uniforms["u_grain_amount"],grain.amount); gl.uniform1f(uniforms["u_grain_size"],grain.size); gl.uniform1f(uniforms["u_grain_rough"],grain.roughness);
  gl.uniform1i(uniforms["u_mask_type"],MASK_TYPE_INT[mask.type]);
  gl.uniform1f(uniforms["u_mask_invert"],mask.invert?1:0);
  gl.uniform4fv(uniforms["u_mask_p0"],mask.p0);
  gl.uniform4fv(uniforms["u_mask_p1"],mask.p1);
  gl.uniform1f(uniforms["u_mask_exposure"],mask.exposure);
  gl.uniform1f(uniforms["u_mask_contrast"],mask.contrast);
  gl.uniform1f(uniforms["u_mask_highlights"],mask.highlights);
  gl.uniform1f(uniforms["u_mask_shadows"],mask.shadows);
  gl.uniform1f(uniforms["u_mask_sat"],mask.sat);
  gl.uniform1f(uniforms["u_mask_temp"],mask.temp);
  gl.uniform1f(uniforms["u_mask_tint"],mask.tint);
  gl.uniform1f(uniforms["u_lum_sat_sh"],lumSat.shadows);
  gl.uniform1f(uniforms["u_lum_sat_mid"],lumSat.midtones);
  gl.uniform1f(uniforms["u_lum_sat_hi"],lumSat.highlights);
  gl.uniform1f(uniforms["u_halation_amount"],halation.amount);
  gl.uniform1f(uniforms["u_halation_radius"],halation.radius);

  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,state.imageTexture);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,state.toneCurveTex);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_3D,state.lut3dTex);
  gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES,0,6);
}

export function readPixels(state: GlState): Float32Array {
  const { gl, texWidth, texHeight } = state;
  const buf = new Float32Array(texWidth*texHeight*4);
  gl.readPixels(0,0,texWidth,texHeight,gl.RGBA,gl.FLOAT,buf);
  return buf;
}
