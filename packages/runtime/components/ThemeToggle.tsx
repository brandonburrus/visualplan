import { IconCheck, IconSettings } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import {
  getThemePreference,
  setThemePreference,
  type ThemePreference,
  watchSystemScheme,
} from '../theme.js'

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/**
 * A faint top-right cog (left of the share button) that opens a theme menu on hover or focus.
 * Choosing an option recolors the page live and remembers the choice in `localStorage` for this
 * plan; it never writes the CLI's `~/.vplan/config.json` (a static plan cannot reach the disk).
 * The CLI's inline bootstrap already set the initial scheme, so this only re-applies on a change.
 */
export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>('system')

  // The persisted preference is read after mount: server-rendered markup and tests have no
  // localStorage at module load, and the inline bootstrap has already applied the initial scheme.
  useEffect(() => {
    setPreference(getThemePreference())
  }, [])

  // Track the OS while the live preference is `system`; the cleanup runs when it changes away.
  useEffect(() => watchSystemScheme(() => preference), [preference])

  // Hover/focus-within reveals the menu on desktop, but macOS Safari and touch devices neither hover
  // nor focus a button on tap, so the cog also toggles an explicit open state for them.
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)

  // While open, a click outside or Escape closes the menu (the hover state cannot cover touch).
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const choose = (value: ThemePreference) => {
    setPreference(value)
    setThemePreference(value)
    setOpen(false)
  }

  return (
    <div className='vp-theme' data-open={open} ref={container}>
      <button
        type='button'
        className='vp-theme__icon'
        aria-label='Theme settings'
        aria-haspopup='menu'
        aria-expanded={open}
        title='Theme settings'
        onClick={() => setOpen(value => !value)}
      >
        <IconSettings size={17} />
      </button>
      <div className='vp-theme__pop' role='menu'>
        {OPTIONS.map(option => (
          <button
            key={option.value}
            type='button'
            className='vp-theme__opt'
            role='menuitemradio'
            aria-checked={preference === option.value}
            data-active={preference === option.value}
            onClick={() => choose(option.value)}
          >
            <span>{option.label}</span>
            {preference === option.value && <IconCheck size={15} />}
          </button>
        ))}
      </div>
    </div>
  )
}
