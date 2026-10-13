import { parseByteRange } from '../mediaRange'

test.each([
  ['bytes=0-127', { start: 0, end: 127 }],
  ['bytes=128-', { start: 128, end: 999 }],
  ['bytes=-128', { start: 872, end: 999 }],
  ['bytes=0-9999', { start: 0, end: 999 }],
  ['bytes=-9999', { start: 0, end: 999 }]
])('resolves valid range %s', (header, expected) => {
  expect(parseByteRange(header, 1000)).toEqual(expected)
})

test.each([
  'bytes=1000-',
  'bytes=5-4',
  'bytes=-0',
  'bytes=-',
  'bytes=0-1,4-5',
  'bytes=NaN-5',
  'items=0-5',
  'bytes=9999999999999999999-'
])('rejects unsatisfiable or malformed range %s', (header) => {
  expect(parseByteRange(header, 1000)).toBeNull()
})

test('rejects ranges for empty files', () => {
  expect(parseByteRange('bytes=0-', 0)).toBeNull()
})
