import { renderWithProviders, screen, userEvent, waitFor } from '@test-utils'
import QueueDrawer from '../components/encoding/QueueDrawer'

const baseJobs = [
  {
    id: 'one',
    file: {
      name: 'clip-one.mp4',
      path: '/videos/clip-one.mp4',
      size: 1_048_576,
      modified: new Date('2024-01-05T12:00:00Z').getTime()
    },
    status: 'pending' as const,
    progress: 0,
    attempts: 0,
    maxRetries: 2
  },
  {
    id: 'two',
    file: {
      name: 'holiday-final.mkv',
      path: '/videos/holiday-final.mkv',
      size: 734_003_200,
      modified: new Date('2023-12-24T18:30:00Z').getTime()
    },
    status: 'pending' as const,
    progress: 0,
    attempts: 0,
    maxRetries: 2
  }
]

describe('QueueDrawer', () => {
  test('renders queue stats and file cards', () => {
    renderWithProviders(
      <QueueDrawer
        isOpen
        onClose={jest.fn()}
        jobs={baseJobs}
        selectedJobIds={[baseJobs[0].id]}
      />
    )

    expect(screen.getByText(/Video Queue/i)).toBeInTheDocument()
    expect(screen.getByText(/2\s*files/i)).toBeInTheDocument()
    expect(screen.getByText(/1\s*selected/i)).toBeInTheDocument()
    expect(screen.getByText('701 MB')).toBeInTheDocument()

    expect(screen.getByText(baseJobs[0].file.name)).toBeInTheDocument()
    expect(screen.getByText(baseJobs[1].file.name)).toBeInTheDocument()
    expect(screen.getByText(/Selected/)).toBeInTheDocument()
  })

  test('filters list via search input', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <QueueDrawer isOpen onClose={jest.fn()} jobs={baseJobs} selectedJobIds={[]} />
    )

    await user.type(screen.getByPlaceholderText(/Filter files/i), 'holiday')

    expect(screen.getByText(baseJobs[1].file.name)).toBeInTheDocument()
    expect(screen.queryByText(baseJobs[0].file.name)).not.toBeInTheDocument()
    expect(screen.queryByText(/Try a different search term/i)).not.toBeInTheDocument()
  })

  test('invokes file selection callback and toggles control states', async () => {
    const user = userEvent.setup()
    const onSelectFile = jest.fn()
    const onSelectAll = jest.fn()
    const onClearSelection = jest.fn()

    const { rerender } = renderWithProviders(
      <QueueDrawer
        isOpen
        onClose={jest.fn()}
        jobs={baseJobs}
        selectedJobIds={[]}
        onSelectJob={onSelectFile}
        onSelectAll={onSelectAll}
        onClearSelection={onClearSelection}
      />
    )

    const selectAllButton = screen.getByRole('button', { name: /Select All/i })
    const clearButton = screen.getByRole('button', { name: /Deselect/i })
    const removeButton = screen.getByRole('button', { name: /Remove/i })

    expect(selectAllButton).not.toBeDisabled()
    expect(clearButton).not.toBeDisabled()
    expect(removeButton).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /clip-one\.mp4/i }))
    await waitFor(() => expect(onSelectFile).toHaveBeenCalledWith(baseJobs[0].id))

    await user.click(selectAllButton)
    expect(onSelectAll).toHaveBeenCalled()

    await user.click(clearButton)
    expect(onClearSelection).toHaveBeenCalled()

    rerender(
      <QueueDrawer
        isOpen
        onClose={jest.fn()}
        jobs={baseJobs}
        selectedJobIds={[baseJobs[0].id]}
        onSelectJob={onSelectFile}
        onSelectAll={onSelectAll}
        onClearSelection={onClearSelection}
      />
    )

    expect(screen.getByRole('button', { name: /Deselect/i })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /Remove/i })).not.toBeDisabled()
  })

  test('supports keyboard selection and respects encoding lock', async () => {
    const user = userEvent.setup()
    const onSelectFile = jest.fn()

    const { rerender } = renderWithProviders(
      <QueueDrawer
        isOpen
        onClose={jest.fn()}
        jobs={baseJobs}
        selectedJobIds={[]}
        onSelectJob={onSelectFile}
      />
    )

    const cardButton = screen.getByRole('button', { name: /holiday-final\.mkv/i })
    cardButton.focus()
    await user.keyboard('{Enter}')
    expect(onSelectFile).toHaveBeenCalledWith(baseJobs[1].id)

    rerender(
      <QueueDrawer
        isOpen
        onClose={jest.fn()}
        jobs={baseJobs}
        selectedJobIds={[]}
        onSelectJob={onSelectFile}
        isEncoding
      />
    )

    expect(screen.queryByRole('button', { name: /holiday-final\.mkv/i })).not.toBeInTheDocument()

    await user.click(screen.getByText(baseJobs[1].file.name))
    expect(onSelectFile).toHaveBeenCalledTimes(1)
  })
})
