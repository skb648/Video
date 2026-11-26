/** TOONFORGE colour system. All values authored in sRGB; the final encode is tagged BT.709. */
import type { RGB } from "../core/math";
import { mix3 } from "../core/math";

export const C = {
  ink: [7, 8, 11] as RGB, // background
  ink2: [14, 17, 23] as RGB, // raised surface
  steel: [42, 48, 59] as RGB, // neutral line
  mist: [120, 128, 142] as RGB, // secondary text
  bone: [244, 239, 230] as RGB, // primary light
  deep: [107, 29, 11] as RGB, // shadow of the fire family
  ember: [255, 90, 31] as RGB, // primary accent
  molten: [255, 138, 43] as RGB,
  gold: [255, 194, 77] as RGB,
  hot: [255, 241, 214] as RGB, // highlight
  cyan: [53, 227, 255] as RGB, // contrast accent (cold)
};

export const rgb = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
export const hex = (c: RGB) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/** Black-body-ish ramp: 0 = dull red, 1 = white-hot. */
export function heat(t: number): RGB {
  if (t < 0.34) return mix3(C.deep, C.ember, t / 0.34);
  if (t < 0.67) return mix3(C.ember, C.gold, (t - 0.34) / 0.33);
  return mix3(C.gold, [255, 255, 255], (t - 0.67) / 0.33);
}

export const FONT = {
  display: "Anton",
  ui: '"Space Grotesk Variable"',
  mono: '"JetBrains Mono"',
};
