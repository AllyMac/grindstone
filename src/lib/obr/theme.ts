import OBR, { type Theme } from '@owlbear-rodeo/sdk'

// Mirrors the user's OBR theme onto the CSS variables in style.css, so the
// popover looks native and follows theme changes live.
function apply(theme: Theme) {
  const dark = theme.mode === 'DARK'
  const root = document.documentElement.style
  root.setProperty('--gs-bg', theme.background.default)
  root.setProperty('--gs-surface', theme.background.paper)
  root.setProperty('--gs-fg', theme.text.primary)
  root.setProperty('--gs-accent', theme.primary.main)
  root.setProperty('--gs-accent-fg', theme.primary.contrastText)
  // Status colours need to stay readable on both a dark and a light panel.
  root.setProperty('--gs-danger', dark ? '#ff7a85' : '#c62828')
  root.setProperty('--gs-success', dark ? '#6fdc9f' : '#1b7f4b')
  root.setProperty('--gs-warn', dark ? '#ffc25c' : '#b26a00')
  root.setProperty('color-scheme', dark ? 'dark' : 'light')
}

export function syncObrTheme(): () => void {
  let unsubscribe: (() => void) | undefined
  OBR.onReady(async () => {
    apply(await OBR.theme.getTheme())
    unsubscribe = OBR.theme.onChange(apply)
  })
  return () => unsubscribe?.()
}
