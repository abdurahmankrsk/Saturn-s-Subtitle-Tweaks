# Changelog

All notable changes to Saturn's Subtitle Tweaks (SST) will be documented in this file.

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
