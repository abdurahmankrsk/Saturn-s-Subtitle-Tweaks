using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Jellyfin.Plugin.SST.Web;

namespace Jellyfin.Plugin.SST;

/// <summary>
/// Registers SST services with Jellyfin's dependency injection container.
/// </summary>
public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    /// <inheritdoc />
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddTransient<IStartupFilter, SstStartupFilter>();
        serviceCollection.AddHostedService<ScriptInjector>();
    }
}
