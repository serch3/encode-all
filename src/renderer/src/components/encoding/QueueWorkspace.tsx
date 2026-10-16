import { useMemo, useRef, useState } from 'react'
import { Button, Input } from '@heroui/react'
import { CheckSquare, Square, Clapperboard, ListFilter } from 'lucide-react'
import type { QueuedJob } from '../../types'

interface Props {
  jobs: QueuedJob[]
  selectedIds: string[]
  locked: boolean
  onSelect: (id: string) => void
  onSelectAll: () => void
  onManage: () => void
  onPreview: (id: string) => void
  onRetryMetadata: () => void
}

/** Fixed-height rows keep large queues bounded without an additional runtime dependency. */
export default function QueueWorkspace({
  jobs,
  selectedIds,
  locked,
  onSelect,
  onSelectAll,
  onManage,
  onPreview,
  onRetryMetadata
}: Props): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [scroll, setScroll] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const filtered = useMemo(
    () => jobs.filter((job) => job.file.name.toLowerCase().includes(search.toLowerCase())),
    [jobs, search]
  )
  const rowHeight = 82
  const start = Math.max(0, Math.floor(scroll / rowHeight) - 3)
  const visible = filtered.slice(start, start + 14)
  return (
    <section className="rounded-xl border border-divider bg-content1 min-w-0 overflow-hidden">
      <div className="p-4 border-b border-divider flex flex-wrap items-center gap-2">
        <h2 className="font-semibold flex-1">Video queue</h2>
        <span className="text-xs text-default-500">
          {selectedIds.length} of {jobs.length} selected
        </span>
        <Button size="sm" variant="flat" startContent={<ListFilter size={15} />} onPress={onManage}>
          Manage queue
        </Button>
      </div>
      <div className="p-3 flex gap-2 items-center">
        <Input
          size="sm"
          aria-label="Search workspace queue"
          placeholder="Find a video…"
          value={search}
          onValueChange={(value) => {
            setSearch(value)
            setScroll(0)
            if (list.current) list.current.scrollTop = 0
          }}
        />
        <Button size="sm" variant="light" isDisabled={locked || !jobs.length} onPress={onSelectAll}>
          Select all
        </Button>
      </div>
      <div
        ref={list}
        role="list"
        aria-label="Queued videos"
        className="h-[410px] overflow-y-auto relative"
        onScroll={(event) => setScroll(event.currentTarget.scrollTop)}
      >
        <div style={{ height: filtered.length * rowHeight, position: 'relative' }}>
          <div style={{ position: 'absolute', top: start * rowHeight, left: 0, right: 0 }}>
            {visible.map((job, index) => (
              <div
                role="listitem"
                aria-posinset={start + index + 1}
                aria-setsize={filtered.length}
                key={job.id}
                style={{ height: rowHeight }}
                className={`px-3 py-1 ${selected.has(job.id) ? 'bg-primary/5' : ''}`}
              >
                <div className="flex items-center gap-2 h-full border-b border-divider/60">
                  <button
                    type="button"
                    aria-pressed={selected.has(job.id)}
                    aria-label={`Select ${job.file.name}`}
                    disabled={locked}
                    onClick={() => onSelect(job.id)}
                    className="min-w-0 flex-1 flex items-center gap-3 text-left rounded-md p-2 focus-visible:outline focus-visible:outline-primary disabled:opacity-70"
                  >
                    {selected.has(job.id) ? (
                      <CheckSquare size={18} className="text-primary shrink-0" />
                    ) : (
                      <Square size={18} className="text-default-400 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" title={job.file.path}>
                        {job.file.name}
                      </p>
                      <p className="text-xs text-default-500 truncate">
                        {job.mediaInfo?.format.duration
                          ? `${Number(job.mediaInfo.format.duration).toFixed(0)}s · `
                          : ''}
                        {(job.file.size / 1e6).toFixed(1)} MB · {job.status}
                        {job.status === 'encoding' ? ` ${Math.round(job.progress)}%` : ''}
                        {job.overrides && Object.keys(job.overrides).length ? ' · Custom' : ''}
                      </p>
                      {job.error && (
                        <p className="text-xs text-danger truncate" title={job.error}>
                          {job.error}
                        </p>
                      )}
                    </div>
                  </button>
                  <Button
                    size="sm"
                    variant="light"
                    isIconOnly
                    aria-label={`Preview ${job.file.name}`}
                    isDisabled={locked}
                    onPress={() => onPreview(job.id)}
                  >
                    <Clapperboard size={17} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
        {!filtered.length && (
          <p className="text-sm text-default-500 p-6 text-center">
            {jobs.length ? 'No matching videos.' : 'Add videos to begin.'}
          </p>
        )}
      </div>
      <div className="px-3 py-2 border-t border-divider flex items-center gap-2">
        <p className="text-xs text-default-500 flex-1">
          {search
            ? `${filtered.length} matching. Encoding includes all selected files.`
            : 'Select files here; manage overrides and batch controls in the queue.'}
        </p>
        {jobs.some((job) => job.mediaInfoError) && (
          <Button size="sm" variant="light" isDisabled={locked} onPress={onRetryMetadata}>
            Retry details
          </Button>
        )}
      </div>
    </section>
  )
}
