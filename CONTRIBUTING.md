# Contributing to Saturn's Subtitle Tweaks (SST)

Thank you for your interest in contributing!

## Getting Started

1. Fork the repository
2. Clone your fork
3. Install the [.NET 9.0 SDK](https://dotnet.microsoft.com/download)
4. Build: `dotnet build`
5. Copy the DLL to your Jellyfin plugins directory for testing

## Guidelines

### Code
- Follow the existing code style
- Add XML documentation comments to public C# members
- Comment non-obvious JavaScript logic
- No hardcoded credentials or API keys — ever

### Security
- **Never** commit API keys, passwords, tokens, or personal credentials
- SST must remain credential-free
- All subtitle operations must go through Jellyfin's API
- Provider credentials must stay server-side

### Pull Requests
- Keep changes focused and logical
- Write clear commit messages
- Test your changes with a Jellyfin 10.11.x instance
- Update documentation if needed

### Reporting Issues
- Include your Jellyfin version
- Include your browser/client
- Include any error messages from the browser console
- Include steps to reproduce

## Architecture

SST is a two-component system:

1. **Server Plugin** (C#/.NET): Serves the web assets and handles script injection
2. **Web Module** (JavaScript): Provides the in-player UI

SST does **not** implement its own subtitle provider. It calls Jellyfin's existing subtitle API, which delegates to whatever providers the admin has installed.

## Testing

- Test with at least one subtitle provider (e.g., OpenSubtitles) installed
- Test search for both movies and TV episodes
- Test with multiple languages
- Test the "no provider configured" error state
- Test on mobile viewport sizes
- Verify no credentials appear in browser DevTools

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
