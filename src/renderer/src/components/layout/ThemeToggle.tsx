import { Switch } from '@heroui/react'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'theme'

export const MoonIcon = (props: React.SVGProps<SVGSVGElement>): React.JSX.Element => (
  <svg
    aria-hidden="true"
    focusable="false"
    height="1em"
    role="presentation"
    viewBox="0 0 24 24"
    width="1em"
    {...props}
  >
    <path
      d="M21.53 15.93c-.16-.27-.61-.69-1.73-.49a8.46 8.46 0 01-1.88.13 8.409 8.409 0 01-5.91-2.82 8.068 8.068 0 01-1.44-8.66c.44-1.01.13-1.54-.09-1.76s-.77-.55-1.83-.11a10.318 10.318 0 00-6.32 10.21 10.475 10.475 0 007.04 8.99 10 10 0 002.89.55c.16.01.32.02.48.02a10.5 10.5 0 008.47-4.27c.67-.93.49-1.519.32-1.79z"
      fill="currentColor"
    />
  </svg>
)

export const SunIcon = (props: React.SVGProps<SVGSVGElement>): React.JSX.Element => (
  <svg
    aria-hidden="true"
    focusable="false"
    height="1em"
    role="presentation"
    viewBox="0 0 24 24"
    width="1em"
    {...props}
  >
    <g fill="currentColor">
      <path d="M19 12a7 7 0 11-7-7 7 7 0 017 7z" />
      <path d="M12 22.96a.969.969 0 01-1-.96v-.08a1 1 0 012 0 1.038 1.038 0 01-1 1.04zm7.14-2.82a1.024 1.024 0 01-.71-.29l-.13-.13a1 1 0 011.41-1.41l.13.13a1 1 0 010 1.41.984.984 0 01-.7.29zm-14.28 0a1.024 1.024 0 01-.71-.29 1 1 0 010-1.41l.13-.13a1 1 0 011.41 1.41l-.13.13a1 1 0 01-.7.29zM22 13h-.08a1 1 0 010-2 1.038 1.038 0 011.04 1 .969.969 0 01-.96 1zM2.08 13H2a1 1 0 010-2 1.038 1.038 0 011.04 1 .969.969 0 01-.96 1zm16.93-7.01a1.024 1.024 0 01-.71-.29 1 1 0 010-1.41l.13-.13a1 1 0 011.41 1.41l-.13.13a.984.984 0 01-.7.29zm-14.02 0a1.024 1.024 0 01-.71-.29l-.13-.14a1 1 0 011.41-1.41l.13.13a1 1 0 010 1.41.97.97 0 01-.7.3zM12 3.04a.969.969 0 01-1-.96V2a1 1 0 012 0 1.038 1.038 0 01-1 1.04z" />
    </g>
  </svg>
)

/**
 * Checks if the user's system prefers dark color scheme.
 *
 * @returns true if dark mode is preferred, false otherwise
 */
function getSystemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

/**
 * Applies the theme class to the document root element.
 *
 * @param theme - The theme to apply ('light' or 'dark')
 */
function applyThemeClass(theme: 'light' | 'dark'): void {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
}

/**
 * ThemeToggle component provides a switch to toggle between light and dark themes.
 *
 * @returns A themed switch component with sun/moon icons
 */
export default function ThemeToggle(): React.JSX.Element {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as 'light' | 'dark' | null
      if (saved === 'light' || saved === 'dark') return saved === 'dark'
    } catch (error) {
      console.warn('Unable to get theme from localStorage:', error)
    }
    return getSystemPrefersDark()
  })

  // Track if the user has explicitly set a preference
  const [hasUserPreference, setHasUserPreference] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved !== null
    } catch {
      return false
    }
  })

  // Apply theme class (but don't save to localStorage on mount)
  useEffect((): void => {
    applyThemeClass(isDark ? 'dark' : 'light')
  }, [isDark])

  // handle theme and save preference to localStorage
  const handleToggle = (value: boolean): void => {
    setIsDark(value)
    setHasUserPreference(true)
    try {
      localStorage.setItem(STORAGE_KEY, value ? 'dark' : 'light')
    } catch (error) {
      console.warn('Failed to save theme to localStorage:', error)
    }
  }

  // Listen for system theme changes
  useEffect(() => {
    // Only respond to system changes if user hasn't set a preference
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent): void => {
      if (!hasUserPreference) {
        setIsDark(e.matches)
      }
    }

    // Use modern addEventListener if available
    if (mq.addEventListener) {
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
    // Fallback
    return undefined
  }, [hasUserPreference])

  return (
    <Switch
      color="secondary"
      size="md"
      isSelected={isDark}
      onValueChange={handleToggle}
      thumbIcon={({ isSelected, className }) =>
        isSelected ? <SunIcon className={className} /> : <MoonIcon className={className} />
      }
    />
  )
}
