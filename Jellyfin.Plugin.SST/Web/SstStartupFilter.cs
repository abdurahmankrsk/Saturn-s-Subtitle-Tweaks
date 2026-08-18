using System;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;

namespace Jellyfin.Plugin.SST.Web;

/// <summary>
/// Adds SST HTML injection only for GET /web index and SST assets.
/// API, sessions, and Google TV clients never enter this branch.
/// </summary>
public sealed class SstStartupFilter : IStartupFilter
{
    /// <inheritdoc />
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
    {
        ArgumentNullException.ThrowIfNull(next);

        return app =>
        {
#pragma warning disable CA1031
            try
            {
                app.UseWhen(IsSstWebRequest, branch =>
                {
                    branch.UseMiddleware<SstHtmlInjectorMiddleware>();
                });
            }
            catch
            {
                // Never block Jellyfin from starting if SST cannot hook the pipeline.
            }
#pragma warning restore CA1031

            next(app);
        };
    }

    private static bool IsSstWebRequest(HttpContext context)
    {
        if (context?.Request is null || !HttpMethods.IsGet(context.Request.Method))
        {
            return false;
        }

        var path = context.Request.Path.Value ?? string.Empty;
        return path.Equals("/web", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/web/", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/web/index.html", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/web/sst.js", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/web/sst.css", StringComparison.OrdinalIgnoreCase);
    }
}
