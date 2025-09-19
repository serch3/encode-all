import { Button, Divider } from '@heroui/react'
import ThemeToggle from './ThemeToggle'
import type React from 'react'

type SidebarProps = {
  active: 'encode' | 'settings' | 'about'
  onSelect: (key: SidebarProps['active']) => void
}

export default function Sidebar({ active, onSelect }: SidebarProps): React.JSX.Element {
  return (
    <aside className="h-full w-60 border-r border-foreground/10 p-3 flex flex-col gap-2">
      <Button variant={active === 'encode' ? 'flat' : 'light'} onPress={() => onSelect('encode')}>
        Encoder
      </Button>
      <Button
        variant={active === 'settings' ? 'flat' : 'light'}
        onPress={() => onSelect('settings')}
      >
        Settings
      </Button>
      <Button variant={active === 'about' ? 'flat' : 'light'} onPress={() => onSelect('about')}>
        About
      </Button>
      <Divider className="my-2" />
      <div className="mt-auto">
        <ThemeToggle />
      </div>
    </aside>
  )
}
