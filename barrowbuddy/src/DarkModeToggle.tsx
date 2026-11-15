import { useState } from 'react'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function storeTheme(theme: Theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
  }
}

function systemTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
}

applyTheme(readStoredTheme() ?? systemTheme())

export function DarkModeToggle() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  )
  const dark = theme === 'dark'

  function toggle() {
    const next: Theme = dark ? 'light' : 'dark'
    applyTheme(next)
    storeTheme(next)
    setTheme(next)
  }

  return (
    <button
      type="button"
      className="dark-toggle"
      onClick={toggle}
      aria-label="Dark mode"
      aria-pressed={dark}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
      </svg>
    </button>
  )
}