import { Button, Card, CardBody, Chip, Divider } from '@heroui/react'
import { Github, Sparkles, Shield, Cpu, Monitor, Wand2, User } from 'lucide-react'

export default function AboutPage(): React.JSX.Element {
  const repoUrl = 'https://github.com/serch3/encode-all'

  const openExternal = (url: string): void => {
    if (window.api?.openExternal) {
      window.api.openExternal(url)
      return
    }

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-semibold">About Encode All</h2>
        </div>
        <p className="text-default-500 max-w-3xl">
          Encode All is a cross-platform desktop application that provides a sleek, modern interface for batch video encoding using FFmpeg.
        </p>
        <div className="flex flex-wrap gap-2">
          <Chip variant="flat" startContent={<Cpu className="w-4 h-4" />}>
            Hardware acceleration Support
          </Chip>
          <Chip variant="flat" startContent={<Wand2 className="w-4 h-4" />}>
            Preset-driven
          </Chip>
          <Chip variant="flat" startContent={<Shield className="w-4 h-4" />}>
            Local-only processing
          </Chip>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="flat"
            color="primary"
            startContent={<Github className="w-4 h-4" />}
            onPress={() => openExternal(repoUrl)}
          >
            View source
          </Button>
        </div>
      </div>

      <Divider />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-default-500" />
              <h3 className="text-lg font-semibold">Creator</h3>
            </div>
            <p className="text-default-500">
              Built and maintained by <span className="font-medium text-foreground">Sergio Mandujano</span>.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-center gap-2">
              <Github className="w-4 h-4 text-default-500" />
              <h3 className="text-lg font-semibold">Source code</h3>
            </div>
            <p className="text-default-500">Repository, releases, and issues.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="flat" onPress={() => openExternal(repoUrl)}>
                GitHub repository
              </Button>
              <Button size="sm" variant="ghost" onPress={() => openExternal(`${repoUrl}/releases`)}>
                Releases
              </Button>
              <Button size="sm" variant="ghost" onPress={() => openExternal(`${repoUrl}/issues`)}>
                Issues
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

    </div>
  )
}
