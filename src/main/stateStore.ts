import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

/** Serial, atomic writes prevent torn checkpoints and older saves overtaking newer ones. */
export function createStateStore(directory: string): {
  read: (key: string) => Promise<unknown>
  write: (key: string, value: unknown) => Promise<void>
  flush: () => Promise<void>
} {
  const writes = new Map<string, Promise<void>>()
  const filename = (key: string): string => {
    if (!/^[a-z-]+$/.test(key)) throw new Error('Invalid state key.')
    return join(directory, `${key}.json`)
  }
  return {
    async read(key) {
      await writes.get(key)?.catch(() => {})
      try {
        const content = await readFile(filename(key), 'utf8')
        const record = JSON.parse(content) as { version?: number; data?: unknown }
        if (record.version !== 1) throw new Error('Unsupported saved state version.')
        return record.data
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw new Error(
          `Could not restore ${key}: ${error instanceof Error ? error.message : error}`
        )
      }
    },
    write(key, value) {
      const destination = filename(key)
      const content = JSON.stringify({ version: 1, data: value })
      const operation = (writes.get(key) ?? Promise.resolve())
        .catch(() => {})
        .then(async () => {
          await mkdir(directory, { recursive: true })
          const temporary = `${destination}.${randomUUID()}.tmp`
          try {
            await writeFile(temporary, content, {
              encoding: 'utf8',
              mode: 0o600,
              flag: 'wx',
              flush: true
            })
            await rename(temporary, destination)
          } finally {
            await rm(temporary, { force: true })
          }
        })
      writes.set(key, operation)
      return operation
    },
    async flush() {
      await Promise.all([...writes.values()])
    }
  }
}
