using System;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;

namespace Jellyfin.Plugin.SST.Web;

/// <summary>
/// Adds SST HTML injection to the ASP.NET pipeline using the supported IStartupFilter
/// hook instead of Harmony / File Transformation / disk writes.
/// </summary>
public sealed class SstStartupFilter : IStartupFilter
{
    /// <inheritdoc />
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
    {
        return app =>
        {
            app.UseMiddleware<SstHtmlInjectorMiddleware>();
            next(app);
        };
    }
}
