import '@testing-library/jest-dom'
import { mockWindowApi, resetWindowApiMock } from './mocks/windowApi'

// Establish the window.api surface once so tests can rely on it.
mockWindowApi()

const ensureMatchMedia = (): void => {
  if (typeof window.matchMedia === 'function') {
    return
  }

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn()
    }))
  })
}

const ensureResizeObserver = (): void => {
  if (typeof window.ResizeObserver === 'function') {
    return
  }

  class ResizeObserver {
    observe(): void {
      return undefined
    }
    unobserve(): void {
      return undefined
    }
    disconnect(): void {
      return undefined
    }
  }

  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: ResizeObserver
  })
}

ensureMatchMedia()
ensureResizeObserver()

const ensureRandomUUID = (): void => {
  const cryptoWithUuid = window.crypto as Crypto & { randomUUID?: () => string }
  if (typeof cryptoWithUuid.randomUUID === 'function') {
    return
  }

  let counter = 0
  Object.defineProperty(cryptoWithUuid, 'randomUUID', {
    configurable: true,
    writable: true,
    value: jest.fn(() => `test-uuid-${++counter}`)
  })
}

ensureRandomUUID()

beforeEach(() => {
  resetWindowApiMock()
  localStorage.clear()
  jest.clearAllMocks()
})
