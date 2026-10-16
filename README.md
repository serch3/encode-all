<div align="center">
  <img src="resources/icon.png" alt="Encode-All Logo" width="120" height="120">

# Encode-All

**A Modern FFmpeg GUI for Bulk Video Encoding**

[![Electron](https://img.shields.io/badge/Electron-44.7.0-47848F?style=flat&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19.3.0-61DAFB?style=flat&logo=react&logoColor=white)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.3.3-38B2AC?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat)](LICENSE)

[Features](#features) • [Installation](#installation) • [Development](#development) • [Release](#release) • [Tech Stack](#tech-stack)

</div>

---

## Overview

**Encode-All** is a cross-platform desktop application that provides a sleek, modern interface for bulk video encoding using FFmpeg.

## Features

### Core Functionality

- **Batch & Queue** – Add files or folders, search a persistent queue, pause scheduling after active files finish, retry failures, and optionally continue after an error
- **Output Review** – Check source streams, effective encoding settings, available encoders, destination space, and numbered output filenames before starting a batch; execution stays bound to the reviewed settings and source identity
- **Formats & Codecs** – MP4/MKV/MOV/WebM output; software H.264, H.265, VP9, and AV1, plus detected NVIDIA NVENC, Apple VideoToolbox, Intel Quick Sync, and AMD AMF encoders
- **Safe Output & History** – Encode into a private destination file, publish without overwriting existing videos, and browse the latest 200 successful outputs with sizes, savings, and Open/Reveal actions

### User Experience

- **Modern UI & Themes** – Sleek design with light/dark mode
- **Persistent Workspace** – Keep the searchable queue beside settings on larger windows, with bounded rendering for large batches and durable queue checkpoints across restarts
- **Live Feedback** – FFmpeg command preview and real-time progress
- **Preview Workspace** – A dedicated Preview tab with position control and 1–30 second sample encodes using per-file overrides; compare source/output side by side or open samples in a separate window or system player
- **Readable Logs** – Expand terminal output when needed and pause automatic log following
- **Desktop Integration** – Native file picker and open shortcut, saved window bounds, batch progress in the taskbar/Dock, and completion notifications when the app is unfocused

### Encoding Configuration

- **Codec & Audio Controls** – Video/audio codec, bitrate, channels, thread tuning
- **Delivery Controls** – Optional per-file target size in bitrate mode, maximum output height without upscaling, compatible pixel formats, individual audio/subtitle track selection, and text subtitle conversion
- **Output Management** – Easy custom naming and output directory selection
- **Starter Profiles** – Balanced MP4, Fast MP4, Compact HEVC, and WebM profiles with tradeoff descriptions and an indicator for modified settings

### Technical Features

- **FFmpeg Auto-Detection** – Automatically tries to locate FFmpeg on the system for seamless operation.
- **Guided FFmpeg Installation** – Install FFmpeg and FFprobe using WinGet on Windows or an existing Homebrew installation on macOS, with live installation logs
- **Explicit Updates** – Signed release builds can check stable or beta releases, download on request, and install while encoding is idle

## Installation

Download the latest installer for your operating system from the
[GitHub Releases](https://github.com/serch3/encode-all/releases) page.

Encode-All requires FFmpeg and FFprobe to encode and inspect media. If they are
available on your system `PATH`, the app detects them automatically. You can also
select a custom FFmpeg executable from Settings. FFprobe should live next to the
selected FFmpeg binary. The setup dialog verifies both tools before enabling encoding.

Windows x64 and macOS 13 or newer are the primary targets. macOS release packages
are universal for Intel and Apple Silicon. The Windows assisted installer defaults
to a per-user installation and lets you choose its folder; the app runs without
requesting administrator privileges. Linux packages remain available with lower
release priority. Hardware encoders depend on the FFmpeg build, GPU, and drivers;
the app tests encoder initialization before offering them.

On Windows, **Install FFmpeg** uses WinGet’s `Gyan.FFmpeg` package in user scope.
WinGet requires Microsoft App Installer. On macOS, the same button uses an
existing Homebrew installation. The app searches common installation locations
after installing, so it can use FFmpeg without restarting to refresh PATH.

On Linux, install FFmpeg with your distribution’s package manager. Examples:
`sudo apt install ffmpeg` on Debian/Ubuntu or `sudo pacman -S ffmpeg` on Arch.
Fedora’s `ffmpeg-free` package may need additional repositories for some codecs.

Add videos, then open the **Preview** tab to choose any queued file, start time,
and duration up to 30 seconds. **Generate Preview** encodes a short sample using
the file’s effective settings, including queue overrides. The clip remains
available when you switch tabs to adjust settings. **Open Preview Window** opens
the encoded sample in a separate resizable player. Stream copy preserves the
original quality, so choose an encoder to preview compression. Playback depends
on the codec/container; **Open in System Player** opens the actual sample when
embedded playback is unavailable. Samples use temporary storage.
**Compare source and output** synchronizes a muted original with the encoded
sample; source playback also depends on the embedded player's codec support.

Select the videos to encode and choose **Encode** to review their output paths.
The review checks each source file, codec settings, available encoders, and
output folder. Existing files and duplicate batch names receive numbered output
filenames. Choose **Start batch** after resolving any reported problems.

The queue restores interrupted work as pending after a restart. **Pause** lets
active files finish and holds the next files; it does not suspend an FFmpeg process.
Closing during active encoding asks whether to keep encoding or stop and close.
The app does not encode in the background after its main window closes.

Target size is approximate and reserves space for selected audio tracks and muxing
overhead. Use two-pass bitrate encoding when size predictability matters. Compatible
output uses an 8-bit 4:2:0 format; HDR sources require an explicit Preserve source
format choice. Automatic HDR-to-SDR tone mapping and guaranteed preservation of
dynamic HDR metadata are not implemented. Verify HDR output on its intended player.

## Development

### Setup

Use Node.js 22.12 or newer.

```bash
# Clone the repository
git clone https://github.com/serch3/encode-all.git
cd encode-all

# Install dependencies
npm install
```

### Development Mode

```bash
# Start the application in development mode with hot-reload
npm run dev
```

### Testing

```bash
# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage

# Verify actual H.264 preview and H.265/VP9 two-pass encodes
# Requires FFmpeg and FFprobe on PATH, or FFMPEG_PATH / FFPROBE_PATH
npm run test:ffmpeg

# Native Windows discovery, Unicode paths, and GPU codec checks
npm run test:windows

# Native Windows app playback, streaming, cleanup, and cancellation
# Requires a production build and FFmpeg/FFprobe
npm run test:windows:app

# Native Electron app preview/encoding, history, checkpoint, and cancellation checks
# Requires a production build, FFmpeg/FFprobe, and a graphical desktop
npm run test:app

# Launch the packaged Windows/macOS app and verify renderer/preload/FFmpeg discovery
# First run the platform packaging command
npm run test:packaged
```

CI validates Windows, Apple Silicon macOS, Intel macOS, and Linux. Windows and
macOS additionally run real FFmpeg/Electron checks and launch packaged apps.
GPU availability varies by runner; a passing hosted-runner check does not establish
compatibility with every GPU or driver. Local unit tests exercise safe file
publication, queue recovery, scheduling, review integrity, and update behavior.

### Building

```bash
# Build for Windows
npm run build:win

# Build for macOS
npm run build:mac

# Build for Linux
npm run build:linux
```

## Release

Release builds are created by the GitHub Actions workflow in
`.github/workflows/release.yml`.

```bash
# Create and push a version tag
git tag v0.10.1
git push origin v0.10.1
```

The workflow builds Windows, macOS, and Linux artifacts, uploads them to a
GitHub prerelease, and generates release notes. macOS DMG/ZIP builds are universal
and support Intel and Apple Silicon.

Set these repository secrets for signed releases:

- Windows: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`.
- macOS: `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`.

Set repository variable `REQUIRE_SIGNING=true`, or select **Require signed
Windows/macOS artifacts and macOS notarization** on a manual workflow run, to
fail builds that cannot sign. Required signed macOS builds also validate the code
signature, Gatekeeper assessment, and notarization ticket. The macOS configuration
uses hardened runtime and the Electron JIT entitlement. No signing credentials
are stored in the repository.

Unsigned development builds remain available and link to the download page.
The in-app updater is enabled only for required signed Windows/macOS release
builds. It never downloads or restarts automatically and refuses installation
during active encodes. The workflow currently publishes GitHub **prereleases**;
promote a verified signed release on GitHub before offering it on the stable
channel. Beta checks include prereleases. Linux build failure does not block
Windows/macOS release publication.

The compatibility changes still require native verification of signed installers,
macOS Gatekeeper/notarization, Windows upgrade/uninstall, both Mac architectures,
and representative NVIDIA/Intel/AMD/Apple hardware. Watch folders, time scheduling,
and a main-process queue scheduler are future work.

## Tech Stack

### Frontend

- **[React](https://reactjs.org/)** – UI library
- **[TypeScript](https://www.typescriptlang.org/)** – Type-safe JavaScript
- **[Tailwind CSS](https://tailwindcss.com/)** – Utility-first CSS framework
- **[HeroUI](https://www.heroui.com/)** – Modern React component library
- **[Framer Motion](https://www.framer.com/motion/)** – Animation library
- **[Lucide React](https://lucide.dev/)** – Icon library

### Desktop Framework

- **[Electron](https://www.electronjs.org/)** – Cross-platform desktop apps
- **[Electron Vite](https://electron-vite.org/)** – Fast build tooling
- **[Electron Builder](https://www.electron.build/)** – Packaging and distribution

### Development Tools

- **[Vite](https://vitejs.dev/)** – Next-generation frontend tooling
- **[Jest](https://jestjs.io/)** – Testing framework
- **[ESLint](https://eslint.org/)** – Code linting
- **[Prettier](https://prettier.io/)** – Code formatting

### Backend Processing

- **[FFmpeg](https://ffmpeg.org/)** – Multimedia framework for video/audio processing

## Contributing

Feel free to open issues and submit pull requests! There is a lot of room for improvements.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

**Sergio Mandujano** – [GitHub](https://github.com/serch3)
