import {
  Select,
  SelectItem,
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
  Tooltip
} from '@heroui/react'
import { useState } from 'react'
import { Save, Trash2, Bookmark } from 'lucide-react'
import type { EncodingProfile } from '../../types'

interface ProfileManagerProps {
  currentSettings: Omit<EncodingProfile, 'id' | 'name'>
  profiles: EncodingProfile[]
  onLoadProfile: (profile: EncodingProfile) => void
  onSaveProfile: (profile: EncodingProfile) => void
  onDeleteProfile: (id: string) => void
  isDisabled?: boolean
}

export default function ProfileManager({
  currentSettings,
  profiles,
  onLoadProfile,
  onSaveProfile,
  onDeleteProfile,
  isDisabled = false
}: ProfileManagerProps): React.JSX.Element {
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [selectedProfileId, setSelectedProfileId] = useState<string>('')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleProfileChange = (keys: any): void => {
    const id = Array.from(keys)[0] as string
    if (!id || isDisabled) return

    setSelectedProfileId(id)
    const profile = profiles.find((p) => p.id === id)
    if (profile) {
      onLoadProfile(profile)
    }
  }

  const handleSave = (): void => {
    if (!newProfileName.trim()) return

    const newProfile: EncodingProfile = {
      ...currentSettings,
      id: crypto.randomUUID(),
      name: newProfileName.trim()
    }

    onSaveProfile(newProfile)
    setNewProfileName('')
    setIsSaveModalOpen(false)
    setSelectedProfileId(newProfile.id)
  }

  const handleDelete = (): void => {
    if (selectedProfileId) {
      onDeleteProfile(selectedProfileId)
      setSelectedProfileId('')
    }
  }

  return (
    <div className="flex gap-2 items-start mb-2">
      <Select
        label="Profile"
        placeholder="Select a profile"
        className="flex-1"
        selectedKeys={selectedProfileId ? [selectedProfileId] : []}
        onSelectionChange={handleProfileChange}
        isDisabled={isDisabled}
        startContent={<Bookmark className="w-5 h-5 text-default-400" />}
      >
        {profiles.map((profile) => (
          <SelectItem key={profile.id} textValue={profile.name}>
            {profile.name}
          </SelectItem>
        ))}
      </Select>

      <div className="flex gap-1 h-14 items-center pt-2">
        <Tooltip content="Save current settings as profile">
          <Button
            isIconOnly
            aria-label="Save current settings as profile"
            variant="flat"
            onPress={() => setIsSaveModalOpen(true)}
            isDisabled={isDisabled}
          >
            <Save className="w-5 h-5" />
          </Button>
        </Tooltip>

        <Tooltip content="Delete selected profile">
          <Button
            isIconOnly
            color="danger"
            variant="flat"
            isDisabled={!selectedProfileId || isDisabled}
            aria-label="Delete selected profile"
            onPress={handleDelete}
          >
            <Trash2 className="w-5 h-5" />
          </Button>
        </Tooltip>
      </div>

      <Modal isOpen={isSaveModalOpen} onClose={() => setIsSaveModalOpen(false)}>
        <ModalContent>
          <ModalHeader>Save Profile</ModalHeader>
          <ModalBody>
            <Input
              label="Profile Name"
              placeholder="Enter profile name"
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newProfileName.trim()) {
                  handleSave()
                }
              }}
            />
          </ModalBody>
          <ModalFooter>
            <Button color="danger" variant="light" onPress={() => setIsSaveModalOpen(false)}>
              Cancel
            </Button>
            <Button color="primary" onPress={handleSave} isDisabled={!newProfileName.trim()}>
              Save
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
