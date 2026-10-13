import { useState } from 'react'
import { renderWithProviders, screen, userEvent } from '@test-utils'
import ProfileManager from '../components/encoding/ProfileManager'
import { STARTER_PROFILES } from '../constants/profiles'
import type { EncodingProfile } from '../types'

function Harness(): React.JSX.Element {
  const [settings, setSettings] = useState(STARTER_PROFILES[0])
  const [profiles, setProfiles] = useState<EncodingProfile[]>([
    { ...STARTER_PROFILES[0], id: 'custom', name: 'My profile' }
  ])
  return (
    <>
      <ProfileManager
        currentSettings={settings}
        profiles={profiles}
        onLoadProfile={(profile) => setSettings({ ...profile, description: '' })}
        onSaveProfile={(profile) => setProfiles((list) => [...list, profile])}
        onDeleteProfile={(id) => setProfiles((list) => list.filter((profile) => profile.id !== id))}
      />
      <button onClick={() => setSettings((value) => ({ ...value, crf: 18 }))}>
        Change quality
      </button>
    </>
  )
}

test('starter profiles load settings, expose tradeoffs, and cannot be deleted', async () => {
  const user = userEvent.setup()
  renderWithProviders(<Harness />)
  await user.selectOptions(screen.getByRole('combobox', { name: 'Profile' }), 'starter-fast-mp4')
  expect(screen.getByText(/Prioritizes encoding speed/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Delete selected profile' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Change quality' }))
  expect(screen.getByText(/Modified/)).toBeInTheDocument()
})

test('saved profile deletion can be undone without losing its settings or ID', async () => {
  const user = userEvent.setup()
  renderWithProviders(<Harness />)
  await user.selectOptions(screen.getByRole('combobox', { name: 'Profile' }), 'custom')
  await user.click(screen.getByRole('button', { name: 'Delete selected profile' }))
  expect(screen.queryByRole('option', { name: 'My profile' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Undo profile deletion' }))
  expect(screen.getByRole('combobox', { name: 'Profile' })).toHaveValue('custom')
  expect(screen.getByRole('option', { name: 'My profile' })).toBeInTheDocument()
})
