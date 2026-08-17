using System;
using System.Collections.Generic;
using Jellyfin.Plugin.SST.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.SST;

/// <summary>
/// Saturn's Subtitle Tweaks (SST) plugin for Jellyfin.
/// Provides an enhanced in-player subtitle search, download, and timing experience.
///
/// SST does NOT implement its own subtitle provider.
/// It uses Jellyfin's existing subtitle provider infrastructure
/// (e.g., OpenSubtitles plugin) via the standard REST API.
///
/// SST contains NO subtitle provider credentials.
/// </summary>
public class SSTPlugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    /// <summary>
    /// Initializes a new instance of the <see cref="SSTPlugin"/> class.
    /// </summary>
    /// <param name="applicationPaths">Instance of the <see cref="IApplicationPaths"/> interface.</param>
    /// <param name="xmlSerializer">Instance of the <see cref="IXmlSerializer"/> interface.</param>
    public SSTPlugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    /// <inheritdoc />
    public override string Name => "Saturn's Subtitle Tweaks";

    /// <inheritdoc />
    public override Guid Id => Guid.Parse("b3a1c2d4-e5f6-4a89-9bcd-1234567890ab");

    /// <inheritdoc />
    public override string Description =>
        "Enhanced in-player subtitle search, download, and timing controls. " +
        "Requires a subtitle provider (e.g., OpenSubtitles plugin) to be installed and configured by the server administrator.";

    /// <summary>
    /// Gets the plugin instance.
    /// </summary>
    public static SSTPlugin? Instance { get; private set; }

    /// <inheritdoc />
    public IEnumerable<PluginPageInfo> GetPages()
    {
        return new[]
        {
            new PluginPageInfo
            {
                Name = "sst-config",
                EmbeddedResourcePath = GetType().Namespace + ".Web.configPage.html",
            },
            new PluginPageInfo
            {
                Name = "sst-config-js",
                EmbeddedResourcePath = GetType().Namespace + ".Web.configPage.js"
            },
            new PluginPageInfo
            {
                Name = "sstjs",
                EmbeddedResourcePath = GetType().Namespace + ".Web.sst.js"
            },
            new PluginPageInfo
            {
                Name = "sstcss",
                EmbeddedResourcePath = GetType().Namespace + ".Web.sst.css"
            }
        };
    }
}
