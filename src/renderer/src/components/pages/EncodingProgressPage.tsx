import { Card, CardBody, Progress, Button, ScrollShadow } from '@heroui/react'
import { useEffect, useRef } from 'react'

interface EncodingProgressPageProps {
  progress: number
  currentFile?: string
  logs: string[]
  onCancel: () => void
  isEncoding: boolean
}

const EncodingProgressPage = ({
  progress,
  currentFile,
  logs,
  onCancel,
  isEncoding
}: EncodingProgressPageProps): React.JSX.Element => {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom of logs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  return (
    <div className="flex flex-col gap-6 h-full max-h-[calc(100vh-100px)]">
      <Card>
        <CardBody className="gap-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">Encoding Progress</h2>
            {isEncoding && (
              <Button color="danger" variant="flat" onPress={onCancel}>
                Cancel
              </Button>
            )}
          </div>

          {currentFile && (
            <div className="text-sm text-foreground/70">
              Processing: <span className="font-mono text-foreground">{currentFile}</span>
            </div>
          )}

          <Progress
            value={progress}
            color="primary"
            showValueLabel={true}
            className="max-w-full"
            label="Overall Progress"
          />
        </CardBody>
      </Card>

      <Card className="flex-1 min-h-0">
        <CardBody className="p-0 flex flex-col h-full">
          <div className="p-4 border-b border-divider">
            <h3 className="font-semibold">FFmpeg Output</h3>
          </div>
          <ScrollShadow
            className="flex-1 p-4 font-mono text-xs overflow-y-auto bg-black/5 dark:bg-black/30 select-text"
            ref={scrollRef}
          >
            {logs.length === 0 ? (
              <div className="text-foreground/40 italic">Waiting for logs...</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="whitespace-pre-wrap break-all">
                  {log}
                </div>
              ))
            )}
          </ScrollShadow>
        </CardBody>
      </Card>
    </div>
  )
}

export default EncodingProgressPage
