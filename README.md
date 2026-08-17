# Saturn's Subtitle Tweaks (SST)

A Jellyfin plugin that provides an enhanced in-player subtitle experience.

**Search, download, and fine-tune subtitles — without leaving the video player.**

![Jellyfin](https://img.shields.io/badge/Jellyfin-10.11.x-blue)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

### 🔍 In-Player Subtitle Search
- Open the subtitle search **during playback** — no need to navigate away
- Automatically detects the current movie or episode
- Searches all configured subtitle providers through Jellyfin's existing infrastructure

### 🌍 Language Selection
- 30+ languages supported out of the box
- Uses Jellyfin's standard language codes
- Select any language your subtitle provider supports

### 📋 Rich Search Results
- View **multiple** subtitle results (not just one)
- Metadata displayed for each result:
  - Release name
  - Provider
  - Format (SRT, etc.)
  - FPS / frame rate
  - Download count
  - Community rating
  - Uploader
- Clear badges for:
  - **Hash Match** — high confidence sync
  - **SDH** — hearing impaired
  - **Forced** — foreign parts only
  - **Machine Translated**
  - **AI Translated**

### ⬇️ One-Click Download
- Select a subtitle and download it directly
- Subtitle is immediately available in the player's track list
- No manual file handling required

### ⏱️ Subtitle Timing Controls
- Fine-grained offset adjustment: ±0.1s and ±0.5s buttons
- See current offset at a glance
- **Session-only** — offset resets when playback ends (never saved permanently)

### 📱 Responsive Design
- Desktop: mouse + keyboard
- Mobile: touch-friendly, full-screen dialog
- TV: large controls, remote-friendly focus styles

---

## Requirements

- **Jellyfin Server 10.11.x** or later
- **A subtitle provider plugin** installed and configured on the server
  (e.g., [Open Subtitles](https://github.com/jellyfin/jellyfin-plugin-opensubtitles))

> **Important:** SST does not include any subtitle provider.
> Your server administrator must install and configure a provider
> (like Open Subtitles) with their own credentials.

---

## Installation

### From Jellyfin Plugin Repository (Recommended)

1. Open Jellyfin Dashboard → **Plugins** → **Repositories**
2. Add the SST repository URL (coming soon)
3. Go to **Catalog** → find **Saturn's Subtitle Tweaks**
4. Click **Install** and restart Jellyfin

### Manual Installation

1. Download the latest release from the [Releases](../../releases) page
2. Extract `Jellyfin.Plugin.SST.dll` to your Jellyfin plugins directory:
   ```
   <jellyfin-data>/plugins/SST/Jellyfin.Plugin.SST.dll
   ```
3. Restart Jellyfin Server

### Web Client Script Injection

SST automatically injects its JavaScript into the Jellyfin Web client's `index.html` on server startup.

If this fails (e.g., in a Docker container with a read-only filesystem), you can manually add the script tag:

```html
<!-- Add before </head> in jellyfin-web's index.html -->
<link rel="stylesheet" href="/sst/ClientStyle" />
<script src="/sst/ClientScript" defer></script>
```

---

## Configuration

1. Open Jellyfin Dashboard → **Plugins** → **Saturn's Subtitle Tweaks**
2. Options:
   - **Enable SST UI**: Toggle the SST interface on/off
   - **Default Language**: Set a preferred language (ISO 639-2 code, e.g., `eng`)

### Subtitle Provider Setup

SST relies on Jellyfin's subtitle provider system. To use SST:

1. Install a subtitle provider plugin (e.g., **Open Subtitles** from the official catalog)
2. Configure the provider with your own credentials
3. SST will automatically use all configured providers when searching

> **SST never stores or transmits subtitle provider credentials.**
> Credentials are managed entirely by each provider plugin on the server side.

---

## Usage

### During Playback

1. Click the **subtitle/CC button** in the player controls
2. Select **"Find Subtitles (SST)"** from the menu
   - Or click the floating subtitle button (bottom-right corner)
3. Select a language and click **Search**
4. Browse results and click the **download button** on your preferred subtitle
5. The subtitle will be downloaded and added to the player's track list

### Subtitle Timing

Use the offset controls at the bottom of the SST dialog:
- **-0.5s / -0.1s**: Move subtitles earlier
- **+0.1s / +0.5s**: Move subtitles later
- **Reset**: Return to 0 offset

The offset is temporary and resets when playback ends.

---

## Supported Clients

| Client | SST UI | Subtitle API |
|:---|:---:|:---:|
| Jellyfin Web (browser) | ✅ | ✅ |
| Jellyfin Desktop (Windows/Mac/Linux) | ❌* | ✅ |
| Jellyfin Android (WebView player) | ⚠️ Likely | ✅ |
| Jellyfin Android (integrated player) | ❌ | ✅ |
| Jellyfin Android TV | ❌ | ✅ |
| Jellyfin iOS (Swiftfin) | ❌ | ✅ |
| Kodi | ❌ | ✅ |
| Roku | ❌ | ✅ |

\* Jellyfin Desktop uses Qt/MPV, not the web client.

The Jellyfin REST API for subtitle operations is available to all clients. The SST in-player UI currently only works in web-based clients.

---

## Security

- ✅ **No API keys** in source code
- ✅ **No credentials** stored or transmitted
- ✅ **No telemetry** or analytics
- ✅ **No external servers** — all requests go through Jellyfin
- ✅ Provider credentials remain **server-side only**
- ✅ Safe to publish publicly on GitHub

SST acts as a UI layer on top of Jellyfin's existing authenticated REST API. All subtitle operations are authenticated using the user's standard Jellyfin session token.

---

## Development

### Prerequisites

- [.NET 9.0 SDK](https://dotnet.microsoft.com/download)
- Jellyfin Server 10.11.x (for testing)

### Build

```bash
dotnet build
```

### Install for Testing

```bash
# Copy the built DLL to your Jellyfin plugins directory
cp Jellyfin.Plugin.SST/bin/Debug/net9.0/Jellyfin.Plugin.SST.dll \
   <jellyfin-data>/plugins/SST/
```

### Project Structure

```
jellyfin-plugin-sst/
├── Jellyfin.Plugin.SST/
│   ├── API/
│   │   └── SSTClientScriptController.cs   # Serves JS/CSS to web client
│   ├── Configuration/
│   │   └── PluginConfiguration.cs         # Plugin settings (no credentials)
│   ├── Web/
│   │   ├── sst.js                         # Main client-side module
│   │   ├── sst.css                        # Stylesheet
│   │   ├── configPage.html                # Admin config page
│   │   └── configPage.js                  # Config page logic
│   ├── SSTPlugin.cs                       # Plugin entry point
│   └── ScriptInjector.cs                  # Web client script injection
├── build.yaml                             # Plugin manifest
├── README.md
├── LICENSE
└── CHANGELOG.md
```

---

## Known Limitations

1. **Web client only**: The SST UI currently only works in Jellyfin Web. Native clients (Android TV, iOS, Desktop) can use the subtitle API but don't get the SST UI.
2. **Script injection**: The automatic injection modifies `index.html`, which may not work in read-only Docker containers. Manual injection is available as a fallback.
3. **Jellyfin Web refactor**: Jellyfin Web is undergoing a React migration. SST's DOM-based integration may need updates for future Jellyfin versions.
4. **Subtitle offset**: The offset implementation depends on Jellyfin Web's internal subtitle sync mechanism. Behavior may vary with different subtitle formats (SRT vs ASS).

---

## License

[MIT License](LICENSE)

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting changes.

---

## Acknowledgments

- [Jellyfin](https://jellyfin.org/) — the free software media system
- [Jellyfin OpenSubtitles Plugin](https://github.com/jellyfin/jellyfin-plugin-opensubtitles) — architectural reference
- Inspired by the subtitle workflow in Stremio/Wholphin
