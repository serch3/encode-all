import { mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createOutputTransaction } from '../outputTransaction'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'encode-all-transaction-'))
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

test('publishes only a finished file and removes temporary assets', async () => {
  const output = join(directory, 'output.mp4')
  const work = await createOutputTransaction(output)
  await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' })
  await writeFile(work.path, 'finished video')
  await expect(work.commit(output)).resolves.toBe(14)
  await work.dispose()
  expect(await readFile(output, 'utf8')).toBe('finished video')
  expect(await readdir(directory)).toEqual(['output.mp4'])
})

test('never replaces a file created after output review', async () => {
  const output = join(directory, 'source.mp4')
  const work = await createOutputTransaction(output)
  await writeFile(work.path, 'encoded')
  await writeFile(output, 'original source')
  await expect(work.commit(output)).rejects.toMatchObject({ code: 'EEXIST' })
  await work.dispose()
  expect(await readFile(output, 'utf8')).toBe('original source')
})

test('cancel cleanup leaves no final output or temporary file', async () => {
  const output = join(directory, 'output.mkv')
  const work = await createOutputTransaction(output)
  await writeFile(work.path, 'partial video')
  await work.dispose()
  expect(await readdir(directory)).toEqual([])
})

test('rejects an empty output', async () => {
  const work = await createOutputTransaction(join(directory, 'output.mp4'))
  await writeFile(work.path, '')
  await expect(work.commit(join(directory, 'output.mp4'))).rejects.toThrow('empty output')
  await work.dispose()
})
