# Changelog

All notable changes to Saturn's Subtitle Tweaks (SST) will be documented in this file.

## [1.3.8] - 2026-08-18

### Fixed
- CC subtitle menu is full size again on phone, and a normal popover height on PC

## [1.3.7] - 2026-08-18

### Fixed
- Stop cloning player-bar buttons and calling PlaybackInfo (those loops could freeze the web client or take the Jellyfin server down)

### Notes
- Tesla / Google TV uses the native Jellyfin Android TV app. SST cannot add Find Subtitles to that CC menu.

## [1.3.6] - 2026-08-18

### Fixed
- Laptop CC popover sits just above the progress bar after SST adds its rows
- Find Subtitles and Subtitle Offset also appear next to CC on the Jellyfin Web player bar (desktop and web-TV)

### Notes
- Official Android TV, Fire TV, Apple TV, and Roku apps still cannot show SST (those apps do not load Jellyfin Web)

## [1.3.5] - 2026-08-18

### Fixed
- Jellyfin Web TV layout (Samsung/LG/TV display mode): D-pad can open Find Subtitles without breaking the CC sheet

### Notes
- Official Android TV, Fire TV, Apple TV, and Roku apps still cannot show SST in the CC menu (those apps do not load Jellyfin Web)

## [1.3.4] - 2026-08-18

### Fixed
- The same OpenSubtitles result can only be downloaded once per episode

## [1.3.3] - 2026-08-18

### Fixed
- Downloading an English result no longer applies an existing Croatian (or other) track
- CC menu list scrolls above the progress bar without detaching from the CC button

## [1.3.2] - 2026-08-18

### Fixed
- Downloaded subtitles turn off every other track, then show only the new file
- Selecting Off / English / Croatian in the CC menu stops the SST overlay so native tracks work again
- CC subtitle sheet stays attached to the player instead of floating after SST injects its rows
- Applying a download no longer waits on a library refresh (that added ~2s)

## [1.3.1] - 2026-08-18

### Fixed
- Jellyfin server no longer registers File Transformation or writes `index.html` after startup (those leftover hooks could still take Kestrel down). SST injects only via request middleware.

## [1.3.0] - 2026-08-18

### Added
- Separate CC menu items: **🪐 Find Subtitles** and **🪐 Subtitle Offset**

### Fixed
- Downloaded subtitles are fetched as VTT and rendered on the current video instead of only saving a library file

## [1.2.3] - 2026-08-18

### Changed
- CC menu item and dialog title now read **🪐 Find Subtitles**

## [1.2.2] - 2026-08-18

### Fixed
- Find subtitles dialog is clickable again: leftover Jellyfin action-sheet overlay (`z-index: 999999`) no longer sits on top and swallows clicks

## [1.2.1] - 2026-08-18

### Fixed
- CC subtitle sheet stays on screen after **Find subtitles** is inserted: shifted up, capped to the viewport, and the track list scrolls instead of running under the taskbar

## [1.2.0] - 2026-08-18

### Added
- Full in-player subtitle search: language picker, remote results, metadata badges
- One-click download through Jellyfin's subtitle provider API
- Attempts to select the new track immediately after download
- Session-only subtitle delay buttons (`-0.5s -0.1s 0 +0.1s +0.5s`) that do not edit subtitle files

### Fixed
- **Find subtitles** is inserted at the top of the CC action sheet instead of the bottom

## [1.1.2] - 2026-08-18

### Fixed
- SST client script is now injected into `/web/index.html` on every page load via ASP.NET middleware (no File Transformation required)
- Script is also served at `/web/sst.js` so a missing `/sst/ClientScript` route cannot hide the button
- Subtitle action sheet detection matches Jellyfin 10.11 (title, Off track, Secondary Subtitles)
- Menu item is cloned from a real action-sheet row so it appears in the CC menu
- Hooks attach immediately (no wait on plugin configuration)

## [1.1.1] - 2026-08-18

### Fixed
- **Jellyfin server no longer crashes on plugin load**
- Removed startup `AssemblyLoad` hooks and webpack-bundle File Transformation (those could take down Kestrel)
- Delayed optional File Transformation registration until after the server is fully started
- Stopped using `Microsoft.Net.Http.Headers` in the plugin controller
- Pinned `Jellyfin.Controller` to `10.11.0` instead of the unstable `10.*-*` wildcard
- Index.html disk writes are optional, delayed, and never fatal

## [1.1.0] - 2026-08-18

### Added
- Phase 1 POC: **Find subtitles** injected into Jellyfin 10.11.x subtitle action sheet during playback
- Modular client architecture (`SST.Core`, `SST.UI`, `SST.Integration`) for future native jellyfin-web integration
- Plugin catalog icon (`Web/icon.png`)
- `scripts/build-release.ps1` and GitHub Actions workflow for packaging + manifest checksum updates

### Fixed
- Reliable web client script loading (`<base>`-aware loader, webpack bundle patterns)
- Removed crash-prone legacy injection (`showFloatingButton`, 400ms polling, cue hacking, etc.)
- Manifest `imageUrl`, checksum, and dashboard update metadata for v1.1.0.0
- `EnableSSTUI` plugin setting now respected by the web client
- Client script/CSS cache headers set to `no-cache` so updates apply immediately

## [1.0.10] - 2026-08-17

### Added
- Hooked into `main.jellyfin.bundle.js` and `runtime.bundle.js` via FileTransformation for guaranteed universal script execution on all web clients.

## [1.0.9] - 2026-08-17

### Fixed
- Fixed button injection by directly matching the `closed_caption` icon button in the video controls without relying on specific container class names.

## [1.0.8] - 2026-08-17

### Fixed
- Fixed button placement: strictly scoped to video player OSD right next to the CC button; eliminated sidebar drawer placement.

## [1.0.7] - 2026-08-17

### Fixed
- Fixed `FileTransformation` reflection registration payload structure and assembly resolution for automatic zero-config client script injection across all devices (browsers, phones, TVs).

## [1.0.6] - 2026-08-17

### Added
- Integrated the 🪐 SST button directly inside the video player progress bar and control bar row next to Subtitles/Settings (fades & slides down with the progress bar).
- Full TV remote D-Pad navigation and focus styling for LG Smart TV (webOS), Samsung (Tizen), Google TV, EON TV, and Amazon Fire Stick.

## [1.0.5] - 2026-08-17

### Added
- Instant subtitle stream activation: automatically queries updated item `MediaStreams` and switches active player track via `playbackManager` + dynamic HTML5 `<track>` element.

## [1.0.4] - 2026-08-17

### Added
- Auto-inject CSS stylesheet if not present in the DOM.
- Added global `window.SST.show()` and `window.SST.close()` functions for manual trigger.
- Added Sessions API auto-discovery to detect playing media even when player context is hidden.
- Inline CSS fallbacks so dialogs and floating buttons are styled even without stylesheet.

## [1.0.3] - 2026-08-17

### Added
- Added `Alt + S` global keyboard shortcut to open SST Subtitle Search anytime video is playing.
- Added multi-ALC assembly discovery for `Jellyfin.Plugin.FileTransformation` across isolated plugin load contexts.
- Added dual injection hooks into both `index.html` and `main.jellyfin.bundle.js`.

## [1.0.2] - 2026-08-17

### Added
- Direct integration with `Jellyfin.Plugin.FileTransformation` for in-memory script and stylesheet injection into web clients without modifying files on disk.

## [1.0.1] - 2026-08-17

### Fixed
- Fixed unhandled `UnauthorizedAccessException` when injecting scripts on Windows installations without administrative access to `C:\Program Files\Jellyfin\Server\jellyfin-web\index.html`.
- Made script injection non-fatal and non-blocking during server startup.

## [1.0.0] - 2026-08-17

### Added
- In-player subtitle search UI with language selector
- Search results display with rich metadata:
  - Release name, provider, format, FPS, download count, rating, uploader
  - Badges: Hash Match, SDH, Forced, Machine Translated, AI Translated
- One-click subtitle downloading via Jellyfin's REST API
- Fine-grained subtitle offset controls (±0.1s, ±0.5s)
- Floating access button during video playback
- Automatic integration with Jellyfin's subtitle/CC menu
- Admin configuration page
- Responsive design for desktop, mobile, and TV
- Automatic web client script injection
- Manual injection fallback for Docker/read-only setups
- Comprehensive error handling with user-friendly messages
- 30+ languages in the language selector
