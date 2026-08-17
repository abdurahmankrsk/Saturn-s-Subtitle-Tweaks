using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.SST;

/// <summary>
/// Registers SST services with Jellyfin's dependency injection container.
/// </summary>
public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    /// <inheritdoc />
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        // Register the script injector as a hosted service.
        // This runs on server startup and injects SST's script tag into jellyfin-web's index.html.
        serviceCollection.AddHostedService<ScriptInjector>();
    }
}
