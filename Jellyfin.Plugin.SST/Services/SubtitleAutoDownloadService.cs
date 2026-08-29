using System;
using System.Collections.Concurrent;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.SST.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Session;
using MediaBrowser.Controller.Subtitles;
using MediaBrowser.Model.Entities;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SST.Services;

/// <summary>
/// Downloads a subtitle when playback starts on a client that cannot show SST's
/// own picker (Android TV, Google TV, webOS, Tizen and friends).
///
/// The downloaded track is not pushed into the running session: the client fixed
/// its track list before the file existed, so it would ignore the change. The file
/// lands in the library and the client picks it up on its next play. Use the
/// remote picker when you want a subtitle applied to a video already on screen.
///
/// Safety rules, learned from earlier releases that took Kestrel down: the playback
/// handler never blocks, never throws, and does nothing at all unless an
/// administrator has explicitly enabled the feature.
/// </summary>
public sealed partial class SubtitleAutoDownloadService : IHostedService, IDisposable
{
    private const int RecentMemoryLimit = 256;

    private readonly IServiceProvider _services;
    private readonly ILogger<SubtitleAutoDownloadService> _logger;
    private readonly ConcurrentDictionary<Guid, byte> _inFlight = new();
    private readonly ConcurrentQueue<Guid> _recent = new();

    private ISessionManager? _sessionManager;

    /// <summary>
    /// Initializes a new instance of the <see cref="SubtitleAutoDownloadService"/> class.
    ///
    /// Takes only the service provider. A hosted service whose constructor cannot be
    /// satisfied brings the whole host down with it, and SST must never be the reason
    /// Jellyfin fails to start, so every other dependency is resolved lazily inside a
    /// try/catch.
    /// </summary>
    /// <param name="services">Service provider.</param>
    /// <param name="logger">Logger.</param>
    public SubtitleAutoDownloadService(
        IServiceProvider services,
        ILogger<SubtitleAutoDownloadService> logger)
    {
        _services = services;
        _logger = logger;
    }

    /// <inheritdoc />
    public Task StartAsync(CancellationToken cancellationToken)
    {
#pragma warning disable CA1031
        try
        {
            var sessionManager = _services.GetService(typeof(ISessionManager)) as ISessionManager;
            if (sessionManager is null)
            {
                LogSubscribeFailed(_logger, new InvalidOperationException("ISessionManager is not registered"));
                return Task.CompletedTask;
            }

            sessionManager.PlaybackStart += OnPlaybackStart;
            _sessionManager = sessionManager;
        }
        catch (Exception ex)
        {
            LogSubscribeFailed(_logger, ex);
        }
#pragma warning restore CA1031

        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken)
    {
        Unsubscribe();
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public void Dispose()
    {
        Unsubscribe();
        GC.SuppressFinalize(this);
    }

    private static string[] ResolveLanguages(PluginConfiguration config)
    {
        var configured = config.AutoDownloadLanguages;
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return configured
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Where(x => x.Length > 0)
                .ToArray();
        }

        if (!string.IsNullOrWhiteSpace(config.DefaultLanguage))
        {
            return new[] { config.DefaultLanguage.Trim() };
        }

        return new[] { "eng" };
    }

    private static bool AlreadySatisfied(Video video, PluginConfiguration config, string[] languages)
    {
        var subtitles = video.GetMediaStreams()
            .Where(s => s.Type == MediaStreamType.Subtitle)
            .ToArray();

        if (subtitles.Length == 0)
        {
            return false;
        }

        if (config.AutoDownloadOnlyWhenNoSubtitles)
        {
            return true;
        }

        return languages.Any(language => subtitles.Any(s =>
            string.Equals(s.Language, language, StringComparison.OrdinalIgnoreCase)));
    }

    private void Unsubscribe()
    {
#pragma warning disable CA1031
        try
        {
            if (_sessionManager is not null)
            {
                _sessionManager.PlaybackStart -= OnPlaybackStart;
                _sessionManager = null;
            }
        }
        catch (Exception ex)
        {
            LogUnsubscribeFailed(_logger, ex);
        }
#pragma warning restore CA1031
    }

    // Must return immediately. Everything real happens on a detached task.
    private void OnPlaybackStart(object? sender, PlaybackProgressEventArgs e)
    {
#pragma warning disable CA1031
        try
        {
            var config = SSTPlugin.Instance?.Configuration;
            if (config is null || !config.EnableAutoDownload)
            {
                return;
            }

            if (e?.Item is not Video video || video.Id.Equals(default))
            {
                return;
            }

            if (_recent.Contains(video.Id))
            {
                return;
            }

            if (!_inFlight.TryAdd(video.Id, 0))
            {
                return;
            }

            _ = Task.Run(() => RunSafelyAsync(video, config));
        }
        catch (Exception ex)
        {
            LogHandlerFailed(_logger, ex);
        }
#pragma warning restore CA1031
    }

    private void RememberHandled(Guid itemId)
    {
        _recent.Enqueue(itemId);
        while (_recent.Count > RecentMemoryLimit && _recent.TryDequeue(out _))
        {
            // Trim the ring so a long-running server does not grow this forever.
        }
    }

    private async Task RunSafelyAsync(Video video, PluginConfiguration config)
    {
#pragma warning disable CA1031
        try
        {
            var seconds = config.AutoDownloadTimeoutSeconds > 0 ? config.AutoDownloadTimeoutSeconds : 30;
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(seconds));
            await TryDownloadAsync(video, config, cts.Token).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            LogAutoDownloadFailed(_logger, video.Name, ex);
        }
        finally
        {
            RememberHandled(video.Id);
            _inFlight.TryRemove(video.Id, out _);
        }
#pragma warning restore CA1031
    }

    private async Task TryDownloadAsync(
        Video video,
        PluginConfiguration config,
        CancellationToken cancellationToken)
    {
        var languages = ResolveLanguages(config);

        if (AlreadySatisfied(video, config, languages))
        {
            return;
        }

        if (_services.GetService(typeof(ISubtitleManager)) is not ISubtitleManager subtitleManager)
        {
            return;
        }

        foreach (var language in languages)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var results = await subtitleManager
                .SearchSubtitles(video, language, null, true, cancellationToken)
                .ConfigureAwait(false);

            if (results is null || results.Length == 0)
            {
                continue;
            }

            // Providers return best-match first; a hash match beats everything else.
            var pick = Array.Find(results, r => r.IsHashMatch == true) ?? results[0];
            if (string.IsNullOrEmpty(pick.Id))
            {
                continue;
            }

            await subtitleManager
                .DownloadSubtitles(video, pick.Id, cancellationToken)
                .ConfigureAwait(false);

            LogAutoDownloaded(_logger, language, video.Name);
            return;
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "SST: could not subscribe to playback events; automatic subtitle download is off")]
    private static partial void LogSubscribeFailed(ILogger logger, Exception ex);

    [LoggerMessage(Level = LogLevel.Debug, Message = "SST: could not unsubscribe from playback events")]
    private static partial void LogUnsubscribeFailed(ILogger logger, Exception ex);

    [LoggerMessage(Level = LogLevel.Debug, Message = "SST: playback-start handler failed; playback is unaffected")]
    private static partial void LogHandlerFailed(ILogger logger, Exception ex);

    [LoggerMessage(Level = LogLevel.Debug, Message = "SST: automatic subtitle download failed for {ItemName}")]
    private static partial void LogAutoDownloadFailed(ILogger logger, string? itemName, Exception ex);

    [LoggerMessage(Level = LogLevel.Information, Message = "SST: downloaded a {Language} subtitle for {ItemName}")]
    private static partial void LogAutoDownloaded(ILogger logger, string language, string? itemName);
}
