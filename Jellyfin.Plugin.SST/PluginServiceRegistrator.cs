using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Jellyfin.Plugin.SST.Web;

namespace Jellyfin.Plugin.SST;

/// <summary>
/// Registers SST services with Jellyfin's dependency injection container.
/// Script injection is request middleware only. Do not register File Transformation,
/// AssemblyLoad hooks, or hosted services that write jellyfin-web files — those can
/// take Kestrel down.
/// </summary>
public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    /// <inheritdoc />
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddSingleton<IStartupFilter, SstStartupFilter>();
    }
}
