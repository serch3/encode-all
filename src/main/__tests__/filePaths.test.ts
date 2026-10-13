import { filePathKey } from '../../shared/filePaths'

test('normalizes drive paths and UNC separators for Windows deduplication', () => {
  expect(filePathKey('C:/Videos/Clip.MP4', 'win32')).toBe(
    filePathKey('c:\\videos\\clip.mp4', 'win32')
  )
  expect(filePathKey('//Server/Share/日本語.MKV', 'win32')).toBe(
    filePathKey('\\\\server\\share\\日本語.mkv', 'win32')
  )
})

test('preserves case-sensitive paths on other platforms', () => {
  expect(filePathKey('/media/Clip.mp4', 'linux')).not.toBe(filePathKey('/media/clip.mp4', 'linux'))
})
