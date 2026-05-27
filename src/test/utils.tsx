/* eslint-disable react-refresh/only-export-components */
import { HeroUIProvider } from '@heroui/react'
import { PropsWithChildren, ReactElement } from 'react'
import { render, RenderOptions, RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  getWindowApiMock,
  mockWindowApi,
  resetWindowApiMock,
  type WindowApiMock
} from './mocks/windowApi'

const TestProviders = ({ children }: PropsWithChildren): ReactElement => (
  <HeroUIProvider>{children}</HeroUIProvider>
)

export * from '@testing-library/react'
export { userEvent, getWindowApiMock, mockWindowApi, resetWindowApiMock }
export type { WindowApiMock }

export function renderWithProviders(ui: ReactElement, options?: RenderOptions): RenderResult {
  return render(ui, { wrapper: TestProviders, ...options })
}
