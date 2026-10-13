import { fireEvent } from '@testing-library/react'
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
