using System;
using System.IO;
using System.Reflection;
using System.Runtime.Loader;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SST;

/// <summary>
/// Optionally registers a File Transformation hook for jellyfin-web index.html
/// AFTER the server has finished starting. This must never throw and must never
/// touch files on disk — writing index.html or hooking AssemblyLoad has crashed
/// Jellyfin on Windows and when File Transformation is installed.
/// </summary>
public sealed partial class ScriptInjector : IHostedService
{
    private readonly ILogger<ScriptInjector> _logger;
    private readonly IApplicationPaths _appPaths;
    private CancellationTokenSource? _cts;

    private const string ScriptTag = "<script src=\"/sst/ClientScript\" defer></script>";
    private const string StyleTag = "<link rel=\"stylesheet\" href=\"/sst/ClientStyle\" />";
    private const string InjectionMarker = "<!-- SST -->";

    /// <summary>
    /// Initializes a new instance of the <see cref="ScriptInjector"/> class.
    /// </summary>
    /// <param name="logger">Logger.</param>
    /// <param name="appPaths">Jellyfin application paths.</param>
    public ScriptInjector(ILogger<ScriptInjector> logger, IApplicationPaths appPaths)
    {
        _logger = logger;
        _appPaths = appPaths;
    }

    /// <inheritdoc />
    public Task StartAsync(CancellationToken cancellationToken)
    {
        _cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        _ = RegisterAfterStartupAsync(_cts.Token);
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public async Task StopAsync(CancellationToken cancellationToken)
    {
        try
        {
            if (_cts is not null)
            {
                await _cts.CancelAsync().ConfigureAwait(false);
                _cts.Dispose();
                _cts = null;
            }
        }
        catch (ObjectDisposedException)
        {
        }
    }

    /// <summary>
    /// Callback invoked by the File Transformation plugin when index.html is served.
    /// Must never throw.
    /// </summary>
    /// <param name="payload">File Transformation payload.</param>
    /// <returns>The original or transformed payload.</returns>
    public static object? TransformFile(object? payload)
    {
        if (payload is null)
        {
            return null;
        }

#pragma warning disable CA1031
        try
        {
            if (payload is string str)
            {
                return InjectIntoHtml(str);
            }

            var type = payload.GetType();
            var prop = type.GetProperty("contents")
                ?? type.GetProperty("Contents");
            if (prop is null)
            {
                return payload;
            }

            var content = prop.GetValue(payload) as string;
            if (string.IsNullOrEmpty(content))
            {
                return payload;
            }

            var modified = InjectIntoHtml(content);
            if (!ReferenceEquals(modified, content) && modified != content)
            {
                prop.SetValue(payload, modified);
            }

            return payload;
        }
        catch
        {
            return payload;
        }
#pragma warning restore CA1031
    }

    private static string InjectIntoHtml(string content)
    {
        if (!content.Contains("</head>", StringComparison.OrdinalIgnoreCase)
            || content.Contains(InjectionMarker, StringComparison.Ordinal))
        {
            return content;
        }

        var headClose = content.LastIndexOf("</head>", StringComparison.OrdinalIgnoreCase);
        if (headClose < 0)
        {
            return content;
        }

        var injection = $"\n    {InjectionMarker}\n    {StyleTag}\n    {ScriptTag}\n    ";
        return content.Insert(headClose, injection);
    }

    private async Task RegisterAfterStartupAsync(CancellationToken cancellationToken)
    {
#pragma warning disable CA1031
        try
        {
            // File Transformation Harmony-patches Kestrel startup. Registering
            // during IHostedService.StartAsync can take the whole server down.
            await Task.Delay(TimeSpan.FromSeconds(8), cancellationToken).ConfigureAwait(false);
            var registered = TryRegisterFileTransformation();
            if (!registered)
            {
                TryInjectIndexHtmlSafely();
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception ex)
        {
            LogFileTransformationFailed(_logger, ex);
        }
#pragma warning restore CA1031
    }

    private bool TryRegisterFileTransformation()
    {
#pragma warning disable CA1031
        try
        {
            Assembly? ftAssembly = null;
            foreach (var alc in AssemblyLoadContext.All)
            {
                foreach (var assembly in alc.Assemblies)
                {
                    if (string.Equals(
                            assembly.GetName().Name,
                            "Jellyfin.Plugin.FileTransformation",
                            StringComparison.OrdinalIgnoreCase))
                    {
                        ftAssembly = assembly;
                        break;
                    }
                }

                if (ftAssembly is not null)
                {
                    break;
                }
            }

            if (ftAssembly is null)
            {
                LogFileTransformationUnavailable(_logger, ScriptTag);
                return false;
            }

            var pluginInterfaceType = ftAssembly.GetType("Jellyfin.Plugin.FileTransformation.PluginInterface");
            var registerMethod = pluginInterfaceType?.GetMethod("RegisterTransformation", BindingFlags.Public | BindingFlags.Static);
            if (registerMethod is null)
            {
                LogFileTransformationUnavailable(_logger, ScriptTag);
                return false;
            }

            var payload = new
            {
                id = Guid.Parse("e7f1a2b3-c4d5-4e6f-8a90-1234567890ab"),
                fileNamePattern = "index\\.html$",
                callbackAssembly = typeof(ScriptInjector).Assembly.FullName,
                callbackClass = typeof(ScriptInjector).FullName,
                callbackMethod = nameof(TransformFile)
            };

            registerMethod.Invoke(null, new object?[] { payload });
            LogFileTransformationSuccess(_logger);
            return true;
        }
        catch (Exception ex)
        {
            LogFileTransformationFailed(_logger, ex);
            return false;
        }
#pragma warning restore CA1031
    }

    private void TryInjectIndexHtmlSafely()
    {
#pragma warning disable CA1031
        try
        {
            var webPath = _appPaths.WebPath;
            if (string.IsNullOrEmpty(webPath))
            {
                return;
            }

            var indexPath = Path.Combine(webPath, "index.html");
            if (!File.Exists(indexPath))
            {
                return;
            }

            var html = File.ReadAllText(indexPath, Encoding.UTF8);
            var injected = InjectIntoHtml(html);
            if (injected == html)
            {
                return;
            }

            File.WriteAllText(indexPath, injected, Encoding.UTF8);
            LogIndexInjected(_logger, indexPath);
        }
        catch (Exception ex)
        {
            LogIndexInjectSkipped(_logger, ex);
        }
#pragma warning restore CA1031
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "SST: Registered index.html transformation with File Transformation plugin")]
    private static partial void LogFileTransformationSuccess(ILogger logger);

    [LoggerMessage(Level = LogLevel.Debug, Message = "SST: File Transformation registration skipped or failed")]
    private static partial void LogFileTransformationFailed(ILogger logger, Exception ex);

    [LoggerMessage(Level = LogLevel.Information, Message = "SST: File Transformation plugin not found. Server will start normally. To enable in-player UI without it, add this to jellyfin-web index.html: {ScriptTag}")]
    private static partial void LogFileTransformationUnavailable(ILogger logger, string scriptTag);

    [LoggerMessage(Level = LogLevel.Information, Message = "SST: Injected client script into {IndexPath}")]
    private static partial void LogIndexInjected(ILogger logger, string indexPath);

    [LoggerMessage(Level = LogLevel.Warning, Message = "SST: Could not write jellyfin-web index.html (permissions or read-only install). Server will start normally.")]
    private static partial void LogIndexInjectSkipped(ILogger logger, Exception ex);
}
