# Changelog

All notable changes to Saturn's Subtitle Tweaks (SST) will be documented in this file.

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
