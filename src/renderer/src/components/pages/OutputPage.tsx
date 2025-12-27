import { Card, CardBody, ScrollShadow, Button } from '@heroui/react'
import { useEffect, useRef } from 'react'

interface OutputPageProps {
  logs: string[]
  onCancel: () => void
  isEncoding: boolean
}

const OutputPage = ({ logs, onCancel, isEncoding }: OutputPageProps): React.JSX.Element => {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom of logs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  return (
    <div className="flex flex-col gap-4 h-full">
      <Card className="flex-1 min-h-0">
        <CardBody className="p-0 flex flex-col h-full">
          <div className="p-4 border-b border-divider flex justify-between items-center">
            <h3 className="font-semibold">FFmpeg Console Output</h3>
            {isEncoding && (
              <Button color="danger" variant="flat" size="sm" onPress={onCancel}>
                Cancel Encoding
              </Button>
            )}
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

export default OutputPage
