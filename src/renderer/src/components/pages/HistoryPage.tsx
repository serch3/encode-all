import { useCallback, useEffect, useState } from 'react'
import { Button, Input } from '@heroui/react'
import { FolderOpen, Play, RefreshCw, Trash2 } from 'lucide-react'
import type { EncodingHistoryEntry } from '../../../../preload/api.types'

const size = (bytes: number): string =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${(bytes / 1e6).toFixed(1)} MB`
const name = (path: string): string => path.split(/[\\/]/).at(-1) ?? path

export default function HistoryPage(): React.JSX.Element {
  const [entries, setEntries] = useState<EncodingHistoryEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setEntries(await window.api.getEncodingHistory())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load output history.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])
  const open = async (id: string, reveal: boolean): Promise<void> => {
    try {
      setError(null)
      await window.api.openOutput(id, reveal)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This output is unavailable.')
    }
  }
  const filtered = entries.filter((entry) =>
    `${entry.inputPath} ${entry.outputPath}`.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <section className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Output history</h1>
          <p className="text-sm text-default-500">
            Find your finished videos and compare file sizes. The latest 200 outputs are saved.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="flat"
            startContent={<RefreshCw size={16} />}
            isLoading={loading}
            onPress={() => void refresh()}
          >
            Refresh
          </Button>
          <Button
            variant="light"
            startContent={<Trash2 size={16} />}
            isDisabled={!entries.length}
            onPress={() => setConfirmClear(true)}
          >
            Clear history
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {confirmClear && (
        <div className="border border-warning/40 rounded-xl p-4 flex flex-wrap items-center gap-3">
          <p className="text-sm flex-1">
            Clear saved history records? Your video files will be kept.
          </p>
          <Button variant="flat" onPress={() => setConfirmClear(false)}>
            Cancel
          </Button>
          <Button
            color="warning"
            onPress={() => {
              void window.api
                .clearEncodingHistory()
                .then(() => {
                  setEntries([])
                  setConfirmClear(false)
                })
                .catch((cause) => setError(String(cause)))
            }}
          >
            Clear records
          </Button>
        </div>
      )}
      <Input
        aria-label="Search output history"
        placeholder="Search filenames or folders…"
        value={search}
        onValueChange={setSearch}
      />
      {!loading && !filtered.length && (
        <div className="rounded-xl border border-dashed border-divider p-12 text-center text-default-500">
          {entries.length ? 'No matching outputs.' : 'Completed encodes will appear here.'}
        </div>
      )}
      <div className="space-y-3">
        {filtered.map((entry) => {
          const change = entry.inputSize
            ? (1 - entry.outputSize / entry.inputSize) * 100
            : undefined
          return (
            <article
              key={entry.id}
              className="rounded-xl border border-divider bg-content1 p-4 flex gap-4 flex-wrap items-start"
            >
              <div className="flex-1 min-w-48 space-y-1">
                <h2 className="font-medium break-all select-text">{name(entry.outputPath)}</h2>
                <p className="text-xs text-default-500 break-all select-text">{entry.outputPath}</p>
                <p className="text-xs text-default-500">
                  {new Date(entry.completedAt).toLocaleString()} · {entry.videoCodec} ·{' '}
                  {Math.round((entry.completedAt - entry.startedAt) / 1000)}s
                </p>
                <p className="text-sm">
                  {size(entry.inputSize)} → {size(entry.outputSize)}
                  {change !== undefined && (
                    <span className="ml-2 text-default-600">
                      {Math.abs(change).toFixed(0)}% {change >= 0 ? 'smaller' : 'larger'}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="flat"
                  startContent={<Play size={15} />}
                  onPress={() => void open(entry.id, false)}
                >
                  Open video
                </Button>
                <Button
                  size="sm"
                  variant="flat"
                  startContent={<FolderOpen size={15} />}
                  onPress={() => void open(entry.id, true)}
                >
                  Reveal file
                </Button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
