import { useState } from 'react'
import { Button, Chip } from '@heroui/react'
import { UploadCloud, FolderOpen, History, ListVideo } from 'lucide-react'
import type { VideoFile } from '../../types'

const VALID_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.m4v', '.ts']
const ACCEPTED_FORMATS = ['MP4', 'MKV', 'AVI', 'MOV', 'WebM', 'TS']

interface DropZoneProps {
  isEncoding: boolean
  queueCount: number
  onFilesDropped: (files: VideoFile[]) => void
  onBrowseFolder: () => void
  onLoadSession: () => void
  className?: string
}

export function DropZone({
  isEncoding,
  queueCount,
  onFilesDropped,
  onBrowseFolder,
  onLoadSession,
  className = ''
}: DropZoneProps): React.JSX.Element {
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    if (!isEncoding) setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (isEncoding) return

    const newVideoFiles: VideoFile[] = Array.from(e.dataTransfer.files)
      .filter((file) => {
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
        return VALID_EXTENSIONS.includes(ext)
      })
      .map((file) => ({
        name: file.name,
        path: (file as unknown as { path: string }).path,
        size: file.size,
        modified: file.lastModified
      }))

    onFilesDropped(newVideoFiles)
  }

  const containerClass =
    `lg:col-span-2 relative rounded-2xl border-2 border-dashed transition-all duration-200 overflow-hidden ` +
    (isDragging
      ? 'border-primary bg-primary/5 shadow-lg shadow-primary/15 dropzone-dragging'
      : isEncoding
        ? 'border-default-200 bg-content1/40 cursor-not-allowed opacity-60'
        : 'border-default-300 bg-content1/60 hover:border-primary/50 hover:bg-primary/[0.02] hover:shadow-md cursor-pointer group') +
    (className ? ` ${className}` : '')

  return (
    <div
      className={containerClass}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => {
        if (!isEncoding) onBrowseFolder()
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (isEncoding) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onBrowseFolder()
        }
      }}
    >
      {/* Dot grid background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }}
      />

      {/* Content */}
      <div className="relative flex flex-col items-center justify-center gap-5 px-8 py-10 text-center">
        {/* Queue count badge */}
        {queueCount > 0 && !isDragging && (
          <div className="absolute top-3 right-3">
            <Chip
              size="sm"
              variant="flat"
              color="primary"
              startContent={<ListVideo size={13} />}
              className="text-xs"
            >
              {queueCount} in queue
            </Chip>
          </div>
        )}

        {/* Icon */}
        <div
          className={
            `dz-icon flex items-center justify-center rounded-2xl p-4 transition-all duration-200 ` +
            (isDragging
              ? 'bg-primary/15 text-primary scale-110'
              : 'bg-default-100 text-default-400 group-hover:bg-primary/10 group-hover:text-primary group-hover:scale-105')
          }
        >
          <UploadCloud size={36} strokeWidth={1.5} />
        </div>

        {/* Heading */}
        <div className="space-y-1.5">
          <p
            className={
              `text-lg font-semibold tracking-tight transition-colors duration-150 ` +
              (isDragging ? 'text-primary' : 'text-foreground')
            }
          >
            {isDragging ? 'Release to add to queue' : 'Drop video files here'}
          </p>
          <p className="text-sm text-default-500">
            {isDragging
              ? 'Files will be added to your encoding queue'
              : 'or use the buttons below to browse or restore a session'}
          </p>
        </div>

        {/* Action buttons */}
        {!isDragging && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              color="primary"
              variant="solid"
              onPress={onBrowseFolder}
              isDisabled={isEncoding}
              startContent={<FolderOpen size={16} />}
              onClick={(e) => e.stopPropagation()}
              size="sm"
            >
              Browse Folder
            </Button>
            <Button
              variant="flat"
              onPress={onLoadSession}
              isDisabled={isEncoding}
              startContent={<History size={16} />}
              onClick={(e) => e.stopPropagation()}
              size="sm"
            >
              Load Session
            </Button>
          </div>
        )}

        {/* Accepted formats */}
        {!isDragging && (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {ACCEPTED_FORMATS.map((fmt) => (
              <span
                key={fmt}
                className="rounded-md bg-default-100 px-2 py-0.5 text-[11px] font-medium text-default-500 font-mono"
              >
                {fmt}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
