import { Button, Divider, Tooltip } from '@heroui/react'
import ThemeToggle from './ThemeToggle'
import type React from 'react'
import { Home, Settings, Info, List } from 'lucide-react'

type SidebarProps = {
  active: 'general' | 'settings' | 'about'
  onSelect: (key: SidebarProps['active']) => void
  onOpenQueue?: () => void
  queueStats?: { total: number; selected: number }
}

export default function Sidebar({
  active,
  onSelect,
  onOpenQueue,
  queueStats
}: SidebarProps): React.JSX.Element {
  return (
    <aside className="h-full w-16 border-r border-foreground/10 p-2 flex flex-col gap-2">
      <Tooltip content="General" placement="right" delay={300}>
        <Button
          variant={active === 'general' ? 'flat' : 'light'}
          onPress={() => onSelect('general')}
          isIconOnly
          className="w-12 h-12"
        >
          <Home className="w-5 h-5" />
        </Button>
      </Tooltip>

      <Tooltip content="Settings" placement="right" delay={300}>
        <Button
          variant={active === 'settings' ? 'flat' : 'light'}
          onPress={() => onSelect('settings')}
          isIconOnly
          className="w-12 h-12"
        >
          <Settings className="w-5 h-5" />
        </Button>
      </Tooltip>

      <Tooltip content="About" placement="right" delay={300}>
        <Button
          variant={active === 'about' ? 'flat' : 'light'}
          onPress={() => onSelect('about')}
          isIconOnly
          className="w-12 h-12"
        >
          <Info className="w-5 h-5" />
        </Button>
      </Tooltip>

      <Divider className="my-2" />

      <Tooltip
        content={
          queueStats ? (
            <div className="px-1">
              <div>Queue</div>
              <div className="text-xs opacity-70">
                {queueStats.selected}/{queueStats.total} selected
              </div>
            </div>
          ) : (
            'Queue'
          )
        }
        placement="right"
        delay={300}
      >
        <Button
          variant="light"
          onPress={() => onOpenQueue?.()}
          isDisabled={!queueStats || queueStats.total === 0}
          isIconOnly
          className="w-12 h-12 relative"
        >
          <List className="w-5 h-5" />
          {queueStats && queueStats.total > 0 && (
            <span className="absolute top-1 right-1 bg-primary text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
              {queueStats.selected}
            </span>
          )}
        </Button>
      </Tooltip>

      <div className="mt-auto">
        <ThemeToggle />
      </div>
    </aside>
  )
}
