import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Card,
  CardBody,
  Progress,
  Chip,
  Divider
} from '@heroui/react'
import { useState, useEffect } from 'react'
import { Download, CheckCircle, AlertCircle, ExternalLink, Folder } from 'lucide-react'
import type { FfmpegStatus } from '../../types'

interface FfmpegSetupProps {
  isOpen: boolean
  onClose: () => void
  onSkip?: () => void
}

export default function FfmpegSetup({
  isOpen,
  onClose,
  onSkip
}: FfmpegSetupProps): React.JSX.Element {
  const [ffmpegStatus, setFfmpegStatus] = useState<FfmpegStatus>({ isInstalled: false })
  const [isChecking, setIsChecking] = useState(false)

  const checkFfmpegStatus = async (): Promise<void> => {
    setIsChecking(true)
    try {
      const status = await window.api?.checkFfmpeg()
      setFfmpegStatus(status)
    } catch (error) {
      setFfmpegStatus({
        isInstalled: false,
        error: error instanceof Error ? error.message : 'Failed to check FFmpeg status'
      })
    } finally {
      setIsChecking(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      checkFfmpegStatus()
    }
  }, [isOpen])

  const handleOpenDownloadPage = (): void => {
    window.api?.openExternal('https://ffmpeg.org/download.html')
  }

  const handleSelectCustomPath = async (): Promise<void> => {
    try {
      const path = await window.api?.selectFfmpegPath()
      if (path) {
        // Update FFmpeg path in settings and re-check
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

  const renderStatus = (): React.JSX.Element => {
    if (isChecking) {
      return (
        <Card>
          <CardBody className="flex flex-row items-center gap-3">
            <Progress size="sm" isIndeterminate className="flex-1" />
            <span className="text-sm text-default-500">Checking FFmpeg installation...</span>
          </CardBody>
        </Card>
      )
    }

    if (ffmpegStatus.isInstalled) {
      return (
        <Card className="border-success border-2">
          <CardBody className="flex flex-row items-center gap-3">
            <CheckCircle className="w-6 h-6 text-success" />
            <div className="flex-1">
              <p className="text-sm font-medium text-success">FFmpeg is installed!</p>
              {ffmpegStatus.version && (
                <p className="text-xs text-default-500">Version: {ffmpegStatus.version}</p>
              )}
              {ffmpegStatus.path && (
                <p className="text-xs text-default-400 truncate">Path: {ffmpegStatus.path}</p>
              )}
            </div>
          </CardBody>
        </Card>
      )
    }

    return (
      <Card className="border-warning border-2">
        <CardBody className="flex flex-row items-center gap-3">
          <AlertCircle className="w-6 h-6 text-warning" />
          <div className="flex-1">
            <p className="text-sm font-medium text-warning">FFmpeg not found</p>
            <p className="text-xs text-default-500">
              FFmpeg is required to encode videos. Please install it to continue.
            </p>
          </div>
        </CardBody>
      </Card>
    )
  }

  const renderDownloadOptions = (): React.JSX.Element | null => {
    if (ffmpegStatus.isInstalled || isChecking) {
      return null
    }

    return (
      <>
        <Divider className="my-4" />
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Installation Options</h4>

          {/* Manual Download */}
          <Card
            className="hover:bg-content2 cursor-pointer"
            isPressable
            onClick={handleOpenDownloadPage}
          >
            <CardBody className="flex flex-row items-center gap-3 py-3">
              <ExternalLink className="w-5 h-5 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">Download from FFmpeg.org</p>
                <p className="text-xs text-default-500">
                  Download and install FFmpeg manually from the official website
                </p>
              </div>
              <Chip size="sm" variant="flat" color="primary">
                Recommended
              </Chip>
            </CardBody>
          </Card>

          {/* Custom Path Selection */}
          <Card
            className="hover:bg-content2 cursor-pointer"
            isPressable
            onClick={handleSelectCustomPath}
          >
            <CardBody className="flex flex-row items-center gap-3 py-3">
              <Folder className="w-5 h-5 text-secondary" />
              <div className="flex-1">
                <p className="text-sm font-medium">Select Existing Installation</p>
                <p className="text-xs text-default-500">
                  Browse to an existing FFmpeg installation on your system
                </p>
              </div>
            </CardBody>
          </Card>

          {/* Auto Download (todo: implement this) */}
          <Card className="opacity-60">
            <CardBody className="flex flex-row items-center gap-3 py-3">
              <Download className="w-5 h-5 text-default-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-default-400">Automatic Download</p>
                <p className="text-xs text-default-400">
                  Download and install FFmpeg automatically (coming soon)
                </p>
              </div>
              <Chip size="sm" variant="flat" color="default">
                Coming Soon
              </Chip>
            </CardBody>
          </Card>
        </div>
      </>
    )
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      isDismissable={false}
      isKeyboardDismissDisabled={true}
      size="md"
      placement="center"
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold">FFmpeg Setup</h3>
          <p className="text-sm text-default-500 font-normal">
            Encode All requires FFmpeg to process video files
          </p>
        </ModalHeader>

        <ModalBody>
          {renderStatus()}
          {renderDownloadOptions()}
        </ModalBody>

        <ModalFooter>
          {onSkip && !ffmpegStatus.isInstalled && (
            <Button variant="ghost" onPress={onSkip}>
              Skip for now
            </Button>
          )}

          <Button
            color="primary"
            onPress={ffmpegStatus.isInstalled ? onClose : checkFfmpegStatus}
            isLoading={isChecking}
          >
            {ffmpegStatus.isInstalled ? 'Continue' : 'Check Again'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
