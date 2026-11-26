// Render + master the soundtrack in headless Chromium, write WAV + report. Usage: node scripts/audio.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
mkdirSync("build", { recursive: true });
mkdirSync("reports/quality-assurance", { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(pathToFileURL(resolve("dist/index.html")).href);
await page.waitForFunction(() => window.__tf && window.__tf.ready, null, { timeout: 60000 });
const t0 = Date.now();
const { b64, report } = await page.evaluate(() => window.__tf.audio());
writeFileSync("build/master.wav", Buffer.from(b64, "base64"));
writeFileSync("reports/quality-assurance/audio_report.json", JSON.stringify(report, null, 2));
console.log("audio rendered+mastered in", Date.now() - t0, "ms");
console.log(report);
await browser.close();
