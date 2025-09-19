import { Switch, cn } from '@heroui/react'

interface SettingsProps {
  showFfmpegPreview: boolean
  onShowFfmpegPreviewChange: (value: boolean) => void
}

export default function Settings({
  showFfmpegPreview,
  onShowFfmpegPreviewChange
}: SettingsProps): React.JSX.Element {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Settings</h2>

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
            //selected
            'group-data-[selected=true]:ms-6',
            // pressed
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
  )
}
