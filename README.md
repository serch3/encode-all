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

- **Batch & Queue** – Add folders, filter by status, undo removal, and run encodes with progress monitoring
- **Output Review** – Check source files, effective encoding settings, available encoders, destination folders, and numbered output filenames before starting a batch
- **Formats & Codecs** – MP4/MKV/MOV/WebM output; H.264, H.265, VP9, and NVIDIA AV1

### User Experience

- **Modern UI & Themes** – Sleek design with light/dark mode
- **Live Feedback** – FFmpeg command preview and real-time progress
- **Preview Workspace** – A dedicated Preview tab with a large player, position control, and 1–30 second sample encodes using per-file overrides; inspect samples in a separate preview window or system player
- **Readable Logs** – Expand terminal output when needed and pause automatic log following

### Encoding Configuration

- **Codec & Audio Controls** – Video/audio codec, bitrate, channels, thread tuning
- **Output Management** – Easy custom naming and output directory selection
- **Starter Profiles** – Balanced MP4, Fast MP4, Compact HEVC, and WebM profiles with tradeoff descriptions and an indicator for modified settings

### Technical Features

- **FFmpeg Auto-Detection** – Automatically tries to locate FFmpeg on the system for seamless operation.
- **Guided FFmpeg Installation** – Install FFmpeg and FFprobe using WinGet on Windows or an existing Homebrew installation on macOS, with live installation logs

## Installation

Download the latest installer for your operating system from the
[GitHub Releases](https://github.com/serch3/encode-all/releases) page.

Encode-All requires FFmpeg and FFprobe to encode and inspect media. If they are
available on your system `PATH`, the app detects them automatically. You can also
select a custom FFmpeg executable from Settings. FFprobe should live next to the
selected FFmpeg binary. The setup dialog verifies both tools before enabling encoding.

Windows x64 is the primary release target. The assisted installer defaults to a
per-user installation and lets you choose its folder; the app runs without
requesting administrator privileges.

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

Select the videos to encode and choose **Encode** to review their output paths.
The review checks each source file, codec settings, available encoders, and
output folder. Existing files and duplicate batch names receive numbered output
filenames. Choose **Start batch** after resolving any reported problems.

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
```

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
git tag v0.10.0
git push origin v0.10.0
```

The workflow builds Windows, macOS, and Linux artifacts, uploads them to a
GitHub prerelease, and generates release notes. macOS DMG/ZIP builds are universal
and support Intel and Apple Silicon.

Windows and macOS artifacts are unsigned unless signing credentials are provided
to Electron Builder through repository secrets. Unsigned builds are useful for
testing, but public releases should be signed before publishing.

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
