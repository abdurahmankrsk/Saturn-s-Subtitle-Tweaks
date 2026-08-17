using System;
using System.IO;
using System.Linq;
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
/// Handles injecting the SST script tag into jellyfin-web's index.html and main.jellyfin.bundle.js.
/// Integrates with the FileTransformation plugin via reflection across all AssemblyLoadContexts
/// so that scripts and styles are automatically loaded on every client (browser, mobile, TV)
/// without modifying files on disk.
/// </summary>
public sealed partial class ScriptInjector : IHostedService, IDisposable
{
    private readonly ILogger<ScriptInjector> _logger;
    private readonly IApplicationPaths _appPaths;
    private bool _fileTransformationRegistered;

    private const string ScriptTag = "<script src=\"/sst/ClientScript\" defer></script>";
    private const string StyleTag = "<link rel=\"stylesheet\" href=\"/sst/ClientStyle\" />";
    private const string InjectionMarker = "<!-- SST -->";
    private const string JsLoaderMarker = "/* SST-LOADER */";

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
#pragma warning disable CA1031 // Do not catch general exception types
        try
        {
            AppDomain.CurrentDomain.AssemblyLoad += OnAssemblyLoad;
            RegisterWithFileTransformation();
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
#pragma warning disable CA1031
        try
        {
            AppDomain.CurrentDomain.AssemblyLoad -= OnAssemblyLoad;
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
        AppDomain.CurrentDomain.AssemblyLoad -= OnAssemblyLoad;
    }

    private void OnAssemblyLoad(object? sender, AssemblyLoadEventArgs args)
    {
        if (!_fileTransformationRegistered &&
            args.LoadedAssembly.GetName().Name?.Contains("FileTransformation", StringComparison.OrdinalIgnoreCase) == true)
        {
            RegisterWithFileTransformation();
        }
    }

    /// <summary>
    /// Callback invoked by the FileTransformation plugin when web assets are served.
    /// </summary>
    /// <param name="payload">The payload object (or string) passed by FileTransformation.</param>
    /// <returns>The transformed payload object or string.</returns>
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
                return InjectContent(str);
            }

            var type = payload.GetType();
            var prop = type.GetProperty("contents");
            if (prop != null)
            {
                var content = prop.GetValue(payload)?.ToString() ?? string.Empty;
                var modified = InjectContent(content);
                prop.SetValue(payload, modified);
                return payload;
            }
        }
        catch
        {
            // Fallback gracefully
        }
#pragma warning restore CA1031

        return payload;
    }

    private static string InjectContent(string content)
    {
        // Handle HTML files (index.html)
        if (content.Contains("</head>", StringComparison.OrdinalIgnoreCase))
        {
            if (!content.Contains(InjectionMarker, StringComparison.Ordinal))
            {
                var headClose = content.LastIndexOf("</head>", StringComparison.OrdinalIgnoreCase);
                if (headClose >= 0)
                {
                    var injection = $"\n    {InjectionMarker}\n    {StyleTag}\n    {ScriptTag}\n    ";
                    return content.Insert(headClose, injection);
                }
            }
            return content;
        }

        // Handle JS bundle entry files served to the web client
        if (content.Contains(JsLoaderMarker, StringComparison.Ordinal)
            || !LooksLikeJavaScriptBundle(content))
        {
            return content;
        }

        var jsLoader = "\n" + JsLoaderMarker + "\n" +
            ";(function(){try{if(document.getElementById('sst-script'))return;" +
            "var b=document.querySelector('base');var r=b&&b.href?b.href:'';" +
            "if(r.endsWith('/'))r=r.slice(0,-1);" +
            "var s=document.createElement('script');s.id='sst-script';s.src=r+'/sst/ClientScript';s.async=true;" +
            "document.head.appendChild(s);" +
            "if(!document.getElementById('sst-client-style')){" +
            "var l=document.createElement('link');l.id='sst-client-style';l.rel='stylesheet';l.href=r+'/sst/ClientStyle';document.head.appendChild(l);}" +
            "}catch(e){console.debug('[SST] loader failed',e);}})();\n";
        return content + jsLoader;
    }

    private void RegisterWithFileTransformation()
    {
#pragma warning disable CA1031
        try
        {
            var assemblies = AssemblyLoadContext.All
                .SelectMany(alc => alc.Assemblies)
                .Concat(AppDomain.CurrentDomain.GetAssemblies())
                .Distinct();

            var ftAssembly = assemblies.FirstOrDefault(a =>
                a.GetName().Name?.Equals("Jellyfin.Plugin.FileTransformation", StringComparison.OrdinalIgnoreCase) == true);

            if (ftAssembly is not null)
            {
                var pluginInterfaceType = ftAssembly.GetType("Jellyfin.Plugin.FileTransformation.PluginInterface");
                if (pluginInterfaceType is not null)
                {
                    var registerMethod = pluginInterfaceType.GetMethod("RegisterTransformation", BindingFlags.Public | BindingFlags.Static);
                    if (registerMethod is not null)
                    {
                        // 1. Register for index.html
                        var payloadHtml = new
                        {
                            id = Guid.Parse("b3a1c2d4-e5f6-4a89-9bcd-1234567890ab"),
                            fileNamePattern = ".*index\\.html.*",
                            callbackAssembly = typeof(ScriptInjector).Assembly.FullName,
                            callbackClass = typeof(ScriptInjector).FullName,
                            callbackMethod = nameof(TransformFile)
                        };
                        registerMethod.Invoke(null, new object?[] { payloadHtml });

                        // 2. Register for webpack entry bundles (versioned filenames in 10.11.x)
                        var payloadBundle = new
                        {
                            id = Guid.Parse("c4b2d3e5-f6a7-4b90-8cde-2345678901bc"),
                            fileNamePattern = ".*main\\..*\\.bundle\\.js.*",
                            callbackAssembly = typeof(ScriptInjector).Assembly.FullName,
                            callbackClass = typeof(ScriptInjector).FullName,
                            callbackMethod = nameof(TransformFile)
                        };
                        registerMethod.Invoke(null, new object?[] { payloadBundle });

                        // 3. Register for webpack runtime bundles
                        var payloadRuntime = new
                        {
                            id = Guid.Parse("d5c3e4f6-a7b8-4c91-9def-3456789012cd"),
                            fileNamePattern = ".*runtime\\..*\\.bundle\\.js.*",
                            callbackAssembly = typeof(ScriptInjector).Assembly.FullName,
                            callbackClass = typeof(ScriptInjector).FullName,
                            callbackMethod = nameof(TransformFile)
                        };
                        registerMethod.Invoke(null, new object?[] { payloadRuntime });

                        _fileTransformationRegistered = true;
                        LogFileTransformationSuccess(_logger);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            LogFileTransformationFailed(_logger, ex);
        }
#pragma warning restore CA1031
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

    private static bool LooksLikeJavaScriptBundle(string content)
    {
        // Avoid appending the loader to non-JS payloads that slip through FileTransformation.
        return content.Contains("webpack", StringComparison.Ordinal)
            || content.Contains("__webpack_require__", StringComparison.Ordinal)
            || content.Contains("sourceMappingURL=", StringComparison.Ordinal);
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

    [LoggerMessage(Level = LogLevel.Information, Message = "SST: Successfully registered transformation with FileTransformation plugin")]
    private static partial void LogFileTransformationSuccess(ILogger logger);

    [LoggerMessage(Level = LogLevel.Debug, Message = "SST: FileTransformation reflection registration skipped or failed")]
    private static partial void LogFileTransformationFailed(ILogger logger, Exception ex);
}
