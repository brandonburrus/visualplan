/**
 * Builds the Review Queue **shell**: the single self-contained page the daemon serves at `/`. The
 * shell renders the left sidebar of queued plans and hosts the active plan in a same-origin iframe
 * (`/plan/<id>`); each plan iframe carries its own review chrome. The shell holds the daemon's
 * `/__vp_events` SSE open, which doubles as the liveness signal (closing the tab tears the daemon
 * down).
 *
 * This is the integration seam between the daemon (which calls this to serve `/`) and the runtime
 * shell UI. The body below is a placeholder so the daemon is serveable and testable before the real
 * React shell lands; the runtime work replaces it with a Vite single-file build of the runtime
 * `queue.html` entry (analogous to `buildHtml`). The signature is the contract and must not change:
 * a zero-arg async function returning one self-contained HTML string.
 */
export async function buildQueueShell(): Promise<string> {
  // Placeholder shell: lists the queue from the SSE stream so the backend is exercisable end to end
  // (curl/tests) before the styled React shell exists. Replaced by the real build.
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Review Queue</title></head>
<body>
<h1>Review Queue</h1>
<ul id="queue"></ul>
<iframe id="plan" title="active plan" style="width:100%;height:80vh;border:0"></iframe>
<script type="module">
const list = document.getElementById('queue')
const frame = document.getElementById('plan')
const es = new EventSource('/__vp_events')
es.addEventListener('queue', e => {
  const entries = JSON.parse(e.data)
  list.innerHTML = ''
  for (const entry of entries) {
    const li = document.createElement('li')
    li.textContent = entry.dir + ' / ' + entry.title + ' [' + entry.status + ']'
    li.style.cursor = 'pointer'
    li.onclick = () => { frame.src = '/plan/' + entry.id }
    list.appendChild(li)
  }
  const pending = entries.find(en => en.status === 'pending')
  if (pending && !frame.src) frame.src = '/plan/' + pending.id
})
</script>
</body>
</html>
`
}
