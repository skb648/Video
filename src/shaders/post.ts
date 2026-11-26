/**
 * Single full-screen post pass (WebGL2). Deterministic: every random term is an integer hash of
 * (pixel, frame). Bloom uses the texture mip chain (cheap, localised to bright pixels via a threshold).
 * Colour: sample in display space → linearise for bloom/flash → encode back → grade.
 */
import type { PostParams } from "../core/timeline";

const VERT = `#version 300 es
out vec2 vUv;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec2 uShake;
uniform float uFrame, uChroma, uGlitch, uFlash, uGrain, uVig, uBloom, uZoom, uWarp, uFade;

uint pcg(uint v){ uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float h1(uint n){ return float(pcg(n)) / 4294967295.0; }
float h2(vec2 p, float f){ return h1(uint(p.x) * 1973u + uint(p.y) * 9277u + uint(f) * 26699u + 1u); }
vec3 toLin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
vec3 toSrgb(vec3 c){ return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

void main(){
  vec2 c = vUv - 0.5;
  c /= uZoom;
  vec2 cc = c * vec2(1.0, 0.5625);
  c *= 1.0 + uWarp * dot(cc, cc);
  vec2 uv = c + 0.5 + vec2(uShake.x, -uShake.y) / uRes;

  // digital glitch: horizontal band displacement + block tearing
  float fr = floor(uFrame);
  float band = floor(uv.y * 30.0);
  float act = step(1.0 - uGlitch * 0.5, h1(uint(band) * 131u + uint(fr) * 7919u));
  float off = (h1(uint(band) * 313u + uint(fr) * 104729u) - 0.5) * 0.24 * uGlitch * act;
  float fine = floor(uv.y * 240.0);
  float act2 = step(1.0 - uGlitch * 0.12, h1(uint(fine) * 17u + uint(fr) * 31337u));
  off += (h1(uint(fine) * 71u + uint(fr) * 977u) - 0.5) * 0.08 * uGlitch * act2;
  uv.x += off;

  // radial chromatic aberration (+ lateral split inside active glitch bands)
  vec2 d = uv - 0.5;
  vec2 o = d * (0.010 * uChroma) + vec2((act + act2) * uGlitch * 0.010, 0.0);
  vec3 col;
  col.r = textureLod(uTex, uv + o, 0.0).r;
  col.g = textureLod(uTex, uv, 0.0).g;
  col.b = textureLod(uTex, uv - o, 0.0).b;

  // bloom from the mip chain (thresholded, display→linear)
  vec3 b = textureLod(uTex, uv, 1.5).rgb * 0.5 + textureLod(uTex, uv, 3.5).rgb * 0.5;
  vec3 lin = toLin(col) + max(toLin(b) - 0.07, 0.0) * uBloom * 0.9;
  lin = mix(lin, vec3(1.0, 0.93, 0.82), clamp(uFlash, 0.0, 1.0) * 0.9);
  col = toSrgb(lin);

  // grade: gentle S-curve, cool shadows, warm highlights
  vec3 s = col * col * (3.0 - 2.0 * col);
  col = mix(col, s, 0.28);
  col *= mix(vec3(0.985, 0.99, 1.02), vec3(1.02, 1.0, 0.975), smoothstep(0.1, 0.9, dot(col, vec3(0.333))));

  // scanlines only while glitching
  col *= 1.0 - uGlitch * 0.07 * step(0.5, fract(gl_FragCoord.y * 0.5));

  // vignette
  vec2 vv = (vUv - 0.5) * vec2(1.0, 0.72);
  col *= 1.0 - uVig * smoothstep(0.28, 0.82, length(vv));

  // film grain + triangular dither
  float g = h2(gl_FragCoord.xy, uFrame) + h2(gl_FragCoord.xy + 17.0, uFrame * 3.0 + 1.0) - 1.0;
  float lum = dot(col, vec3(0.333));
  col += g * (uGrain * (0.4 + 0.6 * (1.0 - abs(lum * 2.0 - 1.0))) + 1.0 / 255.0);

  col *= 1.0 - clamp(uFade, 0.0, 1.0);
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class PostFX {
  gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private tex: WebGLTexture;
  private u: Record<string, WebGLUniformLocation | null> = {};

  constructor(public canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false, alpha: false, premultipliedAlpha: false });
    if (!gl) throw new Error("WebGL2 is required for the post-processing pass");
    this.gl = gl;
    const mk = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, mk(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link error");
    this.prog = p;
    for (const n of ["uTex", "uRes", "uShake", "uFrame", "uChroma", "uGlitch", "uFlash", "uGrain", "uVig", "uBloom", "uZoom", "uWarp", "uFade"]) this.u[n] = gl.getUniformLocation(p, n);
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  }

  render(src: HTMLCanvasElement, frame: number, p: PostParams) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.generateMipmap(gl.TEXTURE_2D);
    const u = this.u;
    gl.uniform1i(u.uTex, 0);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform2f(u.uShake, p.shake[0], p.shake[1]);
    gl.uniform1f(u.uFrame, frame);
    gl.uniform1f(u.uChroma, p.chroma);
    gl.uniform1f(u.uGlitch, p.glitch);
    gl.uniform1f(u.uFlash, p.flash);
    gl.uniform1f(u.uGrain, p.grain);
    gl.uniform1f(u.uVig, p.vignette);
    gl.uniform1f(u.uBloom, p.bloom);
    gl.uniform1f(u.uZoom, p.zoom);
    gl.uniform1f(u.uWarp, p.warp);
    gl.uniform1f(u.uFade, p.fade);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Read the last rendered frame as tightly packed RGB24, top row first. */
  readRGB(out?: Uint8Array): Uint8Array {
    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height;
    const rgba = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    const rgb = out ?? new Uint8Array(w * h * 3);
    for (let y = 0; y < h; y++) {
      let s = (h - 1 - y) * w * 4;
      let d = y * w * 3;
      for (let x = 0; x < w; x++) {
        rgb[d++] = rgba[s];
        rgb[d++] = rgba[s + 1];
        rgb[d++] = rgba[s + 2];
        s += 4;
      }
    }
    return rgb;
  }
}
