/**
 * dsh-plugin-apex-browser — Host half (v0.2.3).
 *
 * One persistent headless Chromium shared by the AI tools and the user's
 * cockpit UI. Browser control is exposed as plain HTTP routes on the global web
 * server — deliberately NOT through `connection.rpc`: that channel's route
 * registration reads `owner.webServer` from a fiber that never injects it, so
 * every consumer plugin fails activation with `cannot get property "webServer"
 * without inject`. Registering against `ctx.webServer` directly avoids the
 * broken wrapper entirely.
 *
 *   GET  /apex/state   → { url, title, tabs[], aiActive, som, viewport }
 *   POST /apex/rpc     → { endpoint, payload } → { ok:true, value } | { ok:false, error }
 *                        endpoints: state | frame | input | control
 *   GET  /apex/stream  → Server-Sent Events: `frame` (JPEG base64) + `events`
 *
 * Control authority (`aiActive`): the cockpit's "Take Over" sets it, which
 * refuses *and parks* AI tool calls until the user releases. AI tools acquire
 * the lock for the duration of one tool call so the user cannot fight them
 * mid-action.
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'

export const name = 'dsh-plugin-apex-browser'
export const inject = ['tools', 'webServer']

const RPC_OK = (value) => ({ ok: true, value })
const RPC_ERR = (message, code = 'internal') => ({ ok: false, error: { code, details: { message: String(message) } } })

/** Thrown when an AI tool runs while the user holds control. */
class BrowserLockedError extends Error {
  constructor() {
    super('browser is under user control; wait for the user to release control (cockpit → "AI Active") before acting')
    this.name = 'BrowserLockedError'
    this.code = 'BROWSER_LOCKED'
  }
}

const SOM_SCRIPT = `
(() => {
  window.__apexSoM = (cap) => {
    cap = cap || 75;
    for (const b of document.querySelectorAll('[data-apex-mark]')) b.remove();
    const nodes = [...document.querySelectorAll('a,button,input,select,textarea,[role=button],[onclick],[contenteditable]')];
    const out = [];
    let n = 0;
    for (const el of nodes) {
      if (n >= cap) break;
      const r = el.getBoundingClientRect();
      if (r.width < 3 || r.height < 3 || r.bottom < 0 || r.right < 0 ||
          r.top > innerHeight || r.left > innerWidth) continue;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || s.pointerEvents === 'none') continue;
      const id = ++n;
      el.setAttribute('data-apex-mark', String(id));
      const badge = document.createElement('div');
      badge.setAttribute('data-apex-mark', String(id));
      badge.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;' +
        'left:' + Math.max(0, r.left) + 'px;top:' + Math.max(0, r.top) + 'px;';
      badge.innerHTML = '<span style="position:absolute;left:-2px;top:-14px;background:#e33;color:#fff;' +
        'font:bold 10px monospace;padding:0 3px;border-radius:3px;">[' + id + ']</span>' +
        '<span style="position:absolute;inset:0;border:1.5px solid rgba(227,51,51,.55);border-radius:2px;"></span>';
      document.documentElement.appendChild(badge);
      const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
      out.push({ id, tag: el.tagName.toLowerCase(), x: cx, y: cy,
        label: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.value || '').trim().slice(0, 60),
        href: el.tagName === 'A' ? (el.href || undefined) : undefined });
    }
    return out;
  };
})();`

/** Key → CDP { keyCode, code, key, text } for forwarded keystrokes. */
const KEYS = {
  Enter: { keyCode: 13, code: 'Enter', key: 'Enter', text: '\r' },
  Escape: { keyCode: 27, code: 'Escape', key: 'Escape' },
  Backspace: { keyCode: 8, code: 'Backspace', key: 'Backspace' },
  Tab: { keyCode: 9, code: 'Tab', key: 'Tab' },
  Delete: { keyCode: 46, code: 'Delete', key: 'Delete' },
  ' ': { keyCode: 32, code: 'Space', key: ' ', text: ' ' },
  ArrowUp: { keyCode: 38, code: 'ArrowUp', key: 'ArrowUp' },
  ArrowDown: { keyCode: 40, code: 'ArrowDown', key: 'ArrowDown' },
  ArrowLeft: { keyCode: 37, code: 'ArrowLeft', key: 'ArrowLeft' },
  ArrowRight: { keyCode: 39, code: 'ArrowRight', key: 'ArrowRight' },
  Home: { keyCode: 36, code: 'Home', key: 'Home' },
  End: { keyCode: 35, code: 'End', key: 'End' },
  PageUp: { keyCode: 33, code: 'PageUp', key: 'PageUp' },
  PageDown: { keyCode: 34, code: 'PageDown', key: 'PageDown' },
}

/** One live page: its own CDP session, screencast frames, SoM labels. */
class ApexPage {
  constructor(page, context, cfg) {
    this.page = page
    this.context = context
    this.cfg = cfg
    this.id = `t${++ApexPage.counter}`
    this.labels = []
    this.consoleErrors = []
    this.netErrors = []
    this.frame = null
    this.frameSeq = 0
    this.waiters = new Set()
    this.castOn = false
    this.session = null
    this.disposed = false
    page.on('console', (m) => {
      if (m.type() === 'error' && this.consoleErrors.length < 20) this.consoleErrors.push(m.text().slice(0, 200))
    })
    page.on('requestfailed', (r) => {
      if (this.netErrors.length < 20) this.netErrors.push(`${r.failure()?.errorText || 'failed'} ${r.url().slice(0, 120)}`)
    })
    page.on('close', () => this.dispose())
  }

  dispose() {
    this.disposed = true
    this.castOn = false
    for (const wake of this.waiters) wake()
    this.waiters.clear()
  }

  /** Lazily (re)create the CDP session — it dies with a crashed page. */
  async cdp() {
    if (!this.session || this.session.isClosed?.()) {
      this.session = await this.context.newCDPSession(this.page)
      this.session.on('Page.screencastFrame', (ev) => {
        this.session.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {})
        const meta = ev.metadata || {}
        this.frame = {
          seq: ++this.frameSeq,
          base64: ev.data,
          w: meta.deviceWidth || this.cfg.viewport.width,
          h: meta.deviceHeight || this.cfg.viewport.height,
          scrollX: meta.scrollOffsetX || 0,
          scrollY: meta.scrollOffsetY || 0,
          url: this.page.url(),
        }
        for (const wake of this.waiters) wake()
        this.waiters.clear()
      })
    }
    return this.session
  }

  async startCast() {
    if (this.castOn || this.disposed || this.cfg.streamFps === 0) return
    const cdp = await this.cdp()
    await cdp.send('Page.enable').catch(() => {})
    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: this.cfg.quality,
      maxWidth: this.cfg.viewport.width,
      maxHeight: this.cfg.viewport.height,
      everyNthFrame: Math.max(1, Math.round(60 / Math.max(1, this.cfg.streamFps))),
    })
    this.castOn = true
  }

  async stopCast() {
    if (!this.castOn) return
    this.castOn = false
    const cdp = await this.cdp().catch(() => null)
    await cdp?.send('Page.stopScreencast').catch(() => {})
  }

  /** Resolve with the newest frame if it is newer than `seq`, else on next frame. */
  async nextFrame(seq, timeoutMs = 900, fallback = true) {
    if (this.frame && this.frame.seq > (seq || 0)) return this.frame
    await new Promise((res) => {
      const timer = setTimeout(done, timeoutMs)
      const self = this
      function done() {
        clearTimeout(timer)
        self.waiters.delete(done)
        res()
      }
      this.waiters.add(done)
    })
    if (this.frame && this.frame.seq > (seq || 0)) return this.frame
    // Headless Chromium emits no screencast frame while the page is visually
    // idle, which would leave the cockpit canvas blank. Screenshot on demand and
    // feed it into the same slot so the UI always has something to draw.
    if (!fallback || this.disposed) return this.frame
    try {
      const buf = await this.page.screenshot({ type: 'jpeg', quality: this.cfg.quality, timeout: 4000 })
      this.frame = {
        seq: ++this.frameSeq,
        base64: buf.toString('base64'),
        w: this.cfg.viewport.width,
        h: this.cfg.viewport.height,
        scrollX: 0,
        scrollY: 0,
        url: this.page.url(),
        still: true,
      }
      return this.frame
    } catch {
      return this.frame
    }
  }

  async som() {
    try {
      this.labels = await this.page.evaluate((src) => {
        // Re-inject on demand: addInitScript only covers pages loaded after boot.
        if (!window.__apexSoM) (0, eval)(src)
        return window.__apexSoM(75)
      }, SOM_SCRIPT)
    } catch {
      this.labels = []
    }
    return this.labels
  }
}
ApexPage.counter = 0

export function apply(ctx, config) {
  const cfg = {
    profileDir: config?.profileDir || '.browser-profile',
    streamFps: config?.streamFps ?? 12,
    quality: config?.quality ?? 60,
    viewport: config?.viewport || { width: 1280, height: 800 },
  }
  const pkgDir = resolve(dirname(new URL(import.meta.url).pathname), '..')
  const profileDir = resolve(pkgDir, cfg.profileDir)

  const state = {
    context: null,
    pages: new Map(),
    activeId: null,
    aiActive: false,
    releaseWaiters: [],
    events: [],
    streams: new Set(),
  }

  const t0 = Date.now()
  function emit(kind, text) {
    const row = { t: Date.now(), kind, text: String(text).slice(0, 300) }
    state.events.push(row)
    if (state.events.length > 300) state.events.splice(0, state.events.length - 300)
    for (const s of state.streams) {
      try { s.write(`event: events\ndata: ${JSON.stringify(row)}\n\n`) } catch { state.streams.delete(s) }
    }
  }

  /** Gate AI tool calls while the user has taken over. */
  const lock = {
    async acquire() {
      while (state.aiActive) await new Promise((res) => state.releaseWaiters.push(res))
    },
    take() {
      if (state.aiActive) return false
      state.aiActive = true
      emit('lock', 'User took control — AI paused')
      return true
    },
    release() {
      if (!state.aiActive) return false
      state.aiActive = false
      emit('lock', 'AI control resumed')
      for (const w of state.releaseWaiters.splice(0)) w()
      return true
    },
  }

  /**
   * Resolve Playwright ourselves instead of relying on a bare `import()`.
   * DSH loads host plugins through its own module loader with a different bare
   * specifier base, so `import('playwright')` can fail even though the package
   * sits next to us. Anchoring on this module's URL always works.
   */
  let playwrightMod = null
  function loadPlaywright() {
    if (playwrightMod) return playwrightMod
    const require = createRequire(import.meta.url)
    const candidates = [
      import.meta.url,
      resolve(pkgDir, 'package.json'),
      resolve(pkgDir, 'lib/index.js'),
      resolve(process.cwd(), 'package.json'),
    ]
    let lastErr = null
    for (const anchor of candidates) {
      try {
        // Playwright is CommonJS: require() it directly and skip the
        // ESM<->CJS interop that mangles its namespace.
        const pw = createRequire(anchor)('playwright')
        if (!pw?.chromium) throw new Error('playwright has no chromium export')
        playwrightMod = pw
        return playwrightMod
      } catch (err) { lastErr = err }
    }
    throw new Error(`apex: cannot resolve playwright (${lastErr?.message || 'not installed'})`)
  }

  /** Download Chromium when the browser cache was wiped (e.g. a container restart). */
  async function ensureChromium(playwright) {
    const executable = playwright.chromium.executablePath?.()
    if (executable && existsSync(executable)) return executable
    emit('life', 'Chromium missing — downloading (~130MB, one time)')
    const require = createRequire(import.meta.url)
    const cli = require.resolve('playwright/cli.js')
    await new Promise((res, rej) => {
      const child = spawn(process.execPath, [cli, 'install', 'chromium'], {
        stdio: 'ignore',
        env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || '/tmp/home/.cache/ms-playwright' },
      })
      child.on('error', rej)
      child.on('exit', (code) => (code === 0 ? res() : rej(new Error(`playwright install exited ${code}`))))
    })
    return playwright.chromium.executablePath?.()
  }

  async function ensureBrowser() {
    if (state.context && state.context.browser()?.isConnected()) return
    const playwright = loadPlaywright()
    const { chromium } = playwright
    await ensureChromium(playwright).catch((e) => emit('warn', `chromium install: ${e.message}`))
    await mkdir(profileDir, { recursive: true })
    const args = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    const launch = { headless: true, args, viewport: cfg.viewport }
    try {
      state.context = await chromium.launchPersistentContext(profileDir, { ...launch, channel: 'chromium' })
    } catch {
      state.context = await chromium.launchPersistentContext(profileDir, launch)
    }
    state.context.on('page', () => emit('tab', 'Page opened'))
    emit('life', 'Chromium context ready')
  }

  /** Current page, lazily created; also wires the screencast. */
  async function active() {
    await ensureBrowser()
    let rec = state.pages.get(state.activeId)
    if (rec && !rec.disposed) return rec
    const existing = state.context.pages().find((p) => !p.isClosed())
    const page = existing ?? (await state.context.newPage())
    rec = [...state.pages.values()].find((r) => r.page === page && !r.disposed)
    if (!rec) {
      rec = new ApexPage(page, state.context, cfg)
      state.pages.set(rec.id, rec)
    }
    state.activeId = rec.id
    rec.startCast().catch(() => {})
    return rec
  }

  /** Cheap structural snapshot; no network, no layout thrash beyond title(). */
  async function snapshot() {
    const rec = await active()
    const tabs = []
    for (const [id, r] of state.pages) {
      if (r.disposed) continue
      let title = ''
      try { title = await r.page.title() } catch {}
      tabs.push({ id, title: title.slice(0, 80), url: r.page.url(), active: id === state.activeId })
    }
    return {
      url: rec.page.url(),
      title: tabs.find((t) => t.active)?.title || '',
      tabs,
      aiActive: state.aiActive,
      som: rec.labels.slice(0, 75),
      viewport: cfg.viewport,
      errors: { console: rec.consoleErrors.slice(-5), network: rec.netErrors.slice(-5) },
    }
  }

  /** Input dispatch — coordinates are already in CSS pixels of the viewport. */
  async function dispatchInput(rec, payload) {
    const cdp = await rec.cdp()
    const kind = payload?.kind
    if (kind === 'mouse') {
      const { type, x, y, button = 'left', clickCount = 1, modifiers = 0, deltaY = 0, deltaX = 0 } = payload
      if (type === 'wheel') {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX, deltaY, modifiers })
      } else {
        await cdp.send('Input.dispatchMouseEvent', { type, x, y, button, clickCount, modifiers })
      }
      return { ok: true }
    }
    if (kind === 'key') {
      const { type, key, modifiers = 0 } = payload
      const mapped = KEYS[key] || { keyCode: 0, code: key, key }
      const base = { modifiers, key: mapped.key, code: mapped.code, windowsVirtualKeyCode: mapped.keyCode, nativeVirtualKeyCode: mapped.keyCode }
      await cdp.send('Input.dispatchKeyEvent', { type: type === 'keyDown' ? 'keyDown' : 'keyUp', ...base, text: type === 'keyDown' ? mapped.text : undefined })
      return { ok: true }
    }
    if (kind === 'text') {
      await cdp.send('Input.insertText', { text: String(payload.text || '') })
      return { ok: true }
    }
    throw new Error(`unknown input kind: ${kind}`)
  }

  async function control(action, payload) {
    const rec = await active()
    switch (action) {
      case 'navigate': {
        const url = String(payload.url || '')
        if (!/^https?:|^about:|^data:/.test(url)) throw new Error('only http(s) URLs can be loaded')
        await rec.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => emit('warn', e.message))
        emit('nav', rec.page.url())
        return await snapshot()
      }
      case 'back': await rec.page.goBack({ timeout: 15000 }).catch(() => {}); emit('nav', rec.page.url()); return await snapshot()
      case 'forward': await rec.page.goForward({ timeout: 15000 }).catch(() => {}); emit('nav', rec.page.url()); return await snapshot()
      case 'reload': await rec.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}); emit('nav', rec.page.url()); return await snapshot()
      case 'som': {
        rec.labels = await rec.som()
        emit('som', `${rec.labels.length} elements marked`)
        return { elements: rec.labels, aiActive: state.aiActive }
      }
      case 'takeover': lock.take(); return await snapshot()
      case 'release': lock.release(); return await snapshot()
      case 'select': {
        const target = state.pages.get(payload.id)
        if (!target || target.disposed) throw new Error('no such tab')
        state.activeId = payload.id
        await target.page.bringToFront().catch(() => {})
        await target.startCast().catch(() => {})
        return await snapshot()
      }
      case 'new': {
        const page = await state.context.newPage()
        const created = new ApexPage(page, state.context, cfg)
        state.pages.set(created.id, created)
        state.activeId = created.id
        await created.startCast().catch(() => {})
        emit('tab', 'New tab opened')
        return await snapshot()
      }
      case 'close': {
        const target = state.pages.get(payload.id ?? state.activeId)
        if (!target) throw new Error('no such tab')
        await target.page.close().catch(() => {})
        state.pages.delete(target.id)
        if (state.activeId === target.id) state.activeId = [...state.pages.keys()][0] ?? null
        emit('tab', 'Tab closed')
        return await snapshot()
      }
      case 'events': return { events: state.events.slice(-100) }
      default: throw new Error(`unknown control action: ${action}`)
    }
  }

  /** One request/response dispatcher shared by /apex/rpc and /apex/state. */
  async function rpc(endpoint, payload) {
    switch (endpoint) {
      case 'state': return await snapshot()
      case 'frame': {
        const rec = await active()
        await rec.startCast().catch(() => {})
        const frame = await rec.nextFrame(payload?.seq || 0)
        return frame ? { frame } : { frame: null }
      }
      case 'input': {
        const rec = await active()
        return await dispatchInput(rec, payload)
      }
      case 'control': return await control(payload?.action, payload || {})
      default: throw new Error(`unknown endpoint: ${endpoint}`)
    }
  }

  // ---- HTTP routes (direct webServer registration; no connection.rpc) ----
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/apex',
    handler: async (req, res) => {
      const url = new URL(req.url, 'http://localhost')
      const sub = url.pathname.slice('/apex'.length) || '/'
      const send = (code, body, headers = {}) => {
        res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers })
        res.end(JSON.stringify(body))
      }
      try {
        // Server-Sent Events: frame + event push for the cockpit canvas.
        if (sub === '/stream') {
          res.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
            'x-accel-buffering': 'no',
          })
          res.write(': apex stream open\n\n')
          state.streams.add(res)
          const rec = await active().catch(() => null)
          await rec?.startCast().catch(() => {})
          // Chromium only emits a screencast frame on visual change, so an idle
          // page would leave the cockpit canvas blank. Prime one frame and then
          // force a fresh compositor frame whenever the cast has gone quiet.
          let seq = 0
          const push = (frame) => {
            if (!frame || frame.seq <= seq || res.writableEnded) return false
            seq = frame.seq
            try { res.write(`event: frame\ndata: ${JSON.stringify(frame)}\n\n`); return true } catch { return false }
          }
          const recast = async () => {
            await rec?.stopCast().catch(() => {})
            await rec?.startCast().catch(() => {})
          }
          push(await rec?.nextFrame(0, 400).catch(() => null))
          let idle = 0
          const timer = setInterval(async () => {
            if (res.writableEnded) return
            const frame = await rec?.nextFrame(seq, 110, false).catch(() => null)
            if (push(frame)) { idle = 0; return }
            // No new frame: nudge the cast every ~2s so a static page still renders.
            if (++idle % 20 === 0) { await recast(); push(await rec?.nextFrame(seq, 400).catch(() => null)) }
            try { res.write(': keepalive\n\n') } catch { clearInterval(timer) }
          }, 60)
          const close = () => {
            clearInterval(timer)
            state.streams.delete(res)
          }
          req.on('close', close)
          res.on('close', close)
          return
        }

        if (req.method === 'GET' && (sub === '/state' || sub === '/')) return send(200, RPC_OK(await snapshot()))

        if (req.method === 'POST' && sub === '/rpc') {
          let raw = ''
          for await (const chunk of req) {
            raw += chunk
            if (raw.length > 2_000_000) throw new Error('request body too large')
          }
          const body = raw ? JSON.parse(raw) : {}
          return send(200, RPC_OK(await rpc(body.endpoint, body.payload)))
        }

        if (req.method === 'OPTIONS') return send(204, {})
        send(404, RPC_ERR(`unknown apex route: ${req.method} ${url.pathname}`, 'not_found'))
      } catch (err) {
        const locked = err instanceof BrowserLockedError || err?.code === 'BROWSER_LOCKED'
        send(locked ? 409 : 500, RPC_ERR(err?.message || err, locked ? 'browser_locked' : 'internal'))
      }
    },
  }), 'apex-browser: /apex routes')

  // ---- AI tools (each acquires the user-hand-off lock first) ----
  const output = (schema) => ({
    schema: schema || { type: 'object', additionalProperties: true },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2).slice(0, 20000) }],
  })
  const define = (name, description, parameters, run) => {
    ctx.effect(() => ctx.tools.register({
      name,
      description,
      parameters,
      output: output(),
      execute: async (args) => {
        await lock.acquire()
        try {
          return await run(args || {})
        } finally {
          // release only if AI still owns it (the user may have taken over mid-call)
        }
      },
    }), `apex-browser: tool ${name}`)
  }

  define('browser_goto', 'Navigate the shared Apex browser to a URL and return the resulting page state.', {
    type: 'object',
    properties: { url: { type: 'string', description: 'Absolute http(s) URL to load.' } },
    required: ['url'],
    additionalProperties: false,
  }, async (args) => {
    const snap = await control('navigate', { url: args.url })
    return { url: snap.url, title: snap.title, active: snap.aiActive }
  })

  define('browser_inspect', 'Return the current page URL/title, visible error logs, and Set-of-Mark elements (id, tag, center x/y, label) for the active tab. Call this before clicking so you have element ids.', {
    type: 'object',
    properties: {},
    additionalProperties: false,
  }, async () => {
    const rec = await active()
    const elements = await rec.som()
    return {
      url: rec.page.url(),
      title: await rec.page.title().catch(() => ''),
      elements,
      consoleErrors: rec.consoleErrors.slice(-5),
      networkErrors: rec.netErrors.slice(-5),
    }
  })

  define('browser_click', 'Click an element in the shared browser. Target by Set-of-Mark id (from browser_inspect, e.g. "3") or by a CSS selector.', {
    type: 'object',
    properties: {
      target: { type: 'string', description: 'Set-of-Mark numeric id or a CSS selector.' },
      button: { type: 'string', description: 'left (default), right, or middle.' },
    },
    required: ['target'],
    additionalProperties: false,
  }, async (args) => {
    const rec = await active()
    const target = String(args.target).trim()
    let point = rec.labels.find((l) => String(l.id) === target)
    if (!point) {
      const box = await rec.page.evaluate((sel) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
      }, target).catch(() => null)
      point = box
    }
    if (!point) throw new Error(`no element matched ${JSON.stringify(target)} (run browser_inspect first)`)
    const cdp = await rec.cdp()
    const button = args.button || 'left'
    const base = { x: point.x, y: point.y, button, clickCount: 1 }
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y })
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base })
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base })
    emit('action', `click ${target} @ ${point.x},${point.y}`)
    return { clicked: { id: target, x: point.x, y: point.y }, url: rec.page.url() }
  })

  define('browser_type', 'Type text into an element in the shared browser, optionally pressing Enter afterwards. Target by Set-of-Mark id or CSS selector.', {
    type: 'object',
    properties: {
      target: { type: 'string', description: 'Set-of-Mark numeric id or a CSS selector.' },
      text: { type: 'string', description: 'Text to type.' },
      press_enter: { type: 'boolean', description: 'Press Enter after typing.' },
      submit: { type: 'boolean', description: 'Alias for press_enter.' },
    },
    required: ['target', 'text'],
    additionalProperties: false,
  }, async (args) => {
    const rec = await active()
    const target = String(args.target).trim()
    const selector = rec.labels.find((l) => String(l.id) === target) ? `[data-apex-mark="${target}"]` : target
    const focusable = await rec.page.$(selector).catch(() => null)
    if (!focusable) throw new Error(`no element matched ${JSON.stringify(target)} (run browser_inspect first)`)
    await focusable.click({ timeout: 5000 }).catch(() => focusable.focus().catch(() => {}))
    await rec.page.keyboard.type(String(args.text), { delay: 8 })
    if (args.press_enter || args.submit) await rec.page.keyboard.press('Enter')
    emit('action', `type into ${target}`)
    return { typed: String(args.text).length, submitted: Boolean(args.press_enter || args.submit), url: rec.page.url() }
  })

  define('browser_scroll', 'Scroll the shared browser viewport up or down.', {
    type: 'object',
    properties: {
      direction: { type: 'string', enum: ['up', 'down', 'top', 'bottom'], description: 'Scroll direction.' },
      amount: { type: 'integer', description: 'Pixels for up/down (default 600).' },
    },
    required: ['direction'],
    additionalProperties: false,
  }, async (args) => {
    const rec = await active()
    const dir = args.direction || 'down'
    if (dir === 'top' || dir === 'bottom') {
      await rec.page.evaluate((to) => window.scrollTo({ top: to === 'bottom' ? document.body.scrollHeight : 0, behavior: 'instant' }), dir)
    } else {
      const px = Number(args.amount ?? 600) * (dir === 'up' ? -1 : 1)
      const cdp = await rec.cdp()
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 400, y: 300, deltaX: 0, deltaY: px })
    }
    await rec.page.waitForTimeout(150).catch(() => {})
    const at = await rec.page.evaluate(() => ({ x: window.scrollX, y: window.scrollY, h: document.body.scrollHeight })).catch(() => ({}))
    emit('action', `scroll ${dir}`)
    return { direction: dir, scroll: at, url: rec.page.url() }
  })

  define('browser_extract', 'Extract readable text from the page (or a specific selector). Returns title, URL, and text truncated to ~8000 characters.', {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'Optional CSS selector; omit for the main content.' },
      query_or_selector: { type: 'string', description: 'Alias for selector.' },
    },
    additionalProperties: false,
  }, async (args) => {
    const rec = await active()
    const selector = args.selector || args.query_or_selector
    const text = await rec.page.evaluate((sel) => {
      const root = sel ? document.querySelector(sel) : (document.body || document.documentElement)
      if (!root) return null
      return (root.innerText || root.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
    }, selector || null).catch(() => null)
    if (text === null) throw new Error(`no element matched ${JSON.stringify(selector)}`)
    emit('action', 'extract text')
    return {
      url: rec.page.url(),
      title: await rec.page.title().catch(() => ''),
      text: text.slice(0, 8000),
      truncated: text.length > 8000,
    }
  })

  ctx.effect(function* () {
    yield
    return async () => {
      for (const s of state.streams) { try { s.end() } catch {} }
      state.streams.clear()
      for (const rec of state.pages.values()) { rec.dispose?.() }
      state.pages.clear()
      await state.context?.close().catch(() => {})
      state.context = null
    }
  })

  console.log(`dsh-plugin-apex-browser ready — routes /apex/*, profile ${profileDir}, t=${Date.now() - t0}ms`)
}

export const Config = undefined
