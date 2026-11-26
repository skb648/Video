// Render selected frames to PNG through the real compositor (headless Chromium). Usage: node scripts/snap.mjs 10 90 300 ...
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const frames = process.argv.slice(2).map(Number);
const out = "reports/production/snaps";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });
const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
page.on("console", (m) => console.log("[page]", m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(pathToFileURL(resolve("dist/index.html")).href);
await page.waitForFunction(() => window.__tf && window.__tf.ready, null, { timeout: 60000 });
for (const f of frames) {
  const t0 = Date.now();
  const url = await page.evaluate((f) => window.__tf.png(f), f);
  writeFileSync(`${out}/f${String(f).padStart(4, "0")}.png`, Buffer.from(url.split(",")[1], "base64"));
  console.log("frame", f, Date.now() - t0, "ms");
}
await browser.close();
