import { useEffect, useState } from 'react'
import { Button, Card, CardBody, Select, SelectItem } from '@heroui/react'
import type { UpdateState } from '../../../../preload/api.types'

export default function UpdatesCard({
  isEncoding = false
}: {
  isEncoding?: boolean
}): React.JSX.Element {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  const [channel, setChannel] = useState<'stable' | 'beta'>('stable')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let current = true
    const unsubscribe = window.api.onUpdateState((next) => {
      if (current) setState(next)
    })
    void window.api
      .getUpdateState()
      .then((next) => {
        if (current) setState(next)
      })
      .catch((error) => {
        if (current) setState({ status: 'error', message: String(error) })
      })
    return () => {
      current = false
      unsubscribe()
    }
  }, [])
  const action = async (work: () => Promise<UpdateState | void>): Promise<void> => {
    setBusy(true)
    try {
      const next = await work()
      if (next) setState(next)
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <CardBody className="space-y-3">
        <h3 className="text-lg font-medium">Updates</h3>
        {state.status === 'unavailable' ? (
          <>
            <p className="text-sm text-default-500">
              Updates for this build are available on the download page.
            </p>
            <Button
              className="self-start"
              variant="flat"
              onPress={() =>
                void window.api.openExternal('https://github.com/serch3/encode-all/releases')
              }
            >
              View downloads
            </Button>
          </>
        ) : (
          <>
            <Select
              label="Update channel"
              selectedKeys={[channel]}
              isDisabled={busy || ['checking', 'downloading', 'downloaded'].includes(state.status)}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0]
                if (selected !== 'stable' && selected !== 'beta') return
                setChannel(selected)
                setState({ status: 'idle' })
              }}
              className="max-w-sm"
            >
              <SelectItem key="stable">Stable releases</SelectItem>
              <SelectItem key="beta">Beta releases</SelectItem>
            </Select>
            <p
              className="text-sm text-default-500"
              role={state.status === 'error' ? 'alert' : 'status'}
            >
              {state.status === 'error'
                ? state.message
                : state.status === 'checking'
                  ? 'Checking for updates…'
                  : state.status === 'current'
                    ? 'You are up to date on this channel.'
                    : state.status === 'available'
                      ? `Version ${state.version} is available.`
                      : state.status === 'downloading'
                        ? `Downloading update… ${Math.round(state.progress ?? 0)}%`
                        : state.status === 'downloaded'
                          ? `Version ${state.version} is ready. Installing will restart the app.`
                          : 'Check for a newer version when you are ready.'}
            </p>
            <div className="flex gap-2 flex-wrap">
              {!['available', 'downloading', 'downloaded'].includes(state.status) && (
                <Button
                  variant="flat"
                  isLoading={busy || state.status === 'checking'}
                  onPress={() => void action(() => window.api.checkForUpdates(channel))}
                >
                  Check for updates
                </Button>
              )}
              {state.status === 'available' && (
                <Button
                  color="primary"
                  isLoading={busy}
                  onPress={() => void action(window.api.downloadUpdate)}
                >
                  Download update
                </Button>
              )}
              {state.status === 'downloaded' && (
                <Button
                  color="primary"
                  isLoading={busy}
                  isDisabled={isEncoding}
                  onPress={() => void action(window.api.installUpdate)}
                >
                  Install and restart
                </Button>
              )}
            </div>
            {state.status === 'downloaded' && isEncoding && (
              <p className="text-sm text-default-500">
                Finish or stop the current batch before restarting.
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  )
}
