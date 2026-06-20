/** Toggle native fullscreen for an expandable element (code block, diagram, chart). */
export function toggleFullscreen(el: Element | null) {
  if (!el) return
  if (document.fullscreenElement === el) {
    void document.exitFullscreen()
  } else {
    void (el as HTMLElement).requestFullscreen?.()
  }
}

const svg = (paths: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`

const ICON = {
  minimize: svg(
    '<path d="M15 19v-2a2 2 0 0 1 2 -2h2"/><path d="M15 5v2a2 2 0 0 0 2 2h2"/><path d="M5 15h2a2 2 0 0 1 2 2v2"/><path d="M5 9h2a2 2 0 0 0 2 -2v-2"/>',
  ),
  zoomIn: svg(
    '<path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M7 10l6 0"/><path d="M10 7l0 6"/><path d="M21 21l-6 -6"/>',
  ),
  zoomOut: svg(
    '<path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M7 10l6 0"/><path d="M21 21l-6 -6"/>',
  ),
}

/** The zoomable inner element for each kind of expandable host (diagrams, charts). */
function contentOf(host: HTMLElement): HTMLElement | null {
  if (host.classList.contains('vp-mermaid')) return host.querySelector('.vp-mermaid__svg')
  if (host.classList.contains('vp-chart')) return host.querySelector('.vp-chart__canvas')
  return null
}

/**
 * Pan/zoom controller for a fullscreen surface. Uses an absolutely-positioned
 * content layer with a `translate() scale()` transform (origin 0,0) so zoom-to-point
 * math is exact. On open it fits the content to fill the viewport and centers it;
 * it supports drag-pan, two-finger touch pinch, and trackpad pinch (ctrl + wheel).
 */
class PanZoom {
  private scale = 1
  private x = 0
  private y = 0
  private fitScale = 1
  private readonly pointers = new Map<number, { x: number; y: number }>()
  private pinchDist = 0
  private readonly ac = new AbortController()

  constructor(
    private readonly host: HTMLElement,
    private readonly content: HTMLElement,
    private readonly toolbar: HTMLElement,
  ) {
    content.classList.add('vp-fs-content')
    this.bind()
    requestAnimationFrame(() => this.fit())
  }

  private apply() {
    this.content.style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.scale})`
    const label = this.toolbar.querySelector('.vp-fs-zoom')
    if (label) label.textContent = `${Math.round((this.scale / this.fitScale) * 100)}%`
  }

  fit() {
    this.content.style.transform = 'none'
    const cw = this.content.offsetWidth || 1
    const ch = this.content.offsetHeight || 1
    const hw = this.host.clientWidth
    const hh = this.host.clientHeight
    const pad = 56
    this.fitScale = Math.min((hw - pad) / cw, (hh - pad) / ch)
    this.scale = this.fitScale
    this.x = (hw - cw * this.scale) / 2
    this.y = (hh - ch * this.scale) / 2
    this.apply()
  }

  zoomBy(factor: number) {
    this.zoomAt(factor, this.host.clientWidth / 2, this.host.clientHeight / 2)
  }

  reset() {
    this.fit()
  }

  private zoomAt(factor: number, cx: number, cy: number) {
    const next = Math.max(this.fitScale * 0.5, Math.min(this.fitScale * 12, this.scale * factor))
    const px = (cx - this.x) / this.scale
    const py = (cy - this.y) / this.scale
    this.x = cx - px * next
    this.y = cy - py * next
    this.scale = next
    this.apply()
  }

  private bind() {
    const { signal } = this.ac
    const host = this.host

    host.addEventListener(
      'wheel',
      event => {
        event.preventDefault()
        const rect = host.getBoundingClientRect()
        const cx = event.clientX - rect.left
        const cy = event.clientY - rect.top
        if (event.ctrlKey) this.zoomAt(Math.exp(-event.deltaY * 0.01), cx, cy)
        else {
          this.x -= event.deltaX
          this.y -= event.deltaY
          this.apply()
        }
      },
      { signal, passive: false },
    )

    host.addEventListener(
      'pointerdown',
      event => {
        if ((event.target as HTMLElement).closest('.vp-fs-toolbar')) return
        host.setPointerCapture(event.pointerId)
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
        host.style.cursor = 'grabbing'
      },
      { signal },
    )

    host.addEventListener(
      'pointermove',
      event => {
        const prev = this.pointers.get(event.pointerId)
        if (!prev) return
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
        const points = [...this.pointers.values()]
        if (points.length === 1) {
          this.x += event.clientX - prev.x
          this.y += event.clientY - prev.y
          this.apply()
        } else if (points.length === 2) {
          const a = points[0]
          const b = points[1]
          if (!a || !b) return
          const dist = Math.hypot(a.x - b.x, a.y - b.y)
          if (this.pinchDist > 0) {
            const rect = host.getBoundingClientRect()
            this.zoomAt(
              dist / this.pinchDist,
              (a.x + b.x) / 2 - rect.left,
              (a.y + b.y) / 2 - rect.top,
            )
          }
          this.pinchDist = dist
        }
      },
      { signal },
    )

    const release = (event: PointerEvent) => {
      this.pointers.delete(event.pointerId)
      if (this.pointers.size < 2) this.pinchDist = 0
      if (this.pointers.size === 0) host.style.cursor = 'grab'
    }
    host.addEventListener('pointerup', release, { signal })
    host.addEventListener('pointercancel', release, { signal })
    window.addEventListener('resize', () => this.fit(), { signal })
  }

  destroy() {
    this.ac.abort()
    this.content.classList.remove('vp-fs-content')
    this.content.style.transform = ''
    this.host.style.cursor = ''
  }
}

function buildToolbar(): HTMLElement {
  const toolbar = document.createElement('div')
  toolbar.className = 'vp-fs-toolbar'
  toolbar.innerHTML =
    `<button type="button" class="vp-fs-btn" data-act="out" aria-label="Zoom out">${ICON.zoomOut}</button>` +
    `<button type="button" class="vp-fs-btn vp-fs-zoom" data-act="reset" aria-label="Fit to screen">100%</button>` +
    `<button type="button" class="vp-fs-btn" data-act="in" aria-label="Zoom in">${ICON.zoomIn}</button>` +
    `<button type="button" class="vp-fs-btn vp-fs-close" data-act="close" aria-label="Exit fullscreen">${ICON.minimize}</button>`
  return toolbar
}

let viewer: PanZoom | null = null
let initialized = false

/**
 * Install the in-fullscreen pan/zoom viewer + control toolbar (zoom out / level /
 * zoom in / close). Built when any `.vp-expandable` enters fullscreen and torn down
 * on exit, so it works for code blocks, diagrams, and charts uniformly.
 */
export function initFullscreenControls() {
  if (initialized) return
  initialized = true
  document.addEventListener('fullscreenchange', () => {
    viewer?.destroy()
    viewer = null
    for (const existing of document.querySelectorAll('.vp-fs-toolbar')) existing.remove()
    const el = document.fullscreenElement as HTMLElement | null
    if (!el?.classList.contains('vp-expandable')) return
    const content = contentOf(el)
    if (!content) return
    const toolbar = buildToolbar()
    el.appendChild(toolbar)
    const panZoom = new PanZoom(el, content, toolbar)
    viewer = panZoom
    toolbar.addEventListener('click', event => {
      const act = (event.target as HTMLElement).closest('button')?.dataset.act
      if (act === 'close') void document.exitFullscreen()
      else if (act === 'in') panZoom.zoomBy(1.25)
      else if (act === 'out') panZoom.zoomBy(0.8)
      else if (act === 'reset') panZoom.reset()
    })
  })
}
