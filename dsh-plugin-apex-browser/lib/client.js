/**
 * dsh-plugin-apex-browser — Client half (browser cockpit UI).
 *
 * Talks to the host over plain HTTP (`/apex/stream` SSE for frames + events,
 * `/apex/rpc` POST for control) instead of `connection.rpc`, whose channel
 * registration is broken in this build.
 *
 * Registers:
 *   • sidebar tab type "apex" (guide entry + pane body + title)
 *   • shell.overlay pop-out window (drag + resize, dark glass)
 * Both render the same `Cockpit`: screencast canvas, mouse/wheel/keyboard
 * forwarding, control bar, SoM toggle, take-over lock, ghost AI cursor, ripple
 * and an action/thought timeline drawer.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-apex-browser',
  factory: (require) => {
    // The loader evaluates this factory as a plain function body: `module` and
    // `exports` are NOT provided. Declare them, exactly as shipped client
    // plugins do, or `exports.apply = …` throws "exports is not defined".
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const jsx = require('react/jsx-runtime')
    const { useState, useRef, useEffect, useCallback } = React
    const h = jsx.jsx
    const ID = 'dsh-plugin-apex-browser'

    const CSS = [
      '.apx-root{position:absolute;inset:0;display:flex;flex-direction:column;color:#e8ecf4;overflow:hidden;',
      'background:linear-gradient(160deg,rgba(18,23,36,.94),rgba(11,15,24,.92));backdrop-filter:blur(14px);',
      'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace}',
      '.apx-bar{display:flex;align-items:center;gap:5px;padding:6px 8px;flex:none;border-bottom:1px solid rgba(120,140,180,.18)}',
      '.apx-btn{background:rgba(120,140,180,.1);border:1px solid rgba(120,140,180,.22);color:#cdd6e8;border-radius:6px;',
      'padding:3px 7px;font:inherit;cursor:pointer;flex:none;line-height:1.2}',
      '.apx-btn:hover{background:rgba(120,140,180,.2)}',
      '.apx-btn:disabled{opacity:.45;cursor:default}',
      '.apx-btn.on{border-color:#e33;color:#ff9c9c;background:rgba(227,51,51,.14)}',
      '.apx-url{flex:1;min-width:40px;background:rgba(8,11,18,.72);border:1px solid rgba(120,140,180,.22);color:#e8ecf4;',
      'border-radius:6px;padding:3px 8px;font:inherit;outline:none}',
      '.apx-url:focus{border-color:#6f9bff}',
      '.apx-view{position:relative;flex:1;min-height:0;overflow:hidden;background:#05070c;cursor:crosshair;outline:none}',
      '.apx-canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}',
      '.apx-ghost{position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;border:2px solid rgba(111,155,255,.95);',
      'border-radius:50%;pointer-events:none;z-index:5;box-shadow:0 0 12px rgba(111,155,255,.65);',
      'transition:left .32s cubic-bezier(.22,1,.36,1),top .32s cubic-bezier(.22,1,.36,1)}',
      '.apx-ripple{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border:2px solid rgba(227,51,51,.9);',
      'border-radius:50%;pointer-events:none;z-index:6;animation:apxR .55s ease-out forwards}',
      '@keyframes apxR{to{transform:scale(3.4);opacity:0}}',
      '.apx-tip{position:absolute;pointer-events:none;z-index:7;background:rgba(9,12,20,.94);',
      'border:1px solid rgba(111,155,255,.42);color:#bcd0ff;font-size:10px;padding:2px 6px;border-radius:4px;white-space:nowrap}',
      '.apx-hint{position:absolute;left:8px;bottom:8px;z-index:7;color:#6d7f9e;font-size:10px;pointer-events:none}',
      '.apx-drawer{flex:none;display:flex;flex-direction:column;border-top:1px solid rgba(120,140,180,.18);',
      'background:rgba(9,12,20,.86);max-height:170px}',
      '.apx-drawer.min{max-height:25px}',
      '.apx-dhead{display:flex;align-items:center;gap:8px;padding:4px 8px;flex:none;cursor:pointer;color:#8fa3c8}',
      '.apx-rows{overflow-y:auto;padding:0 8px 6px}',
      '.apx-row{display:flex;gap:8px;padding:2px 0;font-size:11px;border-bottom:1px dashed rgba(120,140,180,.1)}',
      '.apx-ms{color:#46d19a;flex:none}.apx-kind{color:#6f9bff;flex:none;width:54px;text-transform:uppercase}',
      '.apx-tabs{display:flex;gap:4px;overflow-x:auto;max-width:230px;flex:none}',
      '.apx-tab{flex:none;max-width:92px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;',
      'border:1px solid rgba(120,140,180,.22);border-radius:5px;padding:2px 6px;color:#9db0d0}',
      '.apx-tab.on{border-color:#6f9bff;color:#d5e3ff}',
      '.apx-pop{position:fixed;z-index:10000;display:flex;border-radius:12px;overflow:hidden;',
      'box-shadow:0 18px 60px rgba(0,0,0,.6);border:1px solid rgba(120,140,180,.25)}',
      '.apx-grip{display:flex;align-items:center;gap:8px;cursor:move;user-select:none;flex:none;padding:5px 8px;',
      'border-bottom:1px solid rgba(120,140,180,.18);color:#8fa3c8;font-size:10px;letter-spacing:.09em;text-transform:uppercase}',
      '.apx-resize{position:absolute;right:0;bottom:0;width:14px;height:14px;cursor:nwse-resize;z-index:9}',
    ].join('')

    // ---- tiny shared store so the sidebar can pop the window out ----
    const popStore = { open: false, subs: new Set() }
    const setPop = (open) => { popStore.open = open; for (const s of popStore.subs) s(open) }
    const usePop = () => {
      const [open, set] = useState(popStore.open)
      useEffect(() => { popStore.subs.add(set); return () => popStore.subs.delete(set) }, [])
      return open
    }

    /** POST /apex/rpc — same-origin, so the session cookie rides along. */
    async function rpc(endpoint, payload) {
      const res = await fetch('/apex/rpc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint, payload: payload || {} }),
      })
      const body = await res.json().catch(() => null)
      if (!body) throw new Error(`apex ${endpoint}: HTTP ${res.status}`)
      if (!body.ok) throw new Error(body.error?.details?.message || `apex ${endpoint} failed`)
      return body.value
    }
    const control = (action, extra) => rpc('control', { action, ...(extra || {}) })

    /** Keyboard keys forwarded as discrete events; printable text goes via insertText. */
    const NAV_KEYS = new Set(['Enter', 'Escape', 'Backspace', 'Tab', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'])
    const modMask = (e) => (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0)

    function Cockpit({ embedded }) {
      const [snap, setSnap] = useState({ url: '', title: '', tabs: [], aiActive: false, som: [] })
      const [urlText, setUrlText] = useState('')
      const [drawerOpen, setDrawerOpen] = useState(true)
      const [events, setEvents] = useState([])
      const [ghost, setGhost] = useState(null)
      const [ripples, setRipples] = useState([])
      const [tip, setTip] = useState('')
      const [err, setErr] = useState('')
      const canvasRef = useRef(null)
      const viewRef = useRef(null)
      const frameRef = useRef(null)
      const seqRef = useRef(0)
      const draggingRef = useRef(false)
      const lastMoveRef = useRef(0)

      const pushEvent = useCallback((row) => {
        setEvents((prev) => prev.concat(row).slice(-100))
        const m = /@ (\d+),(\d+)$/.exec(row.text || '')
        if (m) setGhost({ x: +m[1], y: +m[2] })
      }, [])

      // Screencast: one SSE stream drives the canvas and the timeline.
      useEffect(() => {
        const es = new EventSource('/apex/stream')
        es.addEventListener('frame', (ev) => {
          let f
          try { f = JSON.parse(ev.data) } catch { return }
          if (!f || f.seq <= seqRef.current) return
          seqRef.current = f.seq
          frameRef.current = f
          const img = new Image()
          img.onload = () => {
            const canvas = canvasRef.current
            if (!canvas) return
            const box = viewRef.current?.getBoundingClientRect()
            if (box) {
              const dpr = Math.min(window.devicePixelRatio || 1, 2)
              canvas.width = Math.max(1, Math.round(box.width * dpr))
              canvas.height = Math.max(1, Math.round(box.height * dpr))
            }
            const ctx2d = canvas.getContext('2d')
            ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height)
          }
          img.src = `data:image/jpeg;base64,${f.base64}`
        })
        es.addEventListener('events', (ev) => {
          try { pushEvent(JSON.parse(ev.data)) } catch {}
        })
        es.onerror = () => setErr('stream disconnected — retrying')
        es.onopen = () => setErr('')
        return () => es.close()
      }, [pushEvent])

      // Light state poll: tabs, url, aiActive.
      useEffect(() => {
        let alive = true
        const tick = async () => {
          try {
            const s = await rpc('state')
            if (!alive) return
            setSnap(s)
            setUrlText((prev) => (document.activeElement?.classList.contains('apx-url') ? prev : s.url))
            setErr('')
          } catch (e) { if (alive) setErr(e.message) }
        }
        tick()
        const id = setInterval(tick, 1200)
        return () => { alive = false; clearInterval(id) }
      }, [])

      /** Client pixel → page CSS pixel, accounting for object-fit: contain. */
      const toPage = useCallback((e) => {
        const f = frameRef.current
        const box = viewRef.current?.getBoundingClientRect()
        if (!f || !box) return null
        const iw = f.w || 1, ih = f.h || 1
        const scale = Math.min(box.width / iw, box.height / ih)
        const ox = (box.width - iw * scale) / 2
        const oy = (box.height - ih * scale) / 2
        const x = (e.clientX - box.left - ox) / scale
        const y = (e.clientY - box.top - oy) / scale
        if (x < 0 || y < 0 || x > iw || y > ih) return null
        return { x: Math.round(x), y: Math.round(y) }
      }, [])

      /** User input takes control implicitly the first time it lands. */
      const ensureControl = useCallback(async () => {
        if (snap.aiActive) return
        try { await control('takeover'); setSnap((s) => ({ ...s, aiActive: true })) } catch {}
      }, [snap.aiActive])

      const sendInput = useCallback((payload) => { rpc('input', payload).catch((e) => setErr(e.message)) }, [])

      const onMouse = (type) => async (e) => {
        const p = toPage(e)
        if (!p) return
        if (type === 'mousePressed') {
          viewRef.current?.focus()
          await ensureControl()
        }
        sendInput({ kind: 'mouse', type, x: p.x, y: p.y, button: e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left', clickCount: 1, modifiers: modMask(e) })
        if (type === 'mouseReleased') {
          const id = Date.now()
          setRipples((r) => r.concat({ id, x: p.x, y: p.y, iw: frameRef.current?.w || 1, ih: frameRef.current?.h || 1 }))
          setTimeout(() => setRipples((r) => r.filter((x) => x.id !== id)), 600)
        }
      }

      const onMove = (e) => {
        const now = Date.now()
        if (now - lastMoveRef.current < 40) return
        lastMoveRef.current = now
        const p = toPage(e)
        if (!p) return
        const label = snap.som?.find((s) => Math.abs(s.x - p.x) < 14 && Math.abs(s.y - p.y) < 14)
        setTip(label ? `[${label.id}] ${label.label || label.tag}` : '')
        sendInput({ kind: 'mouse', type: 'mouseMoved', x: p.x, y: p.y, modifiers: 0 })
      }

      const onWheel = (e) => {
        e.preventDefault()
        const p = toPage(e)
        if (!p) return
        sendInput({ kind: 'mouse', type: 'wheel', x: p.x, y: p.y, deltaX: e.deltaX, deltaY: e.deltaY, modifiers: modMask(e) })
      }

      const onKey = async (e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          try { const s = await control('release'); setSnap(s) } catch {}
          return
        }
        if (e.metaKey || e.ctrlKey) {
          if (['c', 'v', 'x', 'a', 'l'].includes(e.key.toLowerCase()) && !e.altKey) return // let the browser keep clipboard shortcuts
        }
        await ensureControl()
        if (NAV_KEYS.has(e.key)) {
          e.preventDefault()
          const type = e.type === 'keydown' ? 'keyDown' : 'keyUp'
          sendInput({ kind: 'key', type, key: e.key === ' ' ? ' ' : e.key, modifiers: modMask(e) })
          return
        }
        if (e.type === 'keydown' && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault()
          sendInput({ kind: 'text', text: e.key })
        }
      }

      const view = h('div', {
        className: 'apx-view',
        ref: viewRef,
        tabIndex: 0,
        onMouseDown: onMouse('mousePressed'),
        onMouseUp: onMouse('mouseReleased'),
        onMouseMove: onMove,
        onWheel,
        onKeyDown: onKey,
        onKeyUp: onKey,
        onContextMenu: (e) => e.preventDefault(),
      }, [
        h('canvas', { key: 'cv', className: 'apx-canvas', ref: canvasRef }),
        ghost && h('div', { key: 'gh', className: 'apx-ghost', style: ghostStyle(ghost, frameRef.current) }),
        ...ripples.map((r) => h('div', { key: r.id, className: 'apx-ripple', style: posStyle(r) })),
        tip && h('div', { key: 'tip', className: 'apx-tip', style: { left: 8, top: 8 } }, tip),
        !snap.tabs.length && err ? h('div', { key: 'err', className: 'apx-hint' }, err) : null,
        h('div', { key: 'hint', className: 'apx-hint' }, snap.aiActive ? 'AI paused — Esc to hand back' : 'AI active — interact to take over'),
      ])

      const bar = h('div', { className: 'apx-bar' }, [
        h('button', { key: 'b', className: 'apx-btn', title: 'Back', onClick: () => control('back').then(setSnap).catch((e) => setErr(e.message)) }, '←'),
        h('button', { key: 'f', className: 'apx-btn', title: 'Forward', onClick: () => control('forward').then(setSnap).catch((e) => setErr(e.message)) }, '→'),
        h('button', { key: 'r', className: 'apx-btn', title: 'Reload', onClick: () => control('reload').then(setSnap).catch((e) => setErr(e.message)) }, '⟳'),
        h('form', {
          key: 'u',
          style: { flex: 1, display: 'flex', minWidth: 0 },
          onSubmit: (e) => {
            e.preventDefault()
            const url = /^https?:/.test(urlText) ? urlText : `https://${urlText}`
            control('navigate', { url }).then((s) => { setSnap(s); setUrlText(s.url) }).catch((er) => setErr(er.message))
          },
        }, [h('input', { key: 'i', className: 'apx-url', value: urlText, spellCheck: false, onChange: (e) => setUrlText(e.target.value), placeholder: 'https://…' })]),
        h('button', {
          key: 'ai',
          className: `apx-btn${snap.aiActive ? ' on' : ''}`,
          title: snap.aiActive ? 'Release control back to the AI (Esc)' : 'Take over the browser (pauses AI tools)',
          onClick: () => control(snap.aiActive ? 'release' : 'takeover').then(setSnap).catch((e) => setErr(e.message)),
        }, snap.aiActive ? 'Take Over (Esc)' : 'AI Active'),
        h('button', {
          key: 'som',
          className: `apx-btn${snap.som?.length ? ' on' : ''}`,
          title: 'Highlight interactive elements and refresh labels',
          onClick: () => control('som').then(() => rpc('state')).then(setSnap).catch((e) => setErr(e.message)),
        }, `SoM${snap.som?.length ? ` ${snap.som.length}` : ''}`),
        embedded ? null : h('button', { key: 'pop', className: 'apx-btn', title: 'Pop out', onClick: () => setPop(true) }, '⤢'),
      ])

      const tabStrip = h('div', { className: 'apx-bar', style: { paddingTop: 0 } }, [
        h('div', { key: 'tabs', className: 'apx-tabs' }, snap.tabs.map((t) => h('div', {
          key: t.id,
          className: `apx-tab${t.active ? ' on' : ''}`,
          title: t.url,
          onClick: () => control('select', { id: t.id }).then(setSnap).catch(() => {}),
        }, t.title || t.url || 'about:blank'))),
        h('button', { key: 'new', className: 'apx-btn', title: 'New tab', onClick: () => control('new').then(setSnap).catch(() => {}) }, '+'),
        h('button', { key: 'close', className: 'apx-btn', title: 'Close tab', onClick: () => control('close', { id: snap.tabs.find((t) => t.active)?.id }).then(setSnap).catch(() => {}) }, '×'),
      ])

      const drawer = h('div', { className: `apx-drawer${drawerOpen ? '' : ' min'}` }, [
        h('div', { key: 'dh', className: 'apx-dhead', onClick: () => setDrawerOpen(!drawerOpen) },
          `${drawerOpen ? '▾' : '▸'} Action & thought timeline · ${events.length}`),
        drawerOpen ? h('div', { key: 'rows', className: 'apx-rows' }, events.slice().reverse().slice(0, 60).map((r, i) =>
          h('div', { key: `${r.t}-${i}`, className: 'apx-row' }, [
            h('span', { key: 'ms', className: 'apx-ms' }, new Date(r.t).toLocaleTimeString()),
            h('span', { key: 'k', className: 'apx-kind' }, r.kind),
            h('span', { key: 'x' }, r.text),
          ]))) : null,
      ])

      return h('div', { className: 'apx-root' }, [bar, tabStrip, view, drawer])
    }

    function posStyle(r) {
      return { left: `${(r.x / (r.iw || 1)) * 100}%`, top: `${(r.y / (r.ih || 1)) * 100}%` }
    }
    function ghostStyle(g, f) {
      if (!f) return { left: '50%', top: '50%' }
      return { left: `${(g.x / (f.w || 1)) * 100}%`, top: `${(g.y / (f.h || 1)) * 100}%` }
    }

    /** Draggable, resizable floating cockpit. */
    function PopOut() {
      const open = usePop()
      const [rect, setRect] = useState({ x: 120, y: 90, w: 820, h: 560 })
      const drag = useRef(null)
      useEffect(() => {
        const move = (e) => {
          const d = drag.current
          if (!d) return
          if (d.mode === 'move') setRect((r) => ({ ...r, x: Math.max(0, d.x + e.clientX - d.sx), y: Math.max(0, d.y + e.clientY - d.sy) }))
          else setRect((r) => ({ ...r, w: Math.max(420, d.w + e.clientX - d.sx), h: Math.max(320, d.h + e.clientY - d.sy) }))
        }
        const up = () => { drag.current = null }
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', up)
        return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
      }, [])
      if (!open) return null
      return h('div', {
        className: 'apx-pop',
        style: { left: rect.x, top: rect.y, width: rect.w, height: rect.h },
      }, [
        h('div', {
          key: 'grip',
          className: 'apx-grip',
          onMouseDown: (e) => { drag.current = { mode: 'move', sx: e.clientX, sy: e.clientY, x: rect.x, y: rect.y } },
        }, [
          h('span', { key: 'l' }, 'Apex Cockpit'),
          h('span', { key: 's', style: { flex: 1 } }),
          h('button', { key: 'c', className: 'apx-btn', onClick: () => setPop(false), style: { pointerEvents: 'auto' } }, '✕'),
        ]),
        h('div', { key: 'body', style: { position: 'relative', flex: 1, minHeight: 0, display: 'flex' } }, [h(Cockpit, { key: 'ck', embedded: true })]),
        h('div', {
          key: 'rz',
          className: 'apx-resize',
          onMouseDown: (e) => { e.stopPropagation(); drag.current = { mode: 'size', sx: e.clientX, sy: e.clientY, w: rect.w, h: rect.h } },
        }),
      ])
    }

    /** Guide-page entry: opens the cockpit tab. */
    function GuideEntry({ ctx }) {
      return h('button', {
        className: 'apx-btn',
        onClick: () => ctx.sidebarRight.openTab('apex'),
      }, 'Open Apex Browser')
    }

    function apply(ctx) {
      ctx.effect(function* () {
        yield
        const style = document.createElement('style')
        style.dataset.plugin = ID
        style.textContent = CSS
        document.head.appendChild(style)
        document.body.classList.add('apx-loaded')

        yield ctx.sidebarRightTabs.register({
          id: ID,
          kind: 'apex',
          priority: 'extension',
          title: () => 'Browser',
          guide: [{
            id: 'open',
            order: 60,
            title: () => 'Apex Browser',
            description: () => 'Shared live browser with AI hand-off',
          }],
        })

        yield ctx.slots.inject('sidebar.right.tab.guide.entry', () => ctx.slots.register({
          name: 'sidebar.right.tab.guide.entry',
          key: ID,
          inject: () => ({ ctx }),
        }, GuideEntry))

        yield ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: ID,
          inject: () => ({}),
        }, () => h(Cockpit, { embedded: true })))

        yield ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab.title',
          key: ID,
          inject: () => ({}),
        }, () => h('span', {}, 'Browser')))

        yield ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: `${ID}.popout`,
          inject: () => ({}),
        }, PopOut))

        yield () => { style.remove(); document.body.classList.remove('apx-loaded') }
      }, 'apex-browser: cockpit UI')

      console.log('apex-browser: client ready')
    }

    const name = ID
    const inject = ['slots', 'sidebarRight', 'sidebarRightTabs']
    exports.apply = apply
    exports.inject = inject
    exports.name = name
    return module.exports
  },
})
