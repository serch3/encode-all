const STORAGE_KEY = 'theme'

function getSystemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
  )
}

try {
  const root = document.documentElement
  let theme = (localStorage.getItem(STORAGE_KEY) as 'light' | 'dark' | null) || null
  if (theme !== 'light' && theme !== 'dark') {
    theme = getSystemPrefersDark() ? 'dark' : 'light'
  }
  root.classList.toggle('dark', theme === 'dark')
  root.setAttribute('data-theme', theme)
} catch {
  // ignore
}
