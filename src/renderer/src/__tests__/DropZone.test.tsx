import { fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockWindowApi, renderWithProviders, screen } from '@test-utils'
import { DropZone } from '../components/shared/DropZone'

test('resolves dropped native paths through Electron webUtils', () => {
  const api = mockWindowApi()
  api.getPathForFile.mockReturnValue('C:\\videos\\sample.3gp')
  const onFilesDropped = jest.fn()
  renderWithProviders(
    <DropZone
      isEncoding={false}
      queueCount={0}
      onFilesDropped={onFilesDropped}
      onBrowseFolder={jest.fn()}
      onLoadSession={jest.fn()}
    />
  )
  const file = new File(['video'], 'sample.3gp', { lastModified: 100 })
  fireEvent.drop(screen.getByRole('button', { name: /Drop video files here/ }), {
    dataTransfer: { files: [file] }
  })
  expect(api.getPathForFile).toHaveBeenCalledWith(file)
  expect(onFilesDropped).toHaveBeenCalledWith([
    { name: 'sample.3gp', path: 'C:\\videos\\sample.3gp', size: 5, modified: 100 }
  ])
})

test('loading a queue with the keyboard does not also open the folder picker', async () => {
  const user = userEvent.setup()
  const onBrowseFolder = jest.fn()
  const onLoadSession = jest.fn()
  renderWithProviders(
    <DropZone
      isEncoding={false}
      queueCount={0}
      onFilesDropped={jest.fn()}
      onBrowseFolder={onBrowseFolder}
      onLoadSession={onLoadSession}
    />
  )
  screen.getByRole('button', { name: 'Load Queue' }).focus()
  await user.keyboard('{Enter}')
  expect(onLoadSession).toHaveBeenCalledTimes(1)
  expect(onBrowseFolder).not.toHaveBeenCalled()
})

test('unsupported drops explain why no files were added', () => {
  const onFilesDropped = jest.fn()
  renderWithProviders(
    <DropZone
      isEncoding={false}
      queueCount={0}
      onFilesDropped={onFilesDropped}
      onBrowseFolder={jest.fn()}
      onLoadSession={jest.fn()}
    />
  )
  fireEvent.drop(screen.getByRole('region', { name: 'Add videos' }), {
    dataTransfer: { files: [new File(['text'], 'notes.txt')] }
  })
  expect(screen.getByRole('status')).toHaveTextContent('No supported videos were found')
  expect(onFilesDropped).not.toHaveBeenCalled()
})

test('mixed drops add supported videos and disclose skipped files', () => {
  mockWindowApi()
  const onFilesDropped = jest.fn()
  renderWithProviders(
    <DropZone
      isEncoding={false}
      queueCount={0}
      onFilesDropped={onFilesDropped}
      onBrowseFolder={jest.fn()}
      onLoadSession={jest.fn()}
    />
  )
  fireEvent.drop(screen.getByRole('region', { name: 'Add videos' }), {
    dataTransfer: { files: [new File(['video'], 'video.mp4'), new File(['text'], 'notes.txt')] }
  })
  expect(onFilesDropped.mock.calls[0][0]).toHaveLength(1)
  expect(screen.getByRole('status')).toHaveTextContent('1 file was skipped')
})

test('processing locks browsing, loading, and dropping', () => {
  const onFilesDropped = jest.fn()
  renderWithProviders(
    <DropZone
      isEncoding
      queueCount={0}
      onFilesDropped={onFilesDropped}
      onBrowseFolder={jest.fn()}
      onLoadSession={jest.fn()}
    />
  )
  expect(screen.getByRole('button', { name: /Drop video files here/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Load Queue' })).toBeDisabled()
  fireEvent.drop(screen.getByRole('region', { name: 'Add videos' }), {
    dataTransfer: { files: [new File(['video'], 'video.mp4')] }
  })
  expect(onFilesDropped).not.toHaveBeenCalled()
})
