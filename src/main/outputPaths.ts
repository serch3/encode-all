import { mkdtemp, access, rm, writeFile } from 'fs/promises'
import { dirname, join, resolve } from 'path'

const policies = new Map<string, Promise<boolean>>()
const knownPolicies = new Map<string, boolean>()

/** Probe the selected destination instead of assuming every APFS volume ignores case. */
export async function outputPathKey(path: string): Promise<string> {
  const absolute = resolve(path)
  if (process.platform === 'darwin') {
    const directory = dirname(absolute)
    if (!policies.has(directory))
      policies.set(
        directory,
        (async () => {
          const temporary = await mkdtemp(join(directory, '.encode-all-check-'))
          try {
            await writeFile(join(temporary, 'case-probe'), '')
            const insensitive = await access(join(temporary, 'CASE-PROBE')).then(
              () => true,
              () => false
            )
            knownPolicies.set(directory, insensitive)
            return insensitive
          } finally {
            await rm(temporary, { recursive: true, force: true })
          }
        })()
      )
    try {
      await policies.get(directory)
    } catch (error) {
      policies.delete(directory)
      throw error
    }
  }
  return reservedOutputKey(absolute)
}

export function reservedOutputKey(path: string): string {
  const absolute = resolve(path)
  if (process.platform === 'win32') return absolute.toLowerCase()
  if (process.platform === 'darwin') {
    const normalized = absolute.normalize('NFC')
    return knownPolicies.get(dirname(absolute)) ? normalized.toLowerCase() : normalized
  }
  return absolute
}
