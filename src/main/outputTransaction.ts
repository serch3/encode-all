import { constants } from 'fs'
import { copyFile, link, mkdtemp, rm, stat } from 'fs/promises'
import { dirname, extname, join } from 'path'

/** Encode privately on the destination volume; never overwrite an existing result. */
export async function createOutputTransaction(outputPath: string): Promise<{
  path: string
  commit: (destination: string) => Promise<number>
  dispose: () => Promise<void>
}> {
  const directory = await mkdtemp(join(dirname(outputPath), '.encode-all-'))
  const path = join(directory, `encoded${extname(outputPath)}`)
  return {
    path,
    async commit(destination) {
      const file = await stat(path)
      if (!file.isFile() || file.size === 0) throw new Error('FFmpeg produced an empty output.')
      try {
        // A hard link atomically publishes the finished file and fails on collisions.
        await link(path, destination)
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (!['EPERM', 'EACCES', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV'].includes(code ?? ''))
          throw error
        // FAT and some network volumes do not support links. EXCL preserves source safety.
        await copyFile(path, destination, constants.COPYFILE_EXCL)
      }
      return file.size
    },
    dispose: () => rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}
