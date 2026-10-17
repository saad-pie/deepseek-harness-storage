// agentry — matured handler for pdf-lib-table__v66
// Maturation of pdf-lib-table. Regenerate, do not hand-edit.

const CAP_ID = "pdf-lib-table__v66";
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
const KERNEL_SCRIPT = "(async () => {\n\n  // -- step 1: prepare --\n  // Validate the image path and set up global state\n  const { existsSync } = await import('node:fs');\n  const imagePath = process.env.IMAGE_PATH;\n  if (!imagePath) { throw new Error('IMAGE_PATH env var not set'); }\n  if (!existsSync(imagePath)) { throw new Error(`Image file not found: ${imagePath}`); }\n  globalThis.imagePath = imagePath;\n\n  // -- step 2: execute --\n  // Create a PDF containing rendered markdown and the image, store bytes in global state\n  const { readFileSync } = await import('node:fs');\n  const { PDFDocument, StandardFonts } = await import('pdf-lib');\n  \n  // Read image bytes\n  const imageBytes = readFileSync(globalThis.imagePath);\n  \n  // Create PDF document\n  const pdfDoc = await PDFDocument.create();\n  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);\n  const pngImage = await pdfDoc.embedPng(imageBytes);\n  \n  // Define layout constants\n  const margin = 50;\n  const pageWidth = 612; // 8.5in * 72\n  const pageHeight = 792; // 11in * 72\n  let yPos = pageHeight - margin;\n  \n  // Helper to add a new page when needed\n  function addPageIfNeeded(requiredSpace) {\n    if (yPos - requiredSpace < margin) {\n      const newPage = pdfDoc.addPage([pageWidth, pageHeight]);\n      yPos = pageHeight - margin;\n      return newPage;\n    }\n    return null;\n  }\n  \n  // Add first page\n  let page = pdfDoc.addPage([pageWidth, pageHeight]);\n  \n  // Render markdown (simple parser)\n  const markdown = `# Sample Heading\\n## Subheading Example\\n- First bullet item\\n- Second bullet item\\n\\nThis is a paragraph of body text that demonstrates rendering of regular text in the PDF. It can span multiple lines and will continue onto the next page if needed.`;\n  const lines = markdown.split(/\\n/);\n  for (const rawLine of lines) {\n    let line = rawLine.trim();\n    let fontSize = 12;\n    let text = line;\n    if (line.startsWith('# ')) {\n      fontSize = 24;\n      text = line.replace(/^#\\s+/, '');\n    } else if (line.startsWith('## ')) {\n      fontSize = 18;\n      text = line.replace(/^##\\s+/, '');\n    } else if (line.startsWith('- ')) {\n      fontSize = 12;\n      text = '\\u2022 ' + line.replace(/^[-*]\\s+/, '');\n    }\n    const lineHeight = fontSize + 4;\n    addPageIfNeeded(lineHeight);\n    page.drawText(text, {\n      x: margin,\n      y: yPos - lineHeight,\n      size: fontSize,\n      font: helvetica,\n      color: rgb(0, 0, 0)\n    });\n    yPos -= lineHeight;\n  }\n  \n  // Embed the image at the bottom of the last page (scaled to fit width)\n  const imgDims = pngImage.scale(0.5);\n  if (yPos - imgDims.height < margin) {\n    page = pdfDoc.addPage([pageWidth, pageHeight]);\n    yPos = pageHeight - margin;\n  }\n  page.drawImage(pngImage, {\n    x: margin,\n    y: yPos - imgDims.height,\n    width: imgDims.width,\n    height: imgDims.height\n  });\n  \n  yPos -= imgDims.height + 20;\n  \n  // Save PDF bytes\n  const pdfBytes = await pdfDoc.save();\n  globalThis.pdfBytes = pdfBytes;\n\n  // -- step 3: emit --\n  // Output a JSON object with the PDF base64 string\n  const base64 = Buffer.from(globalThis.pdfBytes).toString('base64');\n  console.log(JSON.stringify({ pdf_base64: base64 }));\n\n})().catch(e => { console.error(String((e && e.stack) || e)); process.exit(1); });";
const DEFAULT_TIMEOUT_MS = 90000;

export const capability = { id: CAP_ID, kind: CAP_KIND, invoked_via: "invoker.in_process_js", accepts: ACCEPTS, produces: PRODUCES, requires: REQUIRES };

export async function accept(deps, opts = {}) {
  const session = opts.session || (CAP_ID + "-accept-test");
  const { prepareSession } = await import("/tmp/home/.dsh/node_modules/agentry/src/runtime/installer.mjs");
  await prepareSession(deps, { capId: CAP_ID, session });
  const probe = await run({}, deps, { session });
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