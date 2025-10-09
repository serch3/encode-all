import React from 'react'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  Button,
  Card,
  CardBody,
  Chip,
  ScrollShadow,
  Input
} from '@heroui/react'
import type { VideoFile } from '../../types'

interface QueueDrawerProps {
  isOpen: boolean
  onClose: () => void
  videoFiles: VideoFile[]
  onSelectFile?: (file: VideoFile) => void
  selectedFiles?: VideoFile[]
  onSelectAll?: () => void
  onClearSelection?: () => void
}

export default function QueueDrawer({
  isOpen,
  onClose,
  videoFiles,
  onSelectFile,
  selectedFiles = [],
  onSelectAll,
  onClearSelection
}: QueueDrawerProps): React.JSX.Element {
  const formatFileSize = (bytes: number): string => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 Bytes'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i]
  }

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString()
  }

  const isSelected = (file: VideoFile): boolean => {
    return selectedFiles.some((selected) => selected.path === file.path)
  }

  const totalSize = videoFiles.reduce((acc, f) => acc + f.size, 0)
  const formatTotalSize = formatFileSize(totalSize)
  const [search, setSearch] = React.useState('')
  const filtered = search
    ? videoFiles.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    : videoFiles

  return (
    <Drawer isOpen={isOpen} onClose={onClose} size="lg">
      <DrawerContent>
        <DrawerHeader className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-primary rounded flex items-center justify-center text-white text-xs font-bold">
              ▶
            </div>
            <h2 className="text-xl font-semibold">Video Queue</h2>
          </div>
          <div className="text-xs text-default-500 flex flex-wrap gap-3">
            <span>{videoFiles.length} files</span>
            <span>{selectedFiles.length} selected</span>
            <span>{formatTotalSize}</span>
          </div>
        </DrawerHeader>

        <DrawerBody>
          {/* Toolbar */}
          <div className="flex flex-col gap-3 mb-4">
            <div className="flex gap-2 items-center">
              <Input
                size="sm"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
              <Button
                size="sm"
                variant="flat"
                onPress={() => onSelectAll?.()}
                isDisabled={videoFiles.length === 0}
              >
                Select All
              </Button>
              <Button
                size="sm"
                variant="flat"
                onPress={() => onClearSelection?.()}
                isDisabled={selectedFiles.length === 0}
              >
                Clear
              </Button>
            </div>
          </div>

          <ScrollShadow className="h-full w-full overflow-x-hidden">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 bg-default-100 rounded-full flex items-center justify-center mb-4">
                  <span className="text-2xl">🎥</span>
                </div>
                <h3 className="text-lg font-medium text-default-600 mb-2">No matches</h3>
                <p className="text-sm text-default-500">
                  {videoFiles.length === 0
                    ? 'Select a folder to scan for video files'
                    : 'Try a different search term'}
                </p>
              </div>
            ) : (
              <div className="px-4 py-2 w-full">
                <div className="space-y-2 w-full">
                  {filtered.map((file) => (
                    <Card
                      key={file.path}
                      isPressable={!!onSelectFile}
                      onPress={() => onSelectFile?.(file)}
                      className={`transition-shadow duration-150 border-0 shadow-sm hover:shadow-md w-full min-w-0 ${
                        isSelected(file)
                          ? 'ring-1 ring-primary/30 bg-primary/5 shadow-primary/20'
                          : 'hover:bg-default-50/80'
                      }`}
                    >
                      <CardBody className="px-4 py-3 h-16 w-full min-w-0">
                        <div className="flex items-center justify-between gap-3 h-full w-full min-w-0">
                          <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
                            <div className="w-3 h-3 bg-gradient-to-br from-primary to-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-white text-[8px] font-bold">▶</span>
                            </div>

                            <div className="flex-1 min-w-0 overflow-hidden">
                              <h4
                                className="font-medium text-sm text-foreground truncate mb-1 leading-tight block"
                                title={file.name}
                              >
                                {file.name}
                              </h4>

                              <div className="flex items-center gap-3 text-xs text-default-500 flex-wrap">
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <span className="text-[10px] opacity-60">💾</span>
                                  <span className="font-mono">{formatFileSize(file.size)}</span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <span className="text-[10px] opacity-60">📅</span>
                                  <span>{formatDate(file.modified)}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {isSelected(file) && (
                            <Chip
                              size="sm"
                              color="primary"
                              variant="flat"
                              className="text-[10px] px-2 py-1 h-5 flex-shrink-0"
                            >
                              ✓ Selected
                            </Chip>
                          )}
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </ScrollShadow>
        </DrawerBody>

        <DrawerFooter>
          <div className="flex gap-2 w-full">
            <Button variant="flat" onPress={onClose} className="flex-1">
              Close
            </Button>
            {selectedFiles.length > 0 && (
              <Button color="primary" className="flex-1">
                Encode {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''}
              </Button>
            )}
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
