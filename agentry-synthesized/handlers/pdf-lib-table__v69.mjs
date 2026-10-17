// agentry — matured handler for pdf-lib-table__v69
// Maturation of pdf-lib-table. Regenerate, do not hand-edit.

const CAP_ID = "pdf-lib-table__v69";
const CAP_KIND = "tool";
const ACCEPTS = {
  "image_path": "string"
};
const PRODUCES = {
  "pdf_base64": "string"
};
const REQUIRES = {
  "npm": [
    "pdf-lib",
    "pdf-lib-table"
  ],
  "pip": [],
  "post_install": null,
  "capability": []
};
const ENV_MAP = {
  "IMAGE_PATH": "image_path"
};
const OUTPUT_MAP = {
  "pdf_base64": "pdf_base64"
};
const RESULT_PARSE = "stdout_json";
const KERNEL_ACTION = "node.run";
const KERNEL_SCRIPT = "(async () => {\n\n  // -- step 1: prepare --\n  // Validate the supplied image path and load the image bytes into global state.\n  (async () => {\n    const { existsSync, readFileSync } = await import('node:fs');\n    const imagePath = process.env.IMAGE_PATH;\n    if (!imagePath) throw new Error('IMAGE_PATH env var not set');\n    if (!existsSync(imagePath)) throw new Error(`Image file not found: ${imagePath}`);\n    globalThis.imageBytes = readFileSync(imagePath);\n  })();\n\n  // -- step 2: execute --\n  // Create a PDF where the first page shows a centered title and the full‑size image, then render markdown content starting on page two, forcing at least three pages.\n  (async () => {\n    const { PDFDocument, StandardFonts } = await import('pdf-lib');\n    const pdfDoc = await PDFDocument.create();\n    const pngImage = await pdfDoc.embedPng(globalThis.imageBytes);\n    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);\n    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);\n    const margin = 50;\n  \n    // ---- Page 1: title + image ----\n    const page1 = pdfDoc.addPage();\n    const { width, height } = page1.getSize();\n    const title = 'Sample Image';\n    const titleSize = 24;\n    const titleWidth = helveticaBold.widthOfTextAtSize(title, titleSize);\n    page1.drawText(title, {\n      x: (width - titleWidth) / 2,\n      y: height - margin - titleSize,\n      size: titleSize,\n      font: helveticaBold,\n    });\n    const imgMaxW = width - 2 * margin;\n    const imgMaxH = height - 3 * margin - titleSize;\n    const scale = Math.min(imgMaxW / pngImage.width, imgMaxH / pngImage.height);\n    const imgW = pngImage.width * scale;\n    const imgH = pngImage.height * scale;\n    page1.drawImage(pngImage, {\n      x: (width - imgW) / 2,\n      y: margin,\n      width: imgW,\n      height: imgH,\n    });\n  \n    // ---- Pages 2+: markdown content ----\n    const md = `# Sample Heading\n  ## Subheading\n  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non risus. Suspendisse lectus tortor, dignissim sit amet, adipiscing nec, ultricies sed, dolor. Cras elementum ultrices diam. Maecenas ligula massa, varius a, semper congue, euismod non, mi.\n  \n  - Item one\n  - Item two\n  - Item three\n  \n  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.`.repeat(3);\n    const bodySize = 12;\n    const headingSize = bodySize * 2;\n    let curPage = pdfDoc.addPage();\n    let { width: cw, height: ch } = curPage.getSize();\n    const maxW = cw - 2 * margin;\n    let cursorY = ch - margin;\n    const textX = margin;\n  \n    function newPage() {\n      curPage = pdfDoc.addPage();\n      ({ width: cw, height: ch } = curPage.getSize());\n      cursorY = ch - margin;\n    }\n  \n    function drawWrapped(txt, size, font) {\n      const words = txt.split(' ');\n      let line = '';\n      for (const w of words) {\n        const test = line ? line + ' ' + w : w;\n        const wWidth = font.widthOfTextAtSize(test, size);\n        if (wWidth > maxW) {\n          curPage.drawText(line, { x: textX, y: cursorY, size, font });\n          cursorY -= size + 4;\n          if (cursorY < margin) newPage();\n          line = w;\n        } else {\n          line = test;\n        }\n      }\n      if (line) {\n        curPage.drawText(line, { x: textX, y: cursorY, size, font });\n        cursorY -= size + 4;\n        if (cursorY < margin) newPage();\n      }\n    }\n  \n    for (const raw of md.split('\\n')) {\n      if (raw.startsWith('# ')) {\n        drawWrapped(raw.slice(2), headingSize, helveticaBold);\n      } else if (raw.startsWith('## ')) {\n        drawWrapped(raw.slice(3), headingSize, helveticaBold);\n      } else if (raw.startsWith('- ')) {\n        drawWrapped('• ' + raw.slice(2), bodySize, helvetica);\n      } else if (raw.trim() === '') {\n        cursorY -= bodySize;\n        if (cursorY < margin) newPage();\n      } else {\n        drawWrapped(raw, bodySize, helvetica);\n      }\n    }\n  \n    // Ensure at least three pages total\n    while (pdfDoc.getPageCount() < 3) pdfDoc.addPage();\n  \n    const pdfBytes = await pdfDoc.save();\n    globalThis.pdfBytes = pdfBytes;\n  })();\n\n  // -- step 3: emit --\n  // Encode the generated PDF bytes as base64 and output the required JSON key.\n  (async () => {\n    if (!globalThis.pdfBytes) throw new Error('No PDF bytes available');\n    const base64 = Buffer.from(globalThis.pdfBytes).toString('base64');\n    console.log(JSON.stringify({ pdf_base64: base64 }));\n  })();\n\n})().catch(e => { console.error(String((e && e.stack) || e)); process.exit(1); });";
const DEFAULT_TIMEOUT_MS = 90000;

export const capability = { id: CAP_ID, kind: CAP_KIND, invoked_via: "invoker.in_process_js", accepts: ACCEPTS, produces: PRODUCES, requires: REQUIRES };

export async function accept(deps, opts = {}) {
  const session = opts.session || (CAP_ID + "-accept-test");
  const { prepareSession } = await import("/tmp/home/.dsh/node_modules/agentry/src/runtime/installer.mjs");
  await prepareSession(deps, { capId: CAP_ID, session });
  const probe = await run({"image_path":"/tmp/in.png"}, deps, { session });
  const out = probe.output || probe;
  if (out.status === "awaiting_input") throw new Error("accept: awaiting_input is not a trial pass");
  return { ok: true, session, output: out };
}

async function run(input, ctx, opts = {}) {
  const session = opts.session || input.session || (CAP_ID + "-default");
  const { prepareSession } = await import("/tmp/home/.dsh/node_modules/agentry/src/runtime/installer.mjs");
  await prepareSession(ctx, { capId: CAP_ID, session });
  await ctx.invoke("agentry.os", { action: "session.create", id: session }, { tenant: "local", by: CAP_ID });
  const env = {};
  for (const [envKey, inputKey] of Object.entries(ENV_MAP)) {
    const v = input[inputKey];
    env[envKey] = v === undefined || v === null ? "" : String(v);
  }
  const res = await ctx.invoke("agentry.os", { action: KERNEL_ACTION, session, code: KERNEL_SCRIPT, env, timeout_ms: DEFAULT_TIMEOUT_MS }, { tenant: "local", by: CAP_ID });
  if (!res.ok) throw new Error(CAP_ID + ": kernel failed — " + res.error.code + ": " + res.error.message);
  const r = res.output.result || res.output;
  const exitCode = r.exit_code ?? r.exitCode ?? 0;
  if (exitCode !== 0) throw new Error(CAP_ID + ": kernel exited " + exitCode + " — " + String(r.stderr || "").slice(0, 300));
  const stdout = String(r.stdout || "");
  if (!stdout.trim()) throw new Error(CAP_ID + ": kernel produced no output");
  let raw;
  if (RESULT_PARSE === "stdout_json") {
    try { raw = JSON.parse(stdout); } catch (e) { throw new Error(CAP_ID + ": stdout not JSON — " + e.message); }
  } else { raw = stdout.trim(); }
  const output = {};
  for (const [outKey, path] of Object.entries(OUTPUT_MAP)) {
    let v = raw;
    for (const p of String(path).split(".")) v = v?.[p];
    output[outKey] = v;
  }
  if (output.bytes === undefined) output.bytes = typeof raw === "string" ? Buffer.byteLength(raw) : JSON.stringify(raw).length;
  if (output.status === undefined) output.status = "complete";
  output.captured_at = Date.now();
  return { output, cost: { time_ms: r.ms || 0 } };
}

export default run;