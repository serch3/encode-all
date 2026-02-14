import { renderWithProviders, screen, userEvent, waitFor } from '@test-utils'
import ThemeToggle from '../components/layout/ThemeToggle'

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  test('renders with default light theme when no preference saved', () => {
    // Mock system preference as light
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn()
    }))

    renderWithProviders(<ThemeToggle />)
    const toggle = screen.getByRole('switch')
    expect(toggle).not.toBeChecked()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  test('renders with dark theme when system prefers dark', () => {
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn()
    }))

    renderWithProviders(<ThemeToggle />)
    const toggle = screen.getByRole('switch')
    expect(toggle).toBeChecked()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  test('loads saved theme from localStorage', () => {
    localStorage.setItem('theme', 'dark')
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn()
    }))

    renderWithProviders(<ThemeToggle />)
    const toggle = screen.getByRole('switch')
    expect(toggle).toBeChecked()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  test('toggles theme on click and saves to localStorage', async () => {
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn()
    }))

    renderWithProviders(<ThemeToggle />)
    const toggle = screen.getByRole('switch')

    expect(toggle).not.toBeChecked()
    // Theme is not saved to localStorage until user explicitly toggles
    expect(localStorage.getItem('theme')).toBeNull()

    await userEvent.click(toggle)

    await waitFor(() => {
      expect(toggle).toBeChecked()
      expect(localStorage.getItem('theme')).toBe('dark')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })

    await userEvent.click(toggle)

    await waitFor(() => {
      expect(toggle).not.toBeChecked()
      expect(localStorage.getItem('theme')).toBe('light')
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })
  })

  test('handles localStorage errors gracefully', () => {
    const mockSetItem = jest.spyOn(Storage.prototype, 'setItem')
    mockSetItem.mockImplementation(() => {
      throw new Error('Storage quota exceeded')
    })

    // Suppress console.warn for this test since we expect warnings
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn()
    }))

    // Should not throw
    expect(() => renderWithProviders(<ThemeToggle />)).not.toThrow()

    mockSetItem.mockRestore()
    consoleSpy.mockRestore()
  })

  test('handles invalid localStorage data', () => {
    localStorage.setItem('theme', 'invalid-theme')
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn()
    }))

    renderWithProviders(<ThemeToggle />)
    // Should fall back to system preference (light in this case)
    const toggle = screen.getByRole('switch')
    expect(toggle).not.toBeChecked()
  })

  test('listens to system theme changes when no preference is saved', async () => {
    // Suppress console.warn for this test
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

    const listeners: Array<(e: MediaQueryListEvent) => void> = []
    const mockMatchMedia = {
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
        if (event === 'change') {
          listeners.push(handler)
        }
      }),
      removeEventListener: jest.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
        if (event === 'change') {
          const index = listeners.indexOf(handler)
          if (index > -1) listeners.splice(index, 1)
        }
      }),
      dispatchEvent: jest.fn()
    }

    window.matchMedia = jest.fn().mockReturnValue(mockMatchMedia)

    const { act } = await import('@testing-library/react')

    renderWithProviders(<ThemeToggle />)
    const toggle = screen.getByRole('switch')

    expect(toggle).not.toBeChecked()

    // Simulate system theme change wrapped in act
    await act(async () => {
      listeners.forEach((listener) => {
        listener({ matches: true } as MediaQueryListEvent)
      })
    })

    await waitFor(() => {
      expect(toggle).toBeChecked()
    })

    consoleSpy.mockRestore()
  })

  test('does not respond to system changes when user has set preference', async () => {
    localStorage.setItem('theme', 'light')
    const listeners: Array<(e: MediaQueryListEvent) => void> = []
    const mockMatchMedia = {
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
        if (event === 'change') {
          listeners.push(handler)
        }
      }),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn()
    }

    window.matchMedia = jest.fn().mockReturnValue(mockMatchMedia)

    renderWithProviders(<ThemeToggle />)
    const toggle = screen.getByRole('switch')

    expect(toggle).not.toBeChecked()

    // Simulate system theme change - should be ignored since user preference exists
    listeners.forEach((listener) => {
      listener({ matches: true } as MediaQueryListEvent)
    })

    await waitFor(() => {
      expect(toggle).not.toBeChecked() // Should remain light
    })
  })
})
