# 🪐 Saturn's Subtitle Tweaks (SST)

```text
                                        _.oo.
                 _.u[[/;:,.         .odMMMMMM'
              .o888UU[[[/;:-.  .o@P^    MMM^
             oN88888UU[[[/;::-.        dP^
            dNMMNN888UU[[[/;:--.   .o@P^
           ,MMMMMMN888UU[[/;::-. o@^
           NNMMMNN888UU[[[/~.o@P^
           888888888UU[[[/o@^-..
          oI8888UU[[[/o@P^:--..
       .@^  YUU[[[/o@^;::---..
     oMP     ^/o@P^;:::---..
  .dMMM    .o@^ ^;::---...
 dMMMMMMM@^`       `^^^^
YMMMUP^
 ^^

      ███████╗ ███████╗ ████████╗
      ██╔════╝ ██╔════╝ ╚══██╔══╝  Saturn's Subtitle Tweaks
      ███████╗ ███████╗    ██║     The Celestial Subtitle Experience
      ╚════██║ ╚════██║    ██║     for Jellyfin 🪐
      ███████║ ███████║    ██║
      ╚══════╝ ╚══════╝    ╚═╝
```

<p align="center">
  <strong>Bringing celestial harmony and effortless synchronization to your Jellyfin playback.</strong><br>
  <em>Search, download, and fine-tune subtitles in orbit — without leaving your video.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Jellyfin-10.11.x-00a4dc?style=for-the-badge&logo=jellyfin&logoColor=white" alt="Jellyfin 10.11.x" />
  <img src="https://img.shields.io/badge/.NET-9.0-512BD4?style=for-the-badge&logo=dotnet&logoColor=white" alt=".NET 9.0" />
  <img src="https://img.shields.io/badge/License-MIT-00b894?style=for-the-badge" alt="MIT License" />
  <img src="https://img.shields.io/badge/Orbit-Stable-f39c12?style=for-the-badge" alt="Orbit Stable" />
</p>

---

## 🪐 Planetary Features

```text
                   🛰️  IN-PLAYER SUBTITLE SEARCH
                   🌍  MULTI-LANGUAGE TRANSLATION MATRIX
                   📡  RICH METADATA & HASH MATCHING
                   ⚡  ONE-CLICK INSTANT DOWNLOAD
                   ⏱️  ZERO-LATENCY TEMPORARY OFFSET
                   🛡️  TITAN-GRADE ZERO-CREDENTIAL SECURITY
```

### 🛰️ Orbital In-Player Subtitle Search
- Open subtitle search **directly during playback** — never leave your video seat.
- Automatically captures current movie or series metadata (IMDb ID, Season, Episode, Hashes).
- Discovers remote subtitles across all server-configured providers in real time.

### 🌍 Universal Language Matrix
- Over **30+ interstellar languages** pre-configured and ready out of the box.
- Conforms to standard ISO 639-2 language codes.
- Seamlessly queries providers for any dialect enabled on your Jellyfin server.

### 📡 High-Fidelity Results with Deep Metadata
- Browse multiple candidates for the perfect sync rather than settling for a single guess.
- Displays rich matching telemetry:
  - **Release Title & Group**
  - **Provider Source** (OpenSubtitles, etc.)
  - **Format** (SRT, ASS, VTT)
  - **FPS / Frame Rate**
  - **Download Count & Community Rating**
  - **Uploader Profile**
- Visual distinction badges:
  - `HASH MATCH` — Mathematical byte-match for exact timing
  - `SDH` — Subtitles for the Deaf and Hard of Hearing
  - `FORCED` — Foreign dialogue only
  - `MACHINE TRANSLATED` / `AI TRANSLATED`

### ⚡ Rapid One-Click Docking (Download)
- Select your preferred subtitle to download and link it directly to your media item.
- Instantly updates player track selections.
- Completely non-destructive: never alters original media containers or overwrites files without permission.

### ⏱️ Temporal Subtitle Alignment (Offset Controls)
- On-the-fly timing adjustments with fine micro-steps (`-0.5s`, `-0.1s`, `0.0s`, `+0.1s`, `+0.5s`).
- Immediate audio-visual sync without reloading streams.
- **Session-bound**: offset safely resets to `0.0s` when playback concludes — no accidental database persistence.

### 📱 Responsive & Adaptive Viewport
- **Desktop**: Fast keyboard shortcuts (`Esc` to close, `Enter` to search) and mouse navigation.
- **Mobile**: Touch-optimized full-screen modal sheets.
- **TV / Large Screen**: High-visibility focus indicators designed for D-Pad and remote controls.

---

## 🚀 Planetary Architecture

```text
                                  +------------------------------------+
                                  |         Jellyfin Web Client        |
                                  |    (SST In-Player OSD & Dialog)    |
                                  +-----------------+------------------+
                                                    |
                                       [Authenticated API Calls]
                                                    |
                                                    v
                                  +-----------------+------------------+
                                  |        Jellyfin Server REST        |
                                  |      /Items/{id}/RemoteSearch      |
                                  +-----------------+------------------+
                                                    |
                                          [ISubtitleProvider]
                                                    |
                                                    v
                                  +-----------------+------------------+
                                  |   Configured Subtitle Providers    |
                                  |      (e.g., OpenSubtitles)         |
                                  +-----------------+------------------+
                                                    |
                                                    v
                                  +-----------------+------------------+
                                  |       External Provider APIs       |
                                  +------------------------------------+
```

---

## 🛡️ Titan-Grade Security Model

> [!IMPORTANT]
> **Saturn's Subtitle Tweaks operates under a strict Zero-Knowledge Credential Policy.**

- 🔒 **Zero Developer Credentials**: SST contains no hardcoded API keys, developer tokens, or secret credentials.
- 🔒 **Zero Server Credential Leaks**: SST never intercepts, transmits, or exposes provider credentials to web clients.
- 🔒 **Zero Telemetry**: No third-party tracking, analytics, or external telemetry pings.
- 🔒 **Native Jellyfin RBAC**: All operations respect Jellyfin user permissions and active authentication sessions.

---

## 📋 System Requirements

- **Jellyfin Server 10.11.x** (or newer)
- **.NET 9.0 Runtime**
- At least one configured subtitle provider on your Jellyfin Server (e.g., the official [OpenSubtitles Plugin](https://github.com/jellyfin/jellyfin-plugin-opensubtitles))

---

## 🛠️ Installation & Mission Setup

### Method 1: Jellyfin Plugin Catalog (Recommended)
1. Navigate to **Jellyfin Dashboard** → **Plugins** → **Repositories**.
2. Add the Saturn's Subtitle Tweaks manifest repository.
3. Install **Saturn's Subtitle Tweaks** from the **Catalog** tab.
4. Restart your Jellyfin Server instance.

### Method 2: Manual Assembly Deployment
1. Grab the latest `Jellyfin.Plugin.SST.dll` artifact from [Releases](../../releases).
2. Drop the assembly into your server's plugin directory:
   ```text
   <Jellyfin-Data>/plugins/SST/Jellyfin.Plugin.SST.dll
   ```
3. Restart Jellyfin Server.

### Client Script Injection
SST's server component automatically injects the client scripts into `jellyfin-web` on startup.

For containerized environments with read-only filesystems, add the tags manually to `index.html`:
```html
<!-- Saturn's Subtitle Tweaks -->
<link rel="stylesheet" href="/sst/ClientStyle" />
<script src="/sst/ClientScript" defer></script>
```

---

## 🎮 Usage Guide

```text
    1. Watch Movie / Show
            ↓
    2. Click Subtitle/CC Menu in Player Controls
            ↓
    3. Select "Find Subtitles (SST)"  (or click floating Saturn icon 🪐)
            ↓
    4. Select Language & Click "Search"
            ↓
    5. Choose Subtitle & Click Download ⚡
            ↓
    6. Fine-tune timing with Subtitle Delay buttons if needed!
```

---

## 🌌 Supported Fleet (Client Matrix)

| Client | SST In-Player UI | Subtitle REST API | Notes |
| :--- | :---: | :---: | :--- |
| **Jellyfin Web (Desktop & Mobile)** | 🪐 Full Support | ✅ Supported | Primary client target |
| **Jellyfin Android (Web Player)** | 🪐 Full Support | ✅ Supported | Supported in WebView player mode |
| **Jellyfin Android (ExoPlayer)** | ⚠️ API Only | ✅ Supported | Native UI integration required |
| **Jellyfin Android TV** | ⚠️ API Only | ✅ Supported | Native Android TV app |
| **Jellyfin iOS (Swiftfin)** | ⚠️ API Only | ✅ Supported | Native SwiftUI client |
| **Jellyfin Desktop (Qt/MPV)** | ⚠️ API Only | ✅ Supported | Uses Qt/libmpv engine |
| **Kodi Jellyfin Addon** | ⚠️ API Only | ✅ Supported | Uses Kodi subtitle subsystem |

---

## 🛠️ Local Development

```bash
# Clone the repository
git clone https://github.com/abdurahmankrsk/Saturn-s-Subtitle-Tweaks.git

# Navigate to project directory
cd Saturn-s-Subtitle-Tweaks

# Restore & build with .NET 9
dotnet build --configuration Release
```

---

## 📜 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for complete terms.

---

<p align="center">
  <em>Saturn's Subtitle Tweaks — Orbiting your media library with precision. 🪐✨</em>
</p>
