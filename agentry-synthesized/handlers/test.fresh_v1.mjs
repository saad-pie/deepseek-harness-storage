// agentry — handler from DSH plan for test.fresh_v1
// v0.58.6 — built via agentry.build_from_plan (strong-model fast path)

const CAP_ID = "test.fresh_v1";
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
const KERNEL_SCRIPT = "globalThis.input = (() => { try { return JSON.parse(process.env.__AGENTRY_INPUT_JSON || \"{}\"); } catch { return {}; } })();\n(async () => {\n  { // step execute\n    // BEGIN execute\n    const fs = await import(\"node:fs\");\n    const path = await import(\"node:path\");\n    const inPath = process.env.INPUT_PATH || \"\";\n    const outPath = process.env.OUTPUT_PATH || \"\";\n    if (!inPath) throw new Error(\"input_path is required (got empty)\");\n    if (!outPath) throw new Error(\"output_path is required (got empty)\");\n    if (!fs.existsSync(inPath)) throw new Error(\"input file not found: \" + inPath);\n    const st = fs.statSync(inPath);\n    if (!st.isFile()) throw new Error(\"input_path is not a file: \" + inPath);\n    if (st.size > 0x1fffffe8) throw new Error(\"input file too large: \" + st.size + \" bytes\");\n    const txt = fs.readFileSync(inPath, \"utf8\").replace(/^\\uFEFF/, \"\");\n    const lines = txt.trim().split(/\\r?\\n/);\n    const headers = lines[0] ? lines[0].split(\",\") : [];\n    let total = 0;\n    for (let i = 1; i < lines.length; i++) {\n      if (!lines[i].trim()) continue;\n      const cols = lines[i].split(\",\");\n      const n = Number(cols[1]);\n      if (Number.isFinite(n)) total += n;\n    }\n    const out = JSON.stringify({ sum: total, headers });\n    fs.mkdirSync(path.dirname(outPath), { recursive: true });\n    fs.writeFileSync(outPath, out);\n    console.log(JSON.stringify({output_path: outPath, bytes: Buffer.byteLength(out, \"utf8\")}))\n    // END execute\n  }\n})().catch(e => { console.error(String((e && e.stack) || e)); process.exit(1); });";
const KERNEL_ACTION = "node.run";
const DEFAULT_TIMEOUT_MS = 90000;

export const capability = { id: CAP_ID, kind: CAP_KIND, invoked_via: "invoker.in_process_js", accepts: ACCEPTS, produces: PRODUCES, requires: REQUIRES };

async function run(input, ctx, opts = {}) {
  if (typeof input === "string") {
    try { input = JSON.parse(input); } catch (e) { throw new Error(CAP_ID + ": input is not valid JSON — " + e.message); }
  }
  if (input === null || input === undefined || typeof input !== "object" || Array.isArray(input)) input = {};
  opts = opts || {};
  const session = opts.session || input.session || (CAP_ID + "-default");
  if (!ctx || typeof ctx.invoke !== "function") throw new Error(CAP_ID + " requires ctx.invoke");
  for (const k of Object.keys(ACCEPTS)) {
    const v = input[k];
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) throw new Error(CAP_ID + ": missing required input '" + k + "'");
    if (typeof v !== "string") throw new Error(CAP_ID + ": input '" + k + "' must be a string");
  }
  const { prepareSession } = await import("/tmp/home/.dsh/node_modules/agentry/src/runtime/installer.mjs");
  await prepareSession(ctx, { capId: CAP_ID, session, requires_override: REQUIRES });
  await ctx.invoke("agentry.os", { action: "session.create", id: session });
  const env = {};
  for (const [envKey, inputKey] of Object.entries(ENV_MAP)) {
    const v = input[inputKey];
    env[envKey] = v === undefined || v === null ? "" : String(v);
  }
  try { env.__AGENTRY_INPUT_JSON = JSON.stringify(input || {}); } catch (e) { env.__AGENTRY_INPUT_JSON = "{}"; }
  const _t = Number(input.timeout_ms);
  const timeout_ms = Number.isFinite(_t) && _t > 0 ? _t : DEFAULT_TIMEOUT_MS;
  const res = await ctx.invoke("agentry.os", { action: KERNEL_ACTION, session, code: KERNEL_SCRIPT, env, timeout_ms });
  if (!res || !res.ok) {
    const err = (res && res.error) || {};
    throw new Error(CAP_ID + ": kernel failed — " + (err.code || "unknown") + ": " + (err.message || "no error message"));
  }
  const r = (res.output && (res.output.result || res.output)) || {};
  const exitCode = Number(r.exit_code ?? r.exitCode ?? 0);
  if (exitCode !== 0) throw new Error(CAP_ID + ": exit " + exitCode + " — " + String(r.stderr || "").slice(0, 300));
  const stdout = String(r.stdout || "").trim();
  if (!stdout) throw new Error(CAP_ID + ": no stdout");
  let parsed;
  try { parsed = JSON.parse(stdout); }
  catch (e) {
    const lastLine = stdout.split(/\r?\n/).filter(l => l.trim()).pop() || "";
    try { parsed = JSON.parse(lastLine); }
    catch (e2) { throw new Error(CAP_ID + ": stdout not JSON — " + e.message); }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(CAP_ID + ": stdout JSON is not an object");
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
