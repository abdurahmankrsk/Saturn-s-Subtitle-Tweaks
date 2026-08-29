using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.SST.Configuration;

/// <summary>
/// SST plugin configuration.
/// SST does not store any subtitle provider credentials.
/// Provider credentials are managed by each subtitle provider plugin (e.g., OpenSubtitles).
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>
    /// Gets or sets a value indicating whether the SST UI is enabled.
    /// </summary>
    public bool EnableSSTUI { get; set; } = true;

    /// <summary>
    /// Gets or sets the default subtitle language (ISO 639-2 three-letter code).
    /// Empty string means use the user's Jellyfin language preference.
    /// </summary>
    public string DefaultLanguage { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets a value indicating whether the web client shows a banner
    /// when another device (TV, console) is playing something SST can control remotely.
    /// </summary>
    public bool EnableRemoteBanner { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether a Subtitles button is added to the
    /// item detail page. Off by default; the banner covers the common case.
    /// </summary>
    public bool EnableDetailButton { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether SST retargets its dialog at the cast
    /// device when the user has cast playback to another client.
    /// </summary>
    public bool EnableCastTargeting { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether the server downloads a subtitle
    /// automatically when playback starts without one in the preferred language.
    /// Off by default: this runs unattended on the server and calls out to providers.
    /// </summary>
    public bool EnableAutoDownload { get; set; }

    /// <summary>
    /// Gets or sets the comma-separated ISO 639-2 language codes that automatic
    /// download will try, in order. Empty falls back to <see cref="DefaultLanguage"/>.
    /// </summary>
    public string AutoDownloadLanguages { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets a value indicating whether automatic download only runs when the
    /// item has no subtitle track at all, rather than none in the preferred language.
    /// </summary>
    public bool AutoDownloadOnlyWhenNoSubtitles { get; set; } = true;

    /// <summary>
    /// Gets or sets the per-item timeout in seconds for one automatic download attempt.
    /// </summary>
    public int AutoDownloadTimeoutSeconds { get; set; } = 30;
}
