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
}
