// agentry — matured handler for pdf-lib-table__v77
// Maturation of pdf-lib-table. Regenerate, do not hand-edit.

const CAP_ID = "pdf-lib-table__v77";
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
const KERNEL_SCRIPT = "(async () => {\n\n  // -- step 1: run --\n  // Create PDF with title, image, and markdown content\n  (async () => {\n  \n    // -- step 1: prepare --\n    // Validate the image path and set up global state\n    const {existsSync}=await import('node:fs');\n    const imagePath=process.env.IMAGE_PATH;\n    if(!imagePath){throw new Error('IMAGE_PATH env var not set');}\n    if(!existsSync(imagePath)){throw new Error(`Image file not found: ${imagePath}`);}\n    globalThis.imagePath=imagePath;\n  \n    // -- step 2: execute --\n    // Create a PDF containing the title, image, and rendered markdown, handling pagination and font sizes\n    const {readFileSync}=await import('node:fs');\n    const {PDFDocument, StandardFonts}=await import('pdf-lib');\n    const imageBytes=readFileSync(globalThis.imagePath);\n    const pdfDoc=await PDFDocument.create();\n    const pngImage=await pdfDoc.embedPng(imageBytes);\n    const helvetica=await pdfDoc.embedFont(StandardFonts.Helvetica);\n    const helveticaBold=await pdfDoc.embedFont(StandardFonts.HelveticaBold);\n    const margin=50;\n    let page=pdfDoc.addPage();\n    let {width,height}=page.getSize();\n    // draw title centered 40 points below top of page\n    const title=\"Example.com Screenshot\";\n    const titleSize=24;\n    const titleWidth=helveticaBold.widthOfTextAtSize(title,titleSize);\n    page.drawText(title,{x:(width-titleWidth)/2, y:height-40, size:titleSize, font:helveticaBold});\n    // set y coordinate for image directly below title (5pt gap)\n    let y=height-40-titleSize-5;\n    // embed image on the left\n    const imgDims=pngImage.scale(1);\n    page.drawImage(pngImage,{x:margin, y:y-imgDims.height, width:imgDims.width, height:imgDims.height});\n    let textX=margin+imgDims.width+20;\n    let textY=y;\n    const md=`# Sample Heading\n    ## Subheading\n    - Item one\n    - Item two\n    \n    This is a paragraph of body text that should wrap onto multiple lines if it exceeds the page width.`;\n    function drawLine(txt,size,font){\n      const maxWidth=width-margin-textX;\n      const words=txt.split(' ');\n      let line='';\n      for(const w of words){\n        const test=line? line+' '+w:w;\n        const testWidth=font.widthOfTextAtSize(test,size);\n        if(testWidth>maxWidth){\n          page.drawText(line,{x:textX,y:textY,size,font});\n          textY-=size+4;\n          if(textY<margin){\n            page=pdfDoc.addPage();\n            ({width,height}=page.getSize());\n            textY=height-margin;\n          }\n          line=w;\n        }else{\n          line=test;\n        }\n      }\n      if(line){\n        page.drawText(line,{x:textX,y:textY,size,font});\n        textY-=size+4;\n        if(textY<margin){\n          page=pdfDoc.addPage();\n          ({width,height}=page.getSize());\n          textY=height-margin;\n        }\n      }\n    }\n    for(const rawLine of md.split('\\\\n')){\n      if(rawLine.startsWith('# ')){\n        drawLine(rawLine.replace(/^# /,''),24,helveticaBold);\n      }else if(rawLine.startsWith('## ')){\n        drawLine(rawLine.replace(/^## /,''),18,helveticaBold);\n      }else if(rawLine.startsWith('- ')){\n        drawLine('• '+rawLine.slice(2),12,helvetica);\n      }else if(rawLine.trim()===''){\n        textY-=12; // paragraph spacing\n      }else{\n        drawLine(rawLine,12,helvetica);\n      }\n    }\n    const pdfBytes=await pdfDoc.save();\n    globalThis.pdfBytes=pdfBytes;\n  \n    // -- step 3: emit --\n    // Output a JSON object with the PDF base64 string\n    const base64=Buffer.from(globalThis.pdfBytes).toString('base64');\n    console.log(JSON.stringify({pdf_base64:base64}));\n  \n  })().catch(e => { console.error(String((e && e.stack) || e)); process.exit(1); });\n\n})().catch(e => { console.error(String((e && e.stack) || e)); process.exit(1); });";
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