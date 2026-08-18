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
        // Delayed, non-destructive web-script registration. Must not throw.
        serviceCollection.AddHostedService<ScriptInjector>();
    }
}
