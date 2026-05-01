# SDA Hymnal Desktop

## Professional Hymn Broadcast Console & Overlay Server

SDA Hymnal Desktop is a lightweight, all-in-one broadcast console designed for church media teams. It allows you to search, load, and control hymn lyrics with live previews, sending real-time updates to professional browser-based overlays for OBS, vMix, or any modern streaming software.

<img width="1230" height="794" alt="Application Screenshot" src="https://github.com/user-attachments/assets/56296449-293f-4e0c-b5f4-3a06a515b919" />

## Key Features

- **Lightning Fast Search:** Find any hymn in seconds by number or title using the numeric search rail.
- **Live Control Room:** Preview current, previous, and next lines before they go live on screen.
- **Real-time Styling:** Adjust font size, alignment, animations, and speaker labels on the fly without refreshing overlays.
- **Multi-Output Support:** Dedicated overlay profiles for Lower Thirds, Stage Displays, and Full-screen Lyrics.
- **Power-User Shortcuts:** Full keyboard control (Space, Enter, Arrows) for seamless operation during service.

> [!IMPORTANT]
> By default, this application uses ports 9999 (HTTP) and 8765 (WebSocket). The internal server starts automatically upon launch and will fall back to alternate open ports if the defaults are unavailable. Use the **URLs** button in the app header to retrieve the active links for your broadcast software.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (preferred) or [Node.js](https://nodejs.org/)
- [Python 3.12+](https://www.python.org/) (required only for building app icons)

### Installation & Development

```bash
bun install
bun dev
```

## Broadcast Integration

1.  Launch SDA Hymnal Desktop.
2.  Click the **URLs** button in the top right.
3.  Copy the URL for your desired overlay (e.g., Lower Third).
4.  In OBS or vMix, add a new **Browser Source**.
5.  Paste the URL and set the size to **1920x1080**.

## Development & Packaging

### Building Icons

Packaging commands require generated icons. Run this once before your first distribution build:

```bash
bun run build:icons
```

### Creating Installers

Generate production-ready installers for your platform:

```bash
bun run dist:win    # Windows (.exe, .nsis)
bun run dist:mac    # macOS (.dmg)
bun run dist:linux  # Linux (.AppImage, .deb)
```

## Automated Releases

Pushes to the main branch trigger an automated CI workflow that:

- Runs semantic-release for versioning.
- Updates CHANGELOG.md.
- Generates platform-specific installers.
- Uploads installers directly to a new GitHub Release.

## Contributing

> Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.
> Please check out the [Contributing Guide](CONTRIBUTING.md) to get started.

Made with love 💖 by @[vernonthedev](https://github.com/vernonthedev)
