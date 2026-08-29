using Jellyfin.Plugin.SST.Services;
using Jellyfin.Plugin.SST.Web;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.SST;

/// <summary>
/// Registers SST services with Jellyfin's dependency injection container.
/// Script injection is request middleware only. Do not register File Transformation,
/// AssemblyLoad hooks, or hosted services that write jellyfin-web files — those can
/// take Kestrel down.
///
/// The automatic-download hosted service only subscribes to playback events and stays
/// inert until an administrator enables it in the plugin configuration.
/// </summary>
public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    /// <inheritdoc />
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddSingleton<IStartupFilter, SstStartupFilter>();
        serviceCollection.AddHostedService<SubtitleAutoDownloadService>();
    }
}
