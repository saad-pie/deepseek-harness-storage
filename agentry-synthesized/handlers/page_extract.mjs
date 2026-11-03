// agentry — handler from DSH plan for page_extract
// v0.58.6 — built via agentry.build_from_plan (strong-model fast path)

const CAP_ID = "page_extract";
const CAP_KIND = "tool";
const ACCEPTS = {
  "url": "string"
};
const PRODUCES = {
  "status": "number",
  "content_type": "string",
  "bytes": "number",
  "plain": "string",
  "links": "array",
  "strings": "array",
  "urls": "array"
};
const REQUIRES = {
  "npm": [],
  "pip": [],
  "post_install": null
};
const ENV_MAP = {
  "URL": "url"
};
const KERNEL_SCRIPT = "globalThis.input = (() => { try { return JSON.parse(process.env.__AGENTRY_INPUT_JSON || \"{}\"); } catch { return {}; } })();\n(async () => {\n  { // step execute\n    // BEGIN execute\n    const res = await fetch(process.env.URL);\n    const ct = res.headers.get('content-type')||'';\n    const txt = await res.text();\n    const links=[]; const lr=/(?:href|src|action)\\s*=\\s*[\"']([^\"']+)[\"']/gi; let m; while((m=lr.exec(txt))) links.push(m[1]);\n    const str=[]; const sr=/\"((?:[^\"\\\\\\\\]|\\\\\\\\.)*)\"|'((?:[^'\\\\\\\\]|\\\\\\\\.)*)'/g; while((m=sr.exec(txt))){const s=(m[1]??m[2]).replace(/\\\\\\\\(.)/g,'$1'); if(s.length>=6 && s.length<=200) str.push(s);}\n    const urlRe=/https?:\\/\\/[^\\s\"'<>)]+/g; const urls=[...new Set(txt.match(urlRe)||[])].slice(0,200);\n    let plain=''; if(ct.includes('text/html')){plain=txt.replace(/<script[\\s\\S]*?<\\/script>/gi,'').replace(/<style[\\s\\S]*?<\\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ').trim().slice(0,4000);}\n    console.log(JSON.stringify({status:res.status,content_type:ct,bytes:txt.length,plain,links:[...new Set(links)].slice(0,200),strings:[...new Set(str)].slice(0,600),urls}));\n    // END execute\n  }\n})().catch(e => { console.error(String((e && e.stack) || e)); process.exit(1); });";
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
  const FIXTURES = {};
  if (Object.keys(FIXTURES).length > 0) {
    const fs = await import("node:fs"); const path = await import("node:path");
    for (const [fp, content] of Object.entries(FIXTURES)) {
      try { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, String(content)); } catch (e) {}
    }
  }
  const probe = await run({"url":"https://example.com"}, deps, { session });
  const out = probe.output || probe;
  const PROD = {"status":"number","content_type":"string","bytes":"number","plain":"string","links":"array","strings":"array","urls":"array"};
  const _missing = Object.keys(PROD).filter(k => out[k] === undefined || out[k] === null);
  if (_missing.length > 0) throw new Error("accept: handler returned null/undefined for: " + _missing.join(", "));
  return { ok: true, session, output: out };
}

export default run;