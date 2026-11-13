// agentry — handler from DSH plan for test.phase2_close
// v0.58.6 — built via agentry.build_from_plan (strong-model fast path)

const CAP_ID = "test.phase2_close";
const CAP_KIND = "tool";
const ACCEPTS = {
  "input_path": "string",
  "output_path": "string"
};
const PRODUCES = {
  "output_path": "string",
  "bytes": "number"
};
const REQUIRES = {
  "npm": [],
  "pip": [],
  "post_install": null
};
const ENV_MAP = {
  "INPUT_PATH": "input_path",
  "OUTPUT_PATH": "output_path"
};
const KERNEL_SCRIPT = "globalThis.input = (() => { try { return JSON.parse(process.env.__AGENTRY_INPUT_JSON || \"{}\"); } catch { return {}; } })();\n(async () => {\n  { // step execute\n    // BEGIN execute\n    const fs = await import(\"node:fs\");\n    const path = await import(\"node:path\");\n    const inputPath = process.env.INPUT_PATH;\n    const outputPath = process.env.OUTPUT_PATH;\n    \n    if (!inputPath) {\n      console.error(JSON.stringify({ error: \"INPUT_PATH not set\" }));\n      process.exit(1);\n    }\n    if (!outputPath) {\n      console.error(JSON.stringify({ error: \"OUTPUT_PATH not set\" }));\n      process.exit(1);\n    }\n    \n    try {\n      await fs.promises.access(inputPath, fs.constants.R_OK);\n    } catch {\n      console.error(JSON.stringify({ error: `Input file not found or not readable: ${inputPath}` }));\n      process.exit(1);\n    }\n    \n    let txt;\n    try {\n      txt = await fs.promises.readFile(inputPath, \"utf8\");\n    } catch (e) {\n      console.error(JSON.stringify({ error: `Failed to read input file: ${e.message}` }));\n      process.exit(1);\n    }\n    \n    if (!txt || txt.trim() === \"\") {\n      const out = JSON.stringify({ sum: 0, headers: [] });\n      try {\n        await fs.promises.writeFile(outputPath, out);\n      } catch (e) {\n        console.error(JSON.stringify({ error: `Failed to write output file: ${e.message}` }));\n        process.exit(1);\n      }\n      console.log(JSON.stringify({ output_path: outputPath, bytes: out.length }));\n      return;\n    }\n    \n    const lines = txt.trim().split(\"\\n\");\n    if (lines.length === 0) {\n      const out = JSON.stringify({ sum: 0, headers: [] });\n      try {\n        await fs.promises.writeFile(outputPath, out);\n      } catch (e) {\n        console.error(JSON.stringify({ error: `Failed to write output file: ${e.message}` }));\n        process.exit(1);\n      }\n      console.log(JSON.stringify({ output_path: outputPath, bytes: out.length }));\n      return;\n    }\n    \n    const headers = lines[0].split(\",\").map(h => h.trim());\n    let total = 0;\n    for (let i = 1; i < lines.length; i++) {\n      const line = lines[i].trim();\n      if (line === \"\") continue;\n      const cols = line.split(\",\");\n      if (cols.length < 2) continue;\n      const val = Number(cols[1].trim());\n      if (!isNaN(val)) {\n        total += val;\n      }\n    }\n    const out = JSON.stringify({ sum: total, headers });\n    try {\n      await fs.promises.writeFile(outputPath, out);\n    } catch (e) {\n      console.error(JSON.stringify({ error: `Failed to write output file: ${e.message}` }));\n      process.exit(1);\n    }\n    console.log(JSON.stringify({ output_path: outputPath, bytes: out.length }))\n    // END execute\n  }\n})().catch(e => { console.error(String((e && e.stack) || e)); process.exit(1); });";
const KERNEL_ACTION = "node.run";
const DEFAULT_TIMEOUT_MS = 90000;

export const capability = { id: CAP_ID, kind: CAP_KIND, invoked_via: "invoker.in_process_js", accepts: ACCEPTS, produces: PRODUCES, requires: REQUIRES };

async function run(input, ctx, opts = {}) {
  const session = opts.session || input?.session || (CAP_ID + "-default");
  if (typeof ctx?.invoke !== "function") throw new Error(CAP_ID + " requires ctx.invoke");
  const { prepareSession } = await import("/tmp/home/.dsh/node_modules/agentry/src/runtime/installer.mjs");
  await prepareSession(ctx, { capId: CAP_ID, session, requires_override: REQUIRES });
  await ctx.invoke("agentry.os", { action: "session.create", id: session });
  const env = {};
  for (const [envKey, inputKey] of Object.entries(ENV_MAP)) {
    const v = input?.[inputKey];
    env[envKey] = v === undefined || v === null ? "" : String(v);
  }
  try { env.__AGENTRY_INPUT_JSON = JSON.stringify(input || {}); } catch (e) { env.__AGENTRY_INPUT_JSON = "{}"; }
  const res = await ctx.invoke("agentry.os", { action: KERNEL_ACTION, session, code: KERNEL_SCRIPT, env, timeout_ms: input?.timeout_ms || DEFAULT_TIMEOUT_MS });
  if (!res?.ok) throw new Error(CAP_ID + ": kernel failed — " + (res?.error?.code || "unknown") + ": " + (res?.error?.message || "unknown error"));
  const r = res?.output?.result || res?.output;
  const exitCode = r?.exit_code ?? r?.exitCode ?? 0;
  if (exitCode !== 0) throw new Error(CAP_ID + ": exit " + exitCode + " — " + String(r?.stderr || "").slice(0, 300));
  const stdout = String(r?.stdout || "").trim();
  if (!stdout) throw new Error(CAP_ID + ": no stdout");
  let parsed;
  try { parsed = JSON.parse(stdout); }
  catch (e) { throw new Error(CAP_ID + ": stdout not JSON — " + e.message); }
  return { output: parsed };
}

export async function accept(deps, opts = {}) {
  const session = opts.session || (CAP_ID + "-accept");
  const { prepareSession } = await import("/tmp/home/.dsh/node_modules/agentry/src/runtime/installer.mjs");
  await prepareSession(deps, { capId: CAP_ID, session, requires_override: REQUIRES });
  const FIXTURES = {"/tmp/csv_in.csv":"name,val\na,1\nb,2\n"};
  if (Object.keys(FIXTURES).length > 0) {
    const fs = await import("node:fs"); const path = await import("node:path");
    for (const [fp, content] of Object.entries(FIXTURES)) {
      try { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, String(content)); } catch (e) {}
    }
  }
  const probe = await run({"input_path":"/tmp/csv_in.csv","output_path":"/tmp/csv_out.json"}, deps, { session });
  const out = probe.output || probe;
  const PROD = {"output_path":"string","bytes":"number"};
  const _missing = Object.keys(PROD).filter(k => out[k] === undefined || out[k] === null);
  if (_missing.length > 0) throw new Error("accept: handler returned null/undefined for: " + _missing.join(", "));
  return { ok: true, session, output: out };
}

export default run;