import { chromium } from "playwright";

const url = process.env.BUA_URL;
const width = Number(process.env.BUA_WIDTH || 1280);
const height = Number(process.env.BUA_HEIGHT || 720);
const fullPage = process.env.BUA_FULL === "1";

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 25000 });
  const buf = await page.screenshot({ fullPage, type: "png" });
  const png_base64 = buf.toString("base64");
  const bytes = Math.floor((png_base64.length * 3) / 4);
  const result = {
    png_base64,
    bytes,
    url,
    captured_at: Date.now(),
    width,
    height
  };
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
