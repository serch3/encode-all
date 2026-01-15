import { Switch, cn, Card, CardBody, Button, Chip, Divider, Input } from '@heroui/react'
import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Settings as SettingsIcon,
  Cpu,
  Folder
} from 'lucide-react'
import type { FfmpegStatus } from '../../types'

interface SettingsProps {
  showFfmpegPreview: boolean
  onShowFfmpegPreviewChange: (value: boolean) => void
  hasNvidiaGpu: boolean
  logDirectory: string
  onSelectLogDirectory: () => void
}

export default function SettingsPage({
  showFfmpegPreview,
  onShowFfmpegPreviewChange,
  hasNvidiaGpu,
  logDirectory,
  onSelectLogDirectory
}: SettingsProps): React.JSX.Element {
  // FFmpeg status state
  const [ffmpegStatus, setFfmpegStatus] = useState<FfmpegStatus>({ isInstalled: false })
  const [isCheckingFfmpeg, setIsCheckingFfmpeg] = useState(false)
  const [isCheckingNvidia, setIsCheckingNvidia] = useState(false)
  const [nvidiaStatus, setNvidiaStatus] = useState<boolean>(hasNvidiaGpu)

  const checkNvidiaStatus = useCallback(async (): Promise<void> => {
    setIsCheckingNvidia(true)
    try {
      const supported = await window.api?.checkNvidiaSupport()
      setNvidiaStatus(supported)
    } catch (error) {
      console.error('Failed to check NVIDIA support:', error)
      setNvidiaStatus(false)
    } finally {
      setIsCheckingNvidia(false)
    }
  }, [])

  const checkFfmpegStatus = useCallback(async (): Promise<void> => {
    setIsCheckingFfmpeg(true)
    try {
      const status = await window.api?.checkFfmpeg()
      setFfmpegStatus(status || { isInstalled: false, error: 'API not available' })

      // Also re-check NVIDIA support when checking FFmpeg
      if (status?.isInstalled) {
        checkNvidiaStatus()
      }
    } catch (error) {
      setFfmpegStatus({
        isInstalled: false,
        error: error instanceof Error ? error.message : 'Failed to check FFmpeg status'
      })
    } finally {
      setIsCheckingFfmpeg(false)
    }
  }, [checkNvidiaStatus])

  const handleSelectFfmpegPath = async (): Promise<void> => {
    try {
      const path = await window.api?.selectFfmpegPath()
      if (path) {
        await checkFfmpegStatus()
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to select FFmpeg path'
      console.error('Failed to select FFmpeg path:', errorMessage)
      setFfmpegStatus({
        isInstalled: false,
        error: errorMessage
      })
    }
  }

  useEffect(() => {
    checkFfmpegStatus()
    // Sync local state with prop if it changes
    setNvidiaStatus(hasNvidiaGpu)
  }, [hasNvidiaGpu, checkFfmpegStatus])
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Settings</h2>

      {/* FFmpeg Configuration Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium flex items-center gap-2">
          <SettingsIcon className="w-5 h-5" />
          FFmpeg Configuration
        </h3>

        <Card>
          <CardBody className="space-y-4">
            {/* FFmpeg Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {ffmpegStatus.isInstalled ? (
                  <CheckCircle className="w-5 h-5 text-success" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-warning" />
                )}
                <div>
                  <p className="font-medium">
                    {ffmpegStatus.isInstalled ? 'FFmpeg Installed' : 'FFmpeg Not Found'}
                  </p>
                  {ffmpegStatus.version && (
                    <p className="text-sm text-default-500">Version: {ffmpegStatus.version}</p>
                  )}
                  {ffmpegStatus.path && (
                    <p className="text-xs text-default-400 truncate max-w-96">
                      Path: {ffmpegStatus.path}
                    </p>
                  )}
                  {ffmpegStatus.error && (
                    <p className="text-xs text-danger">{ffmpegStatus.error}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  isIconOnly
                  onPress={checkFfmpegStatus}
                  isLoading={isCheckingFfmpeg}
                >
                  <RefreshCw className={`w-4 h-4 ${isCheckingFfmpeg ? 'animate-spin' : ''}`} />
                </Button>
                <Chip
                  size="sm"
                  color={ffmpegStatus.isInstalled ? 'success' : 'warning'}
                  variant="flat"
                >
                  {ffmpegStatus.isInstalled ? 'Ready' : 'Setup Required'}
                </Chip>
              </div>
            </div>

            {/* FFmpeg Actions */}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="flat" onPress={handleSelectFfmpegPath}>
                Select Custom Path
              </Button>
              <Button
                size="sm"
                variant="flat"
                onPress={() => window.api?.openExternal('https://ffmpeg.org/download.html')}
              >
                Download FFmpeg
              </Button>
            </div>

            <Divider />

            {/* Hardware Acceleration Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Cpu className={`w-5 h-5 ${nvidiaStatus ? 'text-success' : 'text-default-400'}`} />
                <div>
                  <p className="font-medium">Hardware Acceleration</p>
                  <p className="text-sm text-default-500">
                    {nvidiaStatus
                      ? 'NVIDIA NVENC detected and enabled'
                      : 'No supported NVIDIA GPU detected'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  isIconOnly
                  onPress={checkNvidiaStatus}
                  isLoading={isCheckingNvidia}
                  isDisabled={!ffmpegStatus.isInstalled}
                >
                  <RefreshCw className={`w-4 h-4 ${isCheckingNvidia ? 'animate-spin' : ''}`} />
                </Button>
                <Chip size="sm" color={nvidiaStatus ? 'success' : 'default'} variant="flat">
                  {nvidiaStatus ? 'Active' : 'Inactive'}
                </Chip>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <Divider />

      {/* Application Settings */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Application Settings</h3>

        <Input
          className="max-w-md"
          label="Log Directory"
          placeholder="Default (Same as output)"
          value={logDirectory}
          description="Leave empty to save logs next to the output video."
          variant="bordered"
          isReadOnly
          startContent={<Folder className="text-default-400" size={16} />}
          endContent={
            <Button size="sm" variant="flat" onPress={onSelectLogDirectory}>
              Browse
            </Button>
          }
        />

        <Switch
          isSelected={showFfmpegPreview}
          onValueChange={onShowFfmpegPreviewChange}
          classNames={{
            base: cn(
              'inline-flex flex-row-reverse w-full max-w-md bg-content1 hover:bg-content2 items-center',
              'justify-between cursor-pointer rounded-lg gap-2 p-4 border-2 border-transparent',
              'data-[selected=true]:border-primary'
            ),
            wrapper: 'p-0 h-4 overflow-visible',
            thumb: cn(
              'w-6 h-6 border-2 shadow-lg',
              'group-data-[hover=true]:border-primary',
              'group-data-[selected=true]:ms-6',
              'group-data-[pressed=true]:w-7',
              'group-data-pressed:group-data-selected:ms-4'
            )
          }}
        >
          <div className="flex flex-col gap-1">
            <p className="text-medium">Show FFmpeg Command Preview</p>
            <p className="text-tiny text-default-400">
              Display the full FFmpeg command that will be executed for encoding.
            </p>
          </div>
        </Switch>
      </div>
    </div>
  )
}
