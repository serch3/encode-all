import { randomUUID } from 'crypto'
import { stat } from 'fs/promises'
import type { BatchReviewEntry, EncodingOptions } from '../preload/api.types'

const ignored = new Set([
  'reviewToken',
  'jobId',
  'enableLogging',
  'logDirectory',
  'jobTimestamp',
  'sourceDurationSeconds'
])
const settingsKey = (options: EncodingOptions): string =>
  JSON.stringify(
    Object.entries(options)
      .filter(([key, value]) => value !== undefined && !ignored.has(key))
      .sort(([a], [b]) => a.localeCompare(b))
  )

/** Bind execution to the exact reviewed settings and source file identity. */
export function createReviewPlans(): {
  issue: (entries: BatchReviewEntry[]) => Promise<BatchReviewEntry[]>
  verify: (options: EncodingOptions) => Promise<void>
  release: (token?: string) => void
} {
  const plans = new Map<string, { key: string; identity: string }>()
  const identity = async (path: string): Promise<string> => {
    const file = await stat(path)
    return `${file.dev}:${file.ino}:${file.size}:${file.mtimeMs}`
  }
  return {
    async issue(entries) {
      if (entries.length > 20000) throw new Error('This batch is too large.')
      if (plans.size + entries.length > 40000) plans.clear()
      for (const entry of entries) {
        if (entry.errors.length) continue
        const token = randomUUID()
        plans.set(token, {
          key: settingsKey(entry.encoding),
          identity: await identity(entry.inputPath)
        })
        entry.reviewToken = token
      }
      return entries
    },
    async verify(options) {
      const plan = options.reviewToken && plans.get(options.reviewToken)
      if (!plan || plan.key !== settingsKey(options))
        throw new Error('These settings have not been reviewed. Review batch outputs again.')
      if (plan.identity !== (await identity(options.inputPath)))
        throw new Error('The source file changed after review. Review batch outputs again.')
    },
    release(token) {
      if (token) plans.delete(token)
    }
  }
}
