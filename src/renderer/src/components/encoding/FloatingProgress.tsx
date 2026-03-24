import { Card, CardBody, Button } from '@heroui/react'
import type React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, AlertTriangle, X } from 'lucide-react'

interface FloatingProgressProps {
  isVisible: boolean
  isEncoding: boolean
  encodingError?: string | null
  currentEncodingFile: string
  overallProgress: number
  eta?: string | null
  onPress: () => void
  onClearError?: () => void
}

export default function FloatingProgress({
  isVisible,
  isEncoding,
  encodingError,
  currentEncodingFile,
  overallProgress,
  eta,
  onPress,
  onClearError
}: FloatingProgressProps): React.JSX.Element {
  const etaLabel = eta && eta !== '--' ? eta : null

  return (
    <AnimatePresence>
      {isVisible && (isEncoding || encodingError) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-4 right-4 left-4 md:left-auto md:w-96 z-50 shadow-2xl"
        >
          <Card
            isPressable={!encodingError}
            onPress={!encodingError ? onPress : undefined}
            className={`${
              encodingError
                ? 'bg-danger-50/90 border-danger-200 dark:bg-danger-900/40 dark:border-danger-500/30'
                : 'bg-content1/90 border-white/10'
            } backdrop-blur-md shadow-lg border relative overflow-hidden`}
          >
            <CardBody className="gap-1 p-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  {encodingError ? (
                    <AlertTriangle className="w-4 h-4 text-danger" />
                  ) : (
                    <Activity className="w-4 h-4 text-primary animate-pulse" />
                  )}
                  <span
                    className={`text-xs font-medium uppercase tracking-wider ${
                      encodingError ? 'text-danger' : 'text-foreground/80'
                    }`}
                  >
                    {encodingError ? 'Encoding Failed' : 'Encoding in progress'}
                  </span>
                </div>
                {!encodingError ? (
                  <span className="text-xs text-primary font-semibold tabular-nums">
                    {Math.round(overallProgress)}%
                  </span>
                ) : (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    color="danger"
                    onPress={onClearError}
                    className="h-6 w-6 min-w-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <div 
                className={`flex items-center justify-between gap-2 mt-1 ${encodingError ? 'cursor-pointer' : ''}`}
                onClick={encodingError ? onPress : undefined}
              >
                <span className="text-sm truncate flex-1 font-medium hover:underline flex items-center">
                  {encodingError
                    ? 'Click to view logs'
                    : currentEncodingFile || 'Initializing...'}
                </span>
                {!encodingError && etaLabel && (
                  <span className="text-xs text-foreground/50 shrink-0 tabular-nums">{etaLabel}</span>
                )}
              </div>
            </CardBody>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
