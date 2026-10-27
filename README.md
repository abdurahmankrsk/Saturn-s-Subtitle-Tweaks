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

### 📡 Companion Remote Mode for TV Clients
- TV apps (Android TV, Google TV, webOS, Tizen, Apple TV, Roku) do **not** load Jellyfin Web, so SST cannot place its menu inside them.
- Instead, drive them seamlessly from your phone or PC: SST displays a one-tap banner whenever your TV is playing, downloads your subtitle selection directly into the server library, and makes it available on the TV (simply exit and reopen the video to select it).
- Optional server-side automatic download covers every client with no UI at all.
- See [`docs/TV-CLIENTS.md`](docs/TV-CLIENTS.md) for the full picture, including how to build a Samsung/LG app with SST baked in.

### 📱 Responsive & Adaptive Viewport
- **Desktop**: Fast keyboard shortcuts (`Esc` to close, `Enter` to search) and mouse navigation.
- **Mobile**: Touch-optimized full-screen modal sheets.
- **Jellyfin Web in TV display mode**: High-visibility focus indicators for D-Pad and remote controls. This is the web client's TV layout, not the native TV apps.

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

1. Open **Dashboard** → **Plugins** → **Repositories**.
2. Click **+** and add this manifest URL:

   ```text
   https://raw.githubusercontent.com/abdurahmankrsk/Saturn-s-Subtitle-Tweaks/main/manifest.json
   ```

3. Open the **Catalog** tab, find **Saturn's Subtitle Tweaks**, and install or update.
4. Restart Jellyfin when prompted.

If an update fails with a checksum error, wait a minute and try again (GitHub `raw` CDN can lag behind the latest commit), or run `.\scripts\build-release.ps1` locally and copy the DLL manually.

**Do not install File Transformation just to make SST load.** SST 1.1.1+ registers it only after Jellyfin has finished starting. If a previous SST version crashed the server, delete the SST folder under `plugins/` and install 1.1.1.0 from the catalog.

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

## 🎮 How It Works & Usage Guide

Saturn's Subtitle Tweaks adapts automatically depending on whether you are watching on a computer, a phone, or a television.

---

### 💻 1. On Computer / Desktop (PC, Mac, Linux Browser)
On desktop web browsers (Chrome, Firefox, Edge, Safari, etc.):

1. While playing any video, click the **CC / Subtitle** button on the bottom player control bar.
2. Inside the subtitle menu, SST adds two dedicated controls right at the top:
   - 🔍 **Find subtitles**: Search subtitles across all configured providers (OpenSubtitles, etc.), filter by language, check hash-match badges, and download directly without leaving your video.
   - ⏱️ **Subtitle Offset**: Adjust subtitle delay in real-time (`-0.5s`, `-0.1s`, `+0.1s`, `+0.5s`, or reset) to sync audio and dialogue instantly.

---

### 📱 2. On Mobile / Phone (Android & iOS)
On mobile web browsers or the official Jellyfin mobile app:

1. Tap the video player to bring up playback controls and tap the **CC / Subtitle** icon.
2. The menu opens with:
   - 🔍 **Find subtitles**: Mobile-optimized search sheet to quickly find and download subtitles.
   - ⏱️ **Subtitle Offset**: Large touch-friendly stepper buttons to nudge subtitle timing forward or backward on the fly.

---

### 📺 3. On TV (Android TV, Google TV, Fire TV, Apple TV, Smart TVs)

#### ❓ Why can't subtitles be searched directly inside the TV app?
Native TV apps (such as **Jellyfin for Android TV**, **Google TV**, **Fire TV**, and **Apple TV / Swiftfin**) are compiled native applications. They do **not** load `jellyfin-web` from your server and do not run web JavaScript inside their native video player (ExoPlayer). Because of this technical boundary, no server-side web plugin can inject custom buttons directly into the TV's native in-player OSD menu.

#### 🛰️ The Solution: Companion Remote Download
Instead of struggling with a clunky TV remote and on-screen keyboard, SST lets you use your phone or computer as a companion controller!

1. **Watch on your TV**: Start playing any movie or episode on your TV.
2. **Open Jellyfin on your Phone or PC**: While the TV is playing, simply open the Jellyfin app or web interface on your phone or computer.
3. **Popup Banner Appears**: SST automatically detects that your TV is playing and displays a floating banner at the top of your screen:

<p align="center">
  <img src="docs/images/remote-banner.png" alt="SST Remote Subtitle Banner on Phone" width="600" />
</p>

4. **Tap the Banner**: Tap **"🪐 Find subtitles for [Your TV Name]"** (e.g., *Living Room TV*).
5. **Search & Download**: Select your desired language, search, and hit **Download**. SST downloads the subtitle directly onto your Jellyfin server and attaches it to the media in your library.
6. ⚠️ **Important Step on TV**:
   Native TV players (like ExoPlayer) load the list of available subtitles only once when the video first starts. Because the new subtitle was downloaded mid-playback:
   > **Simply exit (back out) of the episode or movie on your TV, and open it again.**
   
   Upon reopening, the newly downloaded subtitle will be right there in your TV's subtitle menu, fully selectable and ready to watch!

---

## 🌌 Supported Fleet (Client Matrix)

| Client | In-Player Menu | Companion Mode (Phone/PC) | How it works |
| :--- | :---: | :---: | :--- |
| **PC / Desktop Browser** | 🪐 Full Support | — | Click CC icon → Search, download & timing offset directly in-player |
| **Mobile Phone / Tablet (Web & App)** | 🪐 Full Support | — | Tap CC icon → Search, download & timing offset directly in-player |
| **Jellyfin Android TV / Google TV** | ❌ Native app | 🛰️ Supported | Open Jellyfin on phone/PC → Tap banner popup → Download → Exit & reopen video on TV |
| **Fire TV** | ❌ Native app | 🛰️ Supported | Open Jellyfin on phone/PC → Tap banner popup → Download → Exit & reopen video on TV |
| **Apple TV (Swiftfin)** | ❌ Native app | 🛰️ Supported | Open Jellyfin on phone/PC → Tap banner popup → Download → Exit & reopen video on TV |
| **Samsung (Tizen) / LG (webOS)** | ❌ Bundled web | 🛰️ Supported | Companion banner on phone/PC (or sideload custom web build via [`docs/TV-CLIENTS.md`](docs/TV-CLIENTS.md)) |
| **Jellyfin Desktop (Qt/MPV)** | ❌ Bundled web | 🛰️ Supported | Uses Qt/libmpv engine; driven via companion banner or cast |
| **Kodi Jellyfin Addon** | ❌ Native | 🛰️ Supported | Uses Kodi subtitle subsystem |

> [!NOTE]
> **Why native TV apps use Companion Mode**: SST injects itself into `jellyfin-web`'s `index.html` as your server
> serves it. Native apps never load that page, and smart-TV apps package their own copy of
> `jellyfin-web` inside the app. Server-side injection cannot reach either. The companion remote-control
> banner is how SST covers them cleanly without requiring custom sideloading.

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
