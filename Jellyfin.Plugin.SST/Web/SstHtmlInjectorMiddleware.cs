using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using MediaBrowser.Common.Configuration;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SST.Web;

/// <summary>
/// Serves SST assets and a patched jellyfin-web index.html.
/// Does not wrap Response.Body. Only runs for the GET paths selected by
/// <see cref="SstStartupFilter"/>.
/// </summary>
public sealed partial class SstHtmlInjectorMiddleware
{
    private static readonly object CacheLock = new();
    private static string? CachedHtml;
    private static string? CachedKey;

    private readonly RequestDelegate _next;
    private readonly ILogger<SstHtmlInjectorMiddleware> _logger;
    private readonly IApplicationPaths _appPaths;

    /// <summary>
    /// Initializes a new instance of the <see cref="SstHtmlInjectorMiddleware"/> class.
    /// </summary>
    /// <param name="next">Next middleware.</param>
    /// <param name="logger">Logger.</param>
    /// <param name="appPaths">Jellyfin application paths.</param>
    public SstHtmlInjectorMiddleware(
        RequestDelegate next,
        ILogger<SstHtmlInjectorMiddleware> logger,
        IApplicationPaths appPaths)
    {
        _next = next;
        _logger = logger;
        _appPaths = appPaths;
    }

    /// <summary>
    /// Invokes the middleware.
    /// </summary>
    /// <param name="context">HTTP context.</param>
    /// <returns>A <see cref="Task"/> representing the asynchronous operation.</returns>
    public async Task InvokeAsync(HttpContext context)
    {
        ArgumentNullException.ThrowIfNull(context);

        var handled = false;
#pragma warning disable CA1031
        try
        {
            if (IsAssetRequest(context.Request.Path, out var assetType))
            {
                await WriteAssetAsync(context, assetType).ConfigureAwait(false);
                handled = true;
            }
            else if (IsIndexRequest(context.Request))
            {
                handled = await TryServeInjectedIndexAsync(context).ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            LogMiddlewareFailed(_logger, ex);
        }
#pragma warning restore CA1031

        if (handled || context.Response.HasStarted)
        {
            return;
        }

        await _next(context).ConfigureAwait(false);
    }

    private static bool IsAssetRequest(PathString path, out string assetType)
    {
        var value = path.Value ?? string.Empty;
        if (value.Equals("/web/sst.js", StringComparison.OrdinalIgnoreCase))
        {
            assetType = "js";
            return true;
        }

        if (value.Equals("/web/sst.css", StringComparison.OrdinalIgnoreCase))
        {
            assetType = "css";
            return true;
        }

        assetType = string.Empty;
        return false;
    }

    private static bool IsIndexRequest(HttpRequest request)
    {
        if (!HttpMethods.IsGet(request.Method))
        {
            return false;
        }

        var path = request.Path.Value ?? string.Empty;
        return path.Equals("/web", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/web/", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/web/index.html", StringComparison.OrdinalIgnoreCase);
    }

    private static async Task WriteAssetAsync(HttpContext context, string assetType)
    {
        var resource = assetType == "css"
            ? "Jellyfin.Plugin.SST.Web.sst.css"
            : "Jellyfin.Plugin.SST.Web.sst.js";
        var contentType = assetType == "css" ? "text/css" : "application/javascript";

        var stream = typeof(SstHtmlInjectorMiddleware).Assembly.GetManifestResourceStream(resource);
        if (stream is null)
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        await using (stream.ConfigureAwait(false))
        {
            context.Response.StatusCode = StatusCodes.Status200OK;
            context.Response.ContentType = contentType;
            context.Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
            await stream.CopyToAsync(context.Response.Body, context.RequestAborted).ConfigureAwait(false);
        }
    }

    private async Task<bool> TryServeInjectedIndexAsync(HttpContext context)
    {
        if (!TryBuildInjectedHtml(context, out var html) || string.IsNullOrEmpty(html))
        {
            return false;
        }

        context.Response.StatusCode = StatusCodes.Status200OK;
        context.Response.ContentType = "text/html; charset=utf-8";
        context.Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
        await context.Response.WriteAsync(html, context.RequestAborted).ConfigureAwait(false);
        return true;
    }

    private bool TryBuildInjectedHtml(HttpContext context, out string html)
    {
        html = string.Empty;
        var webPath = _appPaths.WebPath;
        if (string.IsNullOrEmpty(webPath))
        {
            return false;
        }

        var indexPath = Path.Combine(webPath, "index.html");
        if (!File.Exists(indexPath))
        {
            return false;
        }

        var prefix = context.Request.PathBase.HasValue
            ? context.Request.PathBase.Value!.TrimEnd('/')
            : string.Empty;
        var info = new FileInfo(indexPath);
        var cacheKey = prefix + "|" + info.Length.ToString(System.Globalization.CultureInfo.InvariantCulture) + "|" + info.LastWriteTimeUtc.Ticks.ToString(System.Globalization.CultureInfo.InvariantCulture);

        lock (CacheLock)
        {
            if (CachedHtml is not null && CachedKey == cacheKey)
            {
                html = CachedHtml;
                return true;
            }
        }

        var source = File.ReadAllText(indexPath, Encoding.UTF8);
        if (source.IndexOf("</head>", StringComparison.OrdinalIgnoreCase) < 0)
        {
            return false;
        }

        if (!source.Contains("id=\"sst-script\"", StringComparison.Ordinal)
            && !source.Contains("/web/sst.js", StringComparison.Ordinal))
        {
            var injection =
                $"\n    <!-- SST -->\n" +
                $"    <link rel=\"stylesheet\" href=\"{prefix}/web/sst.css\" id=\"sst-client-style\" />\n" +
                $"    <script src=\"{prefix}/web/sst.js\" id=\"sst-script\" defer></script>\n    ";
            var head = source.LastIndexOf("</head>", StringComparison.OrdinalIgnoreCase);
            source = source.Insert(head, injection);
            LogIndexInjected(_logger);
        }

        lock (CacheLock)
        {
            CachedHtml = source;
            CachedKey = cacheKey;
        }

        html = source;
        return true;
    }

    [LoggerMessage(Level = LogLevel.Debug, Message = "SST: Served jellyfin-web index.html with SST client script")]
    private static partial void LogIndexInjected(ILogger logger);

    [LoggerMessage(Level = LogLevel.Debug, Message = "SST: HTML injector middleware failed; request continues normally")]
    private static partial void LogMiddlewareFailed(ILogger logger, Exception ex);
}
