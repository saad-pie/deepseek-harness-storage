
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
      process.stdout.write(buf.toString("base64"));
    } finally {
      await browser.close();
    }
  