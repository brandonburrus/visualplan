import { pluginColorChips } from 'expressive-code-color-chips'
import type { RehypeExpressiveCodeOptions } from 'rehype-expressive-code'

/**
 * The isomorphic Expressive Code configuration shared by the CLI render path and the
 * in-browser `/view` compiler, so highlighted code looks identical in both.
 *
 * Color chips render a swatch next to CSS color values; the plugin inlines its markup at
 * build time, so the single-file output stays self-contained. The Material file-type icon
 * plugin is deliberately NOT here: it reads SVGs from disk (`@visualplan/compile/file-icons`),
 * so it is Node-only and the CLI appends it; the browser omits it (no disk, multi-MB asset set).
 */
export const baseExpressiveCodeOptions: RehypeExpressiveCodeOptions = {
  themes: ['github-dark', 'github-light'],
  useDarkModeMediaQuery: true,
  plugins: [pluginColorChips()],
  // The copy-button script does not execute reliably in our client-rendered SPA;
  // frames (titles) are CSS-only, so keep those and drop the interactive button.
  frames: { showCopyToClipboardButton: false },
  // Match the flat ink design: our borders/radius/surfaces/fonts, no shadow, no
  // colored tab accent. Values are CSS vars so the frame chrome tracks light/dark too.
  styleOverrides: {
    borderRadius: '10px',
    borderColor: 'var(--vp-border)',
    codeBackground: 'var(--vp-surface)',
    codeFontFamily: 'var(--vp-mono)',
    codeFontSize: '0.8rem',
    codeLineHeight: '1.6',
    codePaddingBlock: '0.9rem',
    codePaddingInline: '1rem',
    uiFontFamily: 'var(--vp-font)',
    uiFontSize: '0.78rem',
    frames: {
      frameBoxShadowCssValue: 'none',
      // A flat filename header on the same surface as the code, separated by one
      // border. No editor-tab metaphor, no colored indicator line.
      editorBackground: 'var(--vp-surface)',
      editorTabBarBackground: 'var(--vp-surface)',
      editorTabBarBorderBottomColor: 'var(--vp-border)',
      editorActiveTabBackground: 'var(--vp-surface)',
      editorActiveTabForeground: 'var(--vp-muted)',
      editorActiveTabBorderColor: 'transparent',
      editorActiveTabIndicatorTopColor: 'transparent',
      editorActiveTabIndicatorBottomColor: 'transparent',
      editorTabsMarginInlineStart: '0',
      terminalBackground: 'var(--vp-surface)',
      terminalTitlebarBackground: 'var(--vp-surface)',
      terminalTitlebarForeground: 'var(--vp-muted)',
      terminalTitlebarBorderBottomColor: 'var(--vp-border)',
    },
  },
}
