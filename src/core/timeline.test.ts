import test from "node:test";
import assert from "node:assert/strict";
import { BAR, BEAT, DURATION, FPS, TOTAL_FRAMES, timecode } from "./config";
import { fxAt, IMPACTS, SCENES, sceneAt } from "./timeline";
import { E, prog } from "../motion/easing";
import { noise1 } from "./math";

test("master delivery constants match 30s at 60fps and 120 BPM", () => {
  assert.equal(FPS, 60);
  assert.equal(TOTAL_FRAMES, 1800);
  assert.equal(DURATION, 30);
  assert.equal(BEAT, 30);
  assert.equal(BAR, 120);
});

test("timecode formats absolute frames into HH:MM:SS:FF", () => {
  assert.equal(timecode(0), "00:00:00:00");
  assert.equal(timecode(90), "00:00:01:30");
  assert.equal(timecode(1799), "00:00:29:59");
});

test("editorial scenes cover [0, TOTAL_FRAMES) contiguously with zero gaps", () => {
  assert.equal(SCENES.length, 6);
  assert.equal(SCENES[0].start, 0);
  for (let i = 1; i < SCENES.length; i++) {
    assert.equal(SCENES[i].start, SCENES[i - 1].end, `Scene ${i} must start where previous scene ended`);
    assert.ok(SCENES[i].end > SCENES[i].start);
  }
  assert.equal(SCENES[SCENES.length - 1].end, TOTAL_FRAMES);
  assert.equal(sceneAt(0).id, "ignition");
  assert.equal(sceneAt(240).id, "structure");
  assert.equal(sceneAt(600).id, "depth");
  assert.equal(sceneAt(960).id, "reveal");
  assert.equal(sceneAt(1200).id, "climax");
  assert.equal(sceneAt(1560).id, "resolve");
  assert.equal(sceneAt(1799).id, "resolve");
});

test("fxAt is purely deterministic and honors opening/closing fade and impact spikes", () => {
  const a = fxAt(960);
  const b = fxAt(960);
  assert.deepEqual(a, b);
  assert.equal(fxAt(0).fade, 1);
  assert.equal(fxAt(100).fade, 0);
  assert.ok(fxAt(1799).fade > 0.99);
  assert.ok(fxAt(960).flash >= 0.99, "Reveal impact at F960 triggers full flash");
  assert.ok(fxAt(960).chroma > fxAt(500).chroma, "Impact spikes chromatic aberration");
  assert.ok(IMPACTS.every((imp) => imp.f >= 0 && imp.f < TOTAL_FRAMES));
});

test("easing and seeded noise are bounded and deterministic", () => {
  assert.equal(prog(10, 10, 20), 0);
  assert.equal(prog(20, 10, 20), 0.5);
  assert.equal(prog(40, 10, 20), 1);
  assert.equal(E.inOutCubic(0), 0);
  assert.equal(E.inOutCubic(1), 1);
  assert.equal(noise1(12.5, 3), noise1(12.5, 3));
});
