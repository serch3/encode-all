import { renderWithProviders, screen, fireEvent } from '@test-utils'
import QueueWorkspace from '../components/encoding/QueueWorkspace'
import type { QueuedJob } from '../types'

test('bounds the rendered rows for a large queue and searches the complete data set', () => {
  const jobs: QueuedJob[] = Array.from({ length: 10000 }, (_, index) => ({
    id: String(index),
    file: { name: `video-${index}.mp4`, path: `/videos/${index}.mp4`, size: 100, modified: 1 },
    status: 'pending',
    progress: 0,
    attempts: 0,
    maxRetries: 2
  }))
  renderWithProviders(
    <QueueWorkspace
      jobs={jobs}
      selectedIds={['9999']}
      locked={false}
      onSelect={jest.fn()}
      onSelectAll={jest.fn()}
      onManage={jest.fn()}
      onPreview={jest.fn()}
      onRetryMetadata={jest.fn()}
    />
  )
  expect(screen.getAllByRole('listitem').length).toBeLessThanOrEqual(14)
  fireEvent.change(screen.getByRole('textbox', { name: 'Search workspace queue' }), {
    target: { value: 'video-9999' }
  })
  expect(screen.getAllByRole('listitem')).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Select video-9999.mp4' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
})
