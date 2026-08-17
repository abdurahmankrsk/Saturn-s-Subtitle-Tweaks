using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SST;

/// <summary>
/// Handles injecting the SST script tag into jellyfin-web's index.html.
/// This follows the established pattern used by community plugins like Jellyscrub
/// and Intro Skipper for injecting client-side scripts.
///
/// The injection adds a single script tag that loads SST's JS module.
/// It is safe to run multiple times (idempotent) and can be reversed cleanly.
///
/// Implemented as IHostedService. It gracefully catches any filesystem access
/// errors (e.g. read-only filesystem or permissions) so it never causes server startup failure.
/// </summary>
public sealed partial class ScriptInjector : IHostedService, IDisposable
{
    private readonly ILogger<ScriptInjector> _logger;
    private readonly IApplicationPaths _appPaths;

    private const string ScriptTag = "<script src=\"/sst/ClientScript\" defer></script>";
    private const string StyleTag = "<link rel=\"stylesheet\" href=\"/sst/ClientStyle\" />";
    private const string InjectionMarker = "<!-- SST -->";

    /// <summary>
    /// Initializes a new instance of the <see cref="ScriptInjector"/> class.
    /// </summary>
    /// <param name="logger">Instance of the <see cref="ILogger{ScriptInjector}"/> interface.</param>
    /// <param name="appPaths">Instance of the <see cref="IApplicationPaths"/> interface.</param>
    public ScriptInjector(
        ILogger<ScriptInjector> logger,
        IApplicationPaths appPaths)
    {
        _logger = logger;
        _appPaths = appPaths;
    }

    /// <inheritdoc />
    public Task StartAsync(CancellationToken cancellationToken)
    {
#pragma warning disable CA1031 // Do not catch general exception types - HostedService must never crash server startup
        try
        {
            InjectScript();
        }
        catch (Exception ex)
        {
            LogInjectionFailed(_logger, ScriptTag, ex);
        }
#pragma warning restore CA1031

        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken)
    {
#pragma warning disable CA1031 // Do not catch general exception types
        try
        {
            RemoveScript();
        }
        catch (Exception ex)
        {
            LogRemovalFailed(_logger, ex);
        }
#pragma warning restore CA1031

        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public void Dispose()
    {
        // No unmanaged resources to dispose.
    }

    private void InjectScript()
    {
        var indexPath = FindIndexHtml();
        if (indexPath is null)
        {
            LogIndexNotFound(_logger, ScriptTag);
            return;
        }

        var html = File.ReadAllText(indexPath, Encoding.UTF8);

        if (html.Contains(InjectionMarker, StringComparison.Ordinal))
        {
            LogAlreadyInjected(_logger);
            return;
        }

        // Inject before </head>
        var headClose = html.LastIndexOf("</head>", StringComparison.OrdinalIgnoreCase);
        if (headClose < 0)
        {
            LogHeadNotFound(_logger);
            return;
        }

        var injection = $"\n    {InjectionMarker}\n    {StyleTag}\n    {ScriptTag}\n    ";
        html = html.Insert(headClose, injection);

        File.WriteAllText(indexPath, html, Encoding.UTF8);
        LogInjectionSuccess(_logger, indexPath);
    }

    private void RemoveScript()
    {
        var indexPath = FindIndexHtml();
        if (indexPath is null)
        {
            return;
        }

        var html = File.ReadAllText(indexPath, Encoding.UTF8);

        if (!html.Contains(InjectionMarker, StringComparison.Ordinal))
        {
            return;
        }

        // Remove the entire injection block
        var lines = html.Split('\n').ToList();
        var markerIndex = lines.FindIndex(l => l.Contains(InjectionMarker, StringComparison.Ordinal));
        if (markerIndex >= 0)
        {
            var removeCount = 0;
            for (var i = markerIndex; i < lines.Count && removeCount < 4; i++)
            {
                var line = lines[i].Trim();
                if (line.Contains("SST", StringComparison.Ordinal) ||
                    line.Contains("/sst/Client", StringComparison.Ordinal) ||
                    string.IsNullOrWhiteSpace(line))
                {
                    removeCount++;
                }
                else
                {
                    break;
                }
            }

            lines.RemoveRange(markerIndex, removeCount);
            File.WriteAllText(indexPath, string.Join('\n', lines), Encoding.UTF8);
            LogRemovalSuccess(_logger, indexPath);
        }
    }

    private string? FindIndexHtml()
    {
        var webPath = _appPaths.WebPath;
        if (!string.IsNullOrEmpty(webPath))
        {
            var indexPath = Path.Combine(webPath, "index.html");
            if (File.Exists(indexPath))
            {
                return indexPath;
            }
        }

        return null;
    }

    // ═══════════════════════════════════════════════════════════════
    // LoggerMessage delegates for high-performance structured logging
    // ═══════════════════════════════════════════════════════════════

    [LoggerMessage(Level = LogLevel.Warning, Message = "SST: Could not auto-inject client script into index.html due to file permissions. The server will start normally. For web client UI, you can add to jellyfin-web index.html or use custom CSS/JS: {ScriptTag}")]
    private static partial void LogInjectionFailed(ILogger logger, string scriptTag, Exception ex);

    [LoggerMessage(Level = LogLevel.Debug, Message = "SST: Failed to remove client script injection on shutdown")]
    private static partial void LogRemovalFailed(ILogger logger, Exception ex);

    [LoggerMessage(Level = LogLevel.Warning, Message = "SST: Could not find jellyfin-web index.html. The SST UI will not be available in the web client. You can manually add the following script tag to your index.html: {ScriptTag}")]
    private static partial void LogIndexNotFound(ILogger logger, string scriptTag);

    [LoggerMessage(Level = LogLevel.Debug, Message = "SST: Script injection already present in index.html")]
    private static partial void LogAlreadyInjected(ILogger logger);

    [LoggerMessage(Level = LogLevel.Warning, Message = "SST: Could not find </head> tag in index.html")]
    private static partial void LogHeadNotFound(ILogger logger);

    [LoggerMessage(Level = LogLevel.Information, Message = "SST: Successfully injected client script into {IndexPath}")]
    private static partial void LogInjectionSuccess(ILogger logger, string indexPath);

    [LoggerMessage(Level = LogLevel.Information, Message = "SST: Removed client script injection from {IndexPath}")]
    private static partial void LogRemovalSuccess(ILogger logger, string indexPath);
}
