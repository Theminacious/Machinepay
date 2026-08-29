/// Render check: loads the dashboard against the local chain and screenshots it.
///   node scripts/shot.mjs [url] [out.png]
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:5199/";
const out = process.argv[3] ?? "/tmp/machinepay.png";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1250 }, deviceScaleFactor: 2 });
const problems = [];
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.screenshot({ path: out, fullPage: true });

const text = await page.locator("body").innerText();
console.log(`Screenshot ${out}`);
console.log(problems.length ? `Problems:\n  ${problems.join("\n  ")}` : "No console errors");
console.log(`\n--- visible text ---\n${text}`);

await browser.close();
