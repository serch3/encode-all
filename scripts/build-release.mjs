import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

const platform = process.argv[2]
if (!['windows', 'macos', 'linux'].includes(platform)) throw new Error('Choose a release platform.')
const credentialPrefix = platform === 'macos' ? 'MAC' : 'WIN'
if (platform !== 'linux' && process.env[`${credentialPrefix}_CSC_LINK`]) {
  process.env.CSC_LINK = process.env[`${credentialPrefix}_CSC_LINK`]
  process.env.CSC_KEY_PASSWORD = process.env[`${credentialPrefix}_CSC_KEY_PASSWORD`]
}
const signed = process.env.REQUIRE_SIGNING === 'true' && platform !== 'linux'
if (signed) {
  if (!process.env.CSC_LINK || !process.env.CSC_KEY_PASSWORD)
    throw new Error('Release signing credentials are missing.')
  if (
    platform === 'macos' &&
    ![
      process.env.APPLE_ID,
      process.env.APPLE_APP_SPECIFIC_PASSWORD,
      process.env.APPLE_TEAM_ID
    ].every(Boolean)
  )
    throw new Error('macOS notarization credentials are missing.')
}
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function run(executable, args) {
  const result = spawnSync(executable, args, { stdio: 'inherit', env: process.env })
  if (result.status !== 0)
    throw new Error(result.error?.message || `${executable} failed (${result.status}).`)
}
const require = createRequire(import.meta.url)
const args = [
  require.resolve('electron-builder/out/cli/cli.js'),
  platform === 'macos' ? '--mac' : platform === 'windows' ? '--win' : '--linux',
  '--publish',
  'never'
]
if (signed) args.push('--config.forceCodeSigning=true', '--config.extraMetadata.signedRelease=true')
if (signed && platform === 'macos') args.push('--config.mac.notarize=true')
run(process.execPath, args)
if (signed && platform === 'windows')
  run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    "$ErrorActionPreference = 'Stop'; $files = @(Get-Item -LiteralPath 'dist/win-unpacked/encode-all.exe') + @(Get-ChildItem -LiteralPath 'dist' -Filter '*-setup.exe' -File); if ($files.Count -lt 2) { throw 'Signed app or installer is missing' }; foreach ($file in $files) { $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName; if ($signature.Status -ne 'Valid') { throw ('Invalid Authenticode signature: ' + $file.Name + ' (' + $signature.Status + ')') } }"
  ])
if (signed && platform === 'macos') {
  for (const folder of (await readdir('dist')).filter((name) => name.startsWith('mac'))) {
    for (const name of (await readdir(join('dist', folder))).filter((name) =>
      name.endsWith('.app')
    )) {
      const app = join('dist', folder, name)
      run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app])
      run('/usr/sbin/spctl', ['--assess', '--type', 'execute', app])
      run('/usr/bin/xcrun', ['stapler', 'validate', app])
    }
  }
}
