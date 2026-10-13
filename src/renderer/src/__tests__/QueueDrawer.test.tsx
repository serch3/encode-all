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
      <QueueDrawer isOpen onClose={jest.fn()} jobs={baseJobs} selectedJobIds={[baseJobs[0].id]} />
    )

    expect(screen.getByText(/Video Queue/i)).toBeInTheDocument()
    expect(screen.getByText(/2\s*files/i)).toBeInTheDocument()
    expect(screen.getByText(/1\s*selected/i)).toBeInTheDocument()
    expect(screen.getByText('701 MB')).toBeInTheDocument()

    expect(screen.getByText(baseJobs[0].file.name)).toBeInTheDocument()
    expect(screen.getByText(baseJobs[1].file.name)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: baseJobs[0].file.name })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
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
    const removeButton = screen.getByRole('button', { name: /^Remove selected/i })

    expect(selectAllButton).not.toBeDisabled()
    expect(clearButton).not.toBeDisabled()
    expect(removeButton).toBeDisabled()

    await user.click(screen.getByRole('button', { name: baseJobs[0].file.name }))
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
    expect(screen.getByRole('button', { name: /^Remove selected/i })).not.toBeDisabled()
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

    const cardButton = screen.getByRole('button', { name: baseJobs[1].file.name })
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

    expect(screen.getByRole('button', { name: baseJobs[1].file.name })).toBeDisabled()

    await user.click(screen.getByText(baseJobs[1].file.name))
    expect(onSelectFile).toHaveBeenCalledTimes(1)
  })
})

test('filtered bulk actions affect matching files and disclose hidden selections', async () => {
  const user = userEvent.setup()
  const onSelectAll = jest.fn()
  const onClearSelection = jest.fn()
  const onRemoveJobs = jest.fn()
  renderWithProviders(
    <QueueDrawer
      isOpen
      onClose={jest.fn()}
      jobs={baseJobs}
      selectedJobIds={['one', 'two']}
      onSelectAll={onSelectAll}
      onClearSelection={onClearSelection}
      onRemoveJobs={onRemoveJobs}
    />
  )
  await user.type(screen.getByRole('textbox', { name: 'Filter queued videos' }), 'holiday')
  expect(screen.getByText(/1 selected outside this filter/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Select matches' }))
  await user.click(screen.getByRole('button', { name: 'Deselect matches' }))
  await user.click(screen.getByRole('button', { name: 'Remove matches (1)' }))
  expect(onSelectAll).toHaveBeenCalledWith(['two'])
  expect(onClearSelection).toHaveBeenCalledWith(['two'])
  expect(onRemoveJobs).toHaveBeenCalledWith(['two'])
  expect(screen.getByRole('button', { name: 'Encode 2 files' })).toBeEnabled()
})

test('no search results can be recovered by clearing the filter', async () => {
  const user = userEvent.setup()
  renderWithProviders(<QueueDrawer isOpen onClose={jest.fn()} jobs={baseJobs} />)
  await user.type(screen.getByRole('textbox', { name: 'Filter queued videos' }), 'missing')
  expect(screen.getByText('No matching videos')).toBeInTheDocument()
  expect(screen.queryByText('Queue is empty')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Clear filter' }))
  expect(screen.getByText(baseJobs[0].file.name)).toBeInTheDocument()
})

test('edit and remove actions do not toggle selection and stay locked during preview', async () => {
  const user = userEvent.setup()
  const onSelectJob = jest.fn()
  const onRemoveJobs = jest.fn()
  const props = { isOpen: true, onClose: jest.fn(), jobs: baseJobs, onSelectJob, onRemoveJobs }
  const { rerender } = renderWithProviders(<QueueDrawer {...props} />)
  await user.click(
    screen.getByRole('button', { name: `Edit overrides for ${baseJobs[0].file.name}` })
  )
  expect(screen.getByText('Edit overrides')).toBeInTheDocument()
  expect(onSelectJob).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  await user.click(
    screen.getByRole('button', { name: `Remove ${baseJobs[0].file.name} from queue` })
  )
  expect(onRemoveJobs).toHaveBeenCalledWith(['one'])
  expect(onSelectJob).not.toHaveBeenCalled()
  rerender(<QueueDrawer {...props} isLocked />)
  expect(
    screen.getByRole('button', { name: `Edit overrides for ${baseJobs[0].file.name}` })
  ).toBeDisabled()
  expect(screen.getByRole('button', { name: baseJobs[0].file.name })).toBeDisabled()
})

test('completed selections cannot start a batch', () => {
  renderWithProviders(
    <QueueDrawer
      isOpen
      onClose={jest.fn()}
      jobs={[{ ...baseJobs[0], status: 'complete' }]}
      selectedJobIds={['one']}
    />
  )
  expect(screen.getByRole('button', { name: 'Encode selected' })).toBeDisabled()
  expect(screen.getByText(/selected videos are already complete/)).toBeInTheDocument()
})

test('per-file settings can be reset to inherit the batch settings', async () => {
  const user = userEvent.setup()
  const onUpdateJobOverrides = jest.fn()
  renderWithProviders(
    <QueueDrawer
      isOpen
      onClose={jest.fn()}
      jobs={[{ ...baseJobs[0], overrides: { twoPass: true, crf: 18 } }]}
      onUpdateJobOverrides={onUpdateJobOverrides}
      maxRetries={2}
    />
  )
  await user.click(
    screen.getByRole('button', { name: `Edit overrides for ${baseJobs[0].file.name}` })
  )
  await user.click(screen.getByRole('button', { name: 'Reset to batch settings' }))
  await user.click(screen.getByRole('button', { name: 'Save overrides' }))
  expect(onUpdateJobOverrides).toHaveBeenCalledWith('one', {}, 2)
})

test('clearing a per-file quality value restores inheritance instead of setting zero', async () => {
  const user = userEvent.setup()
  const onUpdateJobOverrides = jest.fn()
  renderWithProviders(
    <QueueDrawer
      isOpen
      onClose={jest.fn()}
      jobs={[{ ...baseJobs[0], overrides: { crf: 18 } }]}
      onUpdateJobOverrides={onUpdateJobOverrides}
    />
  )
  await user.click(
    screen.getByRole('button', { name: `Edit overrides for ${baseJobs[0].file.name}` })
  )
  await user.clear(screen.getByRole('spinbutton', { name: 'CRF/CQ' }))
  await user.click(screen.getByRole('button', { name: 'Save overrides' }))
  expect(onUpdateJobOverrides).toHaveBeenCalledWith('one', {}, 2)
})

test('status filters isolate failed jobs and can be cleared', async () => {
  const user = userEvent.setup()
  renderWithProviders(
    <QueueDrawer
      isOpen
      onClose={jest.fn()}
      jobs={[baseJobs[0], { ...baseJobs[1], status: 'error' }]}
      selectedJobIds={['one', 'two']}
    />
  )
  await user.selectOptions(screen.getByRole('combobox', { name: 'Queue status' }), 'error')
  expect(screen.queryByText(baseJobs[0].file.name)).not.toBeInTheDocument()
  expect(screen.getByText(baseJobs[1].file.name)).toBeInTheDocument()
  expect(screen.getByText(/1 selected outside this filter/)).toBeInTheDocument()
  await user.selectOptions(screen.getByRole('combobox', { name: 'Queue status' }), 'complete')
  await user.click(screen.getByRole('button', { name: 'Clear filter' }))
  expect(screen.getByText(baseJobs[0].file.name)).toBeInTheDocument()
})
