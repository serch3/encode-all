import { randomUUID } from 'crypto'
import { stat } from 'fs/promises'
import type { EncodingHistoryEntry, EncodingOptions } from '../preload/api.types'
import type { createStateStore } from './stateStore'

let store: ReturnType<typeof createStateStore> | undefined
let entries: EncodingHistoryEntry[] = []
let ready: Promise<void> = Promise.resolve()

export function initializeHistory(state: ReturnType<typeof createStateStore>): Promise<void> {
  store = state
  ready = state.read('history').then((saved) => {
    entries = Array.isArray(saved) ? saved.filter(isHistoryEntry).slice(0, 200) : []
  })
  return ready
}

function isHistoryEntry(value: unknown): value is EncodingHistoryEntry {
  if (!value || typeof value !== 'object') return false
  const item = value as EncodingHistoryEntry
  return (
    typeof item.id === 'string' &&
    typeof item.inputPath === 'string' &&
    typeof item.outputPath === 'string' &&
    typeof item.videoCodec === 'string' &&
    typeof item.container === 'string' &&
    [item.inputSize, item.outputSize, item.startedAt, item.completedAt].every(Number.isFinite)
  )
}

export async function getEncodingHistory(): Promise<EncodingHistoryEntry[]> {
  await ready
  return [...entries]
}

export async function clearEncodingHistory(): Promise<void> {
  await ready.catch(() => {})
  ready = Promise.resolve()
  entries = []
  await store?.write('history', entries)
}

export async function recordEncodingResult(
  options: EncodingOptions,
  outputPath: string,
  outputSize: number,
  startedAt: number
): Promise<void> {
  if (!store || options.trimDurationSeconds !== undefined) return
  await ready
  const inputSize = (await stat(options.inputPath).catch(() => null))?.size ?? 0
  entries = [
    {
      id: randomUUID(),
      inputPath: options.inputPath,
      outputPath,
      inputSize,
      outputSize,
      startedAt,
      completedAt: Date.now(),
      videoCodec: options.videoCodec,
      container: options.container
    },
    ...entries
  ].slice(0, 200)
  await store.write('history', entries)
}
