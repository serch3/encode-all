import { mkdtemp, readdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createStateStore } from '../stateStore'

test('serializes concurrent checkpoints, restores the last snapshot, and cleans temporary files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'encode-all-state-'))
  try {
    const store = createStateStore(directory)
    await expect(store.read('queue')).resolves.toBeNull()
    await Promise.all(
      Array.from({ length: 20 }, (_, revision) => store.write('queue', [{ revision }]))
    )
    await store.flush()
    await expect(createStateStore(directory).read('queue')).resolves.toEqual([{ revision: 19 }])
    expect(await readdir(directory)).toEqual(['queue.json'])
    await writeFile(join(directory, 'queue.json'), '{broken')
    await expect(store.read('queue')).rejects.toThrow('Could not restore queue')
    expect(() => store.write('../escape', [])).toThrow('Invalid state key')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
