import { createRoot } from 'react-dom/client'
import { QueueShell } from './components/queue/QueueShell.js'
import { applyThemePreference, getThemePreference } from './theme.js'
import './theme.css'

/** Mount the Review Queue shell into the page. Unlike the plan entry (`main.tsx`) there is no plan to
 * import: the shell renders chrome plus the per-plan iframes the daemon serves at `/plan/<id>`. */
const container = document.getElementById('root')
if (!container) throw new Error('Visual Plan: #root element not found')
// Resolve the color scheme for parity with the plan page (the shell shares the same tokens).
applyThemePreference(getThemePreference())
createRoot(container).render(<QueueShell />)
