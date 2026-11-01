// agentry — handler from DSH plan for json_to_bson
// v0.58.6 — built via agentry.build_from_plan (strong-model fast path)

const CAP_ID = "json_to_bson";
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
  "npm": [
    "bson"
  ],
  "pip": [],
  "post_install": null,
  "capability": []
};
const ENV_MAP = {
  "INPUT_PATH": "input_path",
  "OUTPUT_PATH": "output_path"
};
const KERNEL_SCRIPT = "globalThis.input = (() => { try { return JSON.parse(process.env.__AGENTRY_INPUT_JSON || \"{}\"); } catch { return {}; } })();\n(async () => {\n  { // step prepare\n    // BEGIN prepare\n    const { readFileSync } = await import('node:fs');\n    const ip = process.env.INPUT_PATH;\n    const op = process.env.OUTPUT_PATH;\n    if (!ip || !op) throw new Error('missing paths');\n    globalThis.data = readFileSync(ip, 'utf8');\n    globalThis.op = op;\n    // END prepare\n  }\n  { // step execute\n    // BEGIN execute\n    const { serialize } = await import('bson');\n    globalThis.buf = serialize(JSON.parse(globalThis.data));\n    // END execute\n  }\n  { // step emit\n    // BEGIN emit\n    const { writeFileSync, statSync } = await import('node:fs');\n    writeFileSync(globalThis.op, globalThis.buf);\n    const sz = statSync(globalThis.op).size;\n    console.log(JSON.stringify({ output_path: globalThis.op, bytes: sz }));\n    // END emit\n  }\n})().catch(e => { console.error(String((e && e.stack) || e)); process.exit(1); });";
const KERNEL_ACTION = "node.run";
const DEFAULT_TIMEOUT_MS = 90000;

export const capability = { id: CAP_ID, kind: CAP_KIND, invoked_via: "invoker.in_process_js", accepts: ACCEPTS, produces: PRODUCES, requires: REQUIRES };

async function run(input, ctx, opts = {}) {
  const session = opts.session || input.session || (CAP_ID + "-default");
  if (typeof ctx.invoke !== "function") throw new Error(CAP_ID + " requires ctx.invoke");
  const { prepareSession } = await import("/tmp/home/.dsh/node_modules/agentry/src/runtime/installer.mjs");
  await prepareSession(ctx, { capId: CAP_ID, session, requires_override: REQUIRES });
  await ctx.invoke("agentry.os", { action: "session.create", id: session });
  const env = {};
  for (const [envKey, inputKey] of Object.entries(ENV_MAP)) {
    const v = input[inputKey];
    env[envKey] = v === undefined || v === null ? "" : String(v);
  }
  try { env.__AGENTRY_INPUT_JSON = JSON.stringify(input || {}); } catch (e) { env.__AGENTRY_INPUT_JSON = "{}"; }
  const res = await ctx.invoke("agentry.os", { action: KERNEL_ACTION, session, code: KERNEL_SCRIPT, env, timeout_ms: input.timeout_ms || DEFAULT_TIMEOUT_MS });
  if (!res.ok) throw new Error(CAP_ID + ": kernel failed — " + res.error.code + ": " + res.error.message);
  const r = res.output.result || res.output;
  const exitCode = r.exit_code ?? r.exitCode ?? 0;
  if (exitCode !== 0) throw new Error(CAP_ID + ": exit " + exitCode + " — " + String(r.stderr || "").slice(0, 300));
  const stdout = String(r.stdout || "").trim();
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
  const FIXTURES = {"/tmp/bson_in.json":"{\"x\":1,\"y\":2}"};
  if (Object.keys(FIXTURES).length > 0) {
    const fs = await import("node:fs"); const path = await import("node:path");
    for (const [fp, content] of Object.entries(FIXTURES)) {
      try { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, String(content)); } catch (e) {}
    }
  }
  const probe = await run({"input_path":"/tmp/bson_in.json","output_path":"/tmp/bson_out.bson"}, deps, { session });
  const out = probe.output || probe;
  const PROD = {"output_path":"string","bytes":"number"};
  const _missing = Object.keys(PROD).filter(k => out[k] === undefined || out[k] === null);
  if (_missing.length > 0) throw new Error("accept: handler returned null/undefined for: " + _missing.join(", "));
  return { ok: true, session, output: out };
}

export default run;