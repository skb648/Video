/** Compositor: scene dispatch, transitions, HUD, post. renderFrame(f) is a pure function of f. */
import "@fontsource/anton/latin-400.css";
import "@fontsource-variable/space-grotesk/wght.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import { H, TOTAL_FRAMES, W } from "../core/config";
import { SCENES, S2_WIPE, fxAt } from "../core/timeline";
import { E, prog } from "../motion/easing";
import { PostFX } from "../shaders/post";
import { hud, hudAlpha } from "../graphics/fx";
import { ignition } from "../scenes/s1-ignition";
import { SHAPE_C, SHAPE_R, S2_START, structure } from "../scenes/s2-structure";
import { depth } from "../scenes/s3-depth";
import { reveal } from "../scenes/s4-reveal";
import { overdrive } from "../scenes/s5-overdrive";
import { resolve } from "../scenes/s6-resolve";

export async function loadFonts() {
  const specs = ["400 100px Anton", '500 40px "Space Grotesk Variable"', '400 30px "JetBrains Mono"', '500 30px "JetBrains Mono"'];
  await Promise.all(specs.map((s) => document.fonts.load(s, "TOONFORGE 0123456789 ABC")));
  await document.fonts.ready;
}

export class Studio {
  scene = document.createElement("canvas");
  out: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  post: PostFX;

  constructor(out?: HTMLCanvasElement) {
    this.scene.width = W;
    this.scene.height = H;
    this.out = out ?? document.createElement("canvas");
    this.out.width = W;
    this.out.height = H;
    this.ctx = this.scene.getContext("2d", { alpha: false })!;
    this.post = new PostFX(this.out);
  }

  /** Draw the un-post-processed picture for frame f. */
  drawScene(f: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const s = SCENES.find((x) => f >= x.start && f < x.end) ?? SCENES[SCENES.length - 1];
    switch (s.id) {
      case "ignition": ignition(ctx, f); break;
      case "structure": {
        structure(ctx, f);
        // iris transition: the expanding disc becomes the window onto Scene 3
        const lf = f - S2_START;
        if (lf >= S2_WIPE.start) {
          const wipe = E.inQuint(prog(lf, S2_WIPE.start, S2_WIPE.dur));
          const r = SHAPE_R * (1 + wipe * 6.5) * 0.965;
          ctx.save();
          ctx.beginPath();
          ctx.arc(SHAPE_C[0], SHAPE_C[1], r, 0, Math.PI * 2);
          ctx.clip();
          depth(ctx, f);
          ctx.restore();
        }
        break;
      }
      case "depth": depth(ctx, f); break;
      case "reveal": reveal(ctx, f); break;
      case "climax": overdrive(ctx, f); break;
      case "resolve": resolve(ctx, f); break;
    }
    ctx.restore();
    ctx.save();
    hud(ctx, f, hudAlpha(f));
    ctx.restore();
  }

  renderFrame(f: number) {
    const fr = Math.max(0, Math.min(TOTAL_FRAMES - 1, Math.floor(f)));
    this.drawScene(fr);
    this.post.render(this.scene, fr, fxAt(fr));
  }
}
