/**
 * Saturn's Subtitle Tweaks (SST) — Jellyfin Web Client Module
 *
 * In-player subtitle search, download, and temporary timing offset.
 * Uses Jellyfin's RemoteSearch subtitle API (OpenSubtitles plugin, etc.).
 * No provider credentials in this file.
 *
 * @license MIT
 */
(function () {
    'use strict';

    if (window.SST && window.SST.loaded) {
        return;
    }

    var SST_VERSION = '1.3.1.0';
    var PLUGIN_ID = 'b3a1c2d4-e5f6-4a89-9bcd-1234567890ab';
    var LOG_PREFIX = '[SST]';
    var FIND_SUBTITLES_ID = 'sst-find-subtitles';
    var FIND_SUBTITLES_LABEL = '🪐 Find Subtitles';
    var OFFSET_ID = 'sst-subtitle-offset';
    var OFFSET_LABEL = '🪐 Subtitle Offset';
    var INJECTED_ITEM_CLASS = 'sst-find-subtitles-item';
    var OFFSET_ITEM_CLASS = 'sst-offset-item';

    var COMMON_LANGUAGES = [
        { code: 'eng', name: 'English' },
        { code: 'spa', name: 'Spanish' },
        { code: 'fre', name: 'French' },
        { code: 'ger', name: 'German' },
        { code: 'ita', name: 'Italian' },
        { code: 'por', name: 'Portuguese' },
        { code: 'rus', name: 'Russian' },
        { code: 'jpn', name: 'Japanese' },
        { code: 'chi', name: 'Chinese' },
        { code: 'kor', name: 'Korean' },
        { code: 'ara', name: 'Arabic' },
        { code: 'hin', name: 'Hindi' },
        { code: 'tur', name: 'Turkish' },
        { code: 'pol', name: 'Polish' },
        { code: 'dut', name: 'Dutch' },
        { code: 'swe', name: 'Swedish' },
        { code: 'nor', name: 'Norwegian' },
        { code: 'dan', name: 'Danish' },
        { code: 'fin', name: 'Finnish' },
        { code: 'cze', name: 'Czech' },
        { code: 'rum', name: 'Romanian' },
        { code: 'hun', name: 'Hungarian' },
        { code: 'hrv', name: 'Croatian' },
        { code: 'srp', name: 'Serbian' },
        { code: 'bos', name: 'Bosnian' },
        { code: 'slv', name: 'Slovenian' },
        { code: 'gre', name: 'Greek' },
        { code: 'heb', name: 'Hebrew' },
        { code: 'tha', name: 'Thai' },
        { code: 'vie', name: 'Vietnamese' },
        { code: 'ind', name: 'Indonesian' },
        { code: 'ukr', name: 'Ukrainian' }
    ];

    var isDialogOpen = false;
    var observer = null;
    var subtitleButtonListenerAttached = false;
    var sstOverlayTimer = null;
    var sstOverlayCues = [];
    var currentOffset = 0;
    var lastItemId = null;
    var cueBaseTimes = typeof WeakMap === 'function' ? new WeakMap() : null;
    var escapeDiv = document.createElement('div');

    function getServerRoot() {
        try {
            var base = document.querySelector('base');
            if (base && base.href) {
                var href = base.href;
                return href.endsWith('/') ? href.slice(0, -1) : href;
            }
        } catch (e) {
            console.debug(LOG_PREFIX, 'getServerRoot failed', e);
        }
        return '';
    }

    function ensureStylesheet() {
        if (document.getElementById('sst-client-style')) {
            return;
        }

        var link = document.createElement('link');
        link.id = 'sst-client-style';
        link.rel = 'stylesheet';
        var script = document.getElementById('sst-script');
        if (script && script.src) {
            link.href = script.src.replace(/sst\.js(\?.*)?$/, 'sst.css');
        } else {
            link.href = getServerRoot() + '/web/sst.css';
        }
        document.head.appendChild(link);
    }

    function escapeHtml(str) {
        if (!str) {
            return '';
        }
        escapeDiv.textContent = String(str);
        return escapeDiv.innerHTML;
    }

    function formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return String(num);
    }

    function sleep(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    function getApiClient() {
        if (typeof ApiClient !== 'undefined') {
            return ApiClient;
        }
        if (window.ApiClient) {
            return window.ApiClient;
        }
        if (window.ServerConnections && typeof window.ServerConnections.getApiClient === 'function') {
            try {
                return window.ServerConnections.getApiClient();
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    function getPlaybackManager() {
        var candidates = [
            window.playbackManager,
            window.PlaybackManager,
            window.Emby && window.Emby.PlaybackManager
        ];
        for (var i = 0; i < candidates.length; i++) {
            if (candidates[i] && typeof candidates[i] === 'object') {
                return candidates[i];
            }
        }
        return null;
    }

    function formatTitle(item) {
        if (!item) {
            return 'Now Playing';
        }
        if (item.SeriesName) {
            var title = item.SeriesName;
            if (item.ParentIndexNumber != null && item.IndexNumber != null) {
                title += ' S' + String(item.ParentIndexNumber).padStart(2, '0') +
                    'E' + String(item.IndexNumber).padStart(2, '0');
            }
            if (item.Name) {
                title += ' - ' + item.Name;
            }
            return title;
        }
        return item.Name || 'Now Playing';
    }

    function countSubtitleStreams(item) {
        if (!item || !item.MediaStreams) {
            return 0;
        }
        return item.MediaStreams.filter(function (s) {
            return s.Type === 'Subtitle';
        }).length;
    }

    function getDeviceId(api) {
        try {
            if (typeof api.deviceId === 'function') {
                return api.deviceId();
            }
            if (api.deviceId) {
                return api.deviceId;
            }
        } catch (e) {
            return '';
        }
        return '';
    }

    async function getPlayingContext() {
        var api = getApiClient();
        var pbm = getPlaybackManager();

        if (pbm) {
            try {
                var item = typeof pbm.currentItem === 'function' ? pbm.currentItem() : null;
                if (item && item.Id) {
                    var mediaSource = typeof pbm.currentMediaSource === 'function' ? pbm.currentMediaSource() : null;
                    return {
                        itemId: item.Id,
                        mediaSourceId: mediaSource && mediaSource.Id ? mediaSource.Id : item.Id,
                        title: formatTitle(item),
                        sessionId: null,
                        subtitleCount: countSubtitleStreams(item)
                    };
                }
            } catch (e) {
                console.debug(LOG_PREFIX, 'playbackManager currentItem failed', e);
            }
        }

        if (!api || typeof api.getUrl !== 'function') {
            return null;
        }

        try {
            var query = {};
            var deviceId = getDeviceId(api);
            if (deviceId) {
                query.deviceId = deviceId;
            }
            var sessions = await api.getJSON(api.getUrl('Sessions', query));
            if ((!sessions || !sessions.length) && deviceId) {
                sessions = await api.getJSON(api.getUrl('Sessions'));
            }
            var mine = null;
            if (sessions && sessions.length) {
                for (var i = 0; i < sessions.length; i++) {
                    if (sessions[i].NowPlayingItem && (!deviceId || sessions[i].DeviceId === deviceId)) {
                        mine = sessions[i];
                        break;
                    }
                }
                if (!mine) {
                    for (var j = 0; j < sessions.length; j++) {
                        if (sessions[j].NowPlayingItem) {
                            mine = sessions[j];
                            break;
                        }
                    }
                }
            }
            if (mine && mine.NowPlayingItem) {
                return {
                    itemId: mine.NowPlayingItem.Id,
                    mediaSourceId: mine.PlayState && mine.PlayState.MediaSourceId
                        ? mine.PlayState.MediaSourceId
                        : mine.NowPlayingItem.Id,
                    title: formatTitle(mine.NowPlayingItem),
                    sessionId: mine.Id,
                    subtitleCount: countSubtitleStreams(mine.NowPlayingItem)
                };
            }
        } catch (e) {
            console.debug(LOG_PREFIX, 'session lookup failed', e);
        }

        return null;
    }

    async function getLanguageChoices() {
        var api = getApiClient();
        var selected = 'eng';
        var options = COMMON_LANGUAGES.slice();

        if (!api) {
            return { options: options, selected: selected };
        }

        try {
            if (typeof api.getPluginConfiguration === 'function') {
                var config = await api.getPluginConfiguration(PLUGIN_ID);
                if (config && config.DefaultLanguage) {
                    selected = config.DefaultLanguage;
                }
            }
        } catch (e) {
            console.debug(LOG_PREFIX, 'plugin config unavailable', e);
        }

        try {
            if (typeof api.getCurrentUser === 'function') {
                var user = await api.getCurrentUser();
                var pref = user && user.Configuration && user.Configuration.SubtitleLanguagePreference;
                if (pref) {
                    selected = pref;
                }
            }
        } catch (e) {
            console.debug(LOG_PREFIX, 'user preference unavailable', e);
        }

        try {
            if (typeof api.getCultures === 'function') {
                var cultures = await api.getCultures();
                if (cultures && cultures.length) {
                    options = cultures.map(function (c) {
                        return {
                            code: c.ThreeLetterISOLanguageName || c.TwoLetterISOLanguageName || c.Name,
                            name: c.DisplayName || c.Name
                        };
                    }).filter(function (c) {
                        return c.code && c.name;
                    });
                }
            }
        } catch (e) {
            console.debug(LOG_PREFIX, 'cultures unavailable', e);
        }

        var hasSelected = options.some(function (o) {
            return o.code === selected;
        });
        if (!hasSelected && selected) {
            options.unshift({ code: selected, name: selected });
        }

        return { options: options, selected: selected };
    }

    function searchSubtitles(itemId, language) {
        var api = getApiClient();
        if (!api) {
            return Promise.reject(new Error('Jellyfin API client not available'));
        }
        var url = api.getUrl('Items/' + itemId + '/RemoteSearch/Subtitles/' + encodeURIComponent(language));
        return api.getJSON(url);
    }

    function downloadSubtitle(itemId, subtitleId) {
        var api = getApiClient();
        if (!api) {
            return Promise.reject(new Error('Jellyfin API client not available'));
        }
        var url = api.getUrl('Items/' + itemId + '/RemoteSearch/Subtitles/' + subtitleId);
        if (typeof api.ajax === 'function') {
            return api.ajax({ type: 'POST', url: url });
        }
        return fetch(url, { method: 'POST', credentials: 'same-origin' });
    }

    function getAccessToken(api) {
        try {
            if (api && typeof api.accessToken === 'function') {
                return api.accessToken();
            }
            if (api && api.accessToken) {
                return api.accessToken;
            }
        } catch (e) {
            return '';
        }
        return '';
    }

    async function getItemSubtitleStreams(itemId) {
        var api = getApiClient();
        if (!api || typeof api.getItem !== 'function') {
            return [];
        }
        var userId = typeof api.getCurrentUserId === 'function' ? api.getCurrentUserId() : '';
        var item = await api.getItem(userId, itemId);
        return (item && item.MediaStreams ? item.MediaStreams : []).filter(function (s) {
            return s.Type === 'Subtitle';
        });
    }

    function getVideoElement() {
        return document.querySelector('video.htmlvideoplayer') ||
            document.querySelector('.videoPlayerContainer video') ||
            document.querySelector('video');
    }

    function parseVttTimestamp(value) {
        var ts = String(value || '').trim().split(' ')[0].replace(',', '.');
        var parts = ts.split(':');
        if (parts.length === 3) {
            return (parseFloat(parts[0]) || 0) * 3600 + (parseFloat(parts[1]) || 0) * 60 + (parseFloat(parts[2]) || 0);
        }
        if (parts.length === 2) {
            return (parseFloat(parts[0]) || 0) * 60 + (parseFloat(parts[1]) || 0);
        }
        return parseFloat(ts) || 0;
    }

    function parseVttCues(text) {
        var cues = [];
        var normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        var blocks = normalized.split(/\n\n+/);
        for (var i = 0; i < blocks.length; i++) {
            var lines = blocks[i].split('\n').filter(function (line) {
                return line.length;
            });
            if (!lines.length) {
                continue;
            }
            var timeIndex = lines[0].indexOf('-->') === -1 && lines.length > 1 ? 1 : 0;
            var timeLine = lines[timeIndex];
            if (!timeLine || timeLine.indexOf('-->') === -1) {
                continue;
            }
            var times = timeLine.split('-->');
            var start = parseVttTimestamp(times[0]);
            var end = parseVttTimestamp(times[1]);
            var body = lines.slice(timeIndex + 1).join('\n');
            if (body) {
                cues.push({ start: start, end: end, text: body });
            }
        }
        return cues;
    }

    function hidePlayerSubtitleOverlay() {
        var overlay = document.querySelector('.videoSubtitles');
        if (overlay) {
            overlay.style.display = 'none';
        }
        var video = getVideoElement();
        if (!video || !video.textTracks) {
            return;
        }
        for (var i = 0; i < video.textTracks.length; i++) {
            try {
                video.textTracks[i].mode = 'disabled';
            } catch (e) {
                console.debug(LOG_PREFIX, 'hide textTrack failed', e);
            }
        }
    }

    function stopSstOverlay() {
        if (sstOverlayTimer) {
            clearInterval(sstOverlayTimer);
            sstOverlayTimer = null;
        }
        var overlay = document.getElementById('sst-subtitle-overlay');
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    }

    function ensureSstOverlay() {
        var overlay = document.getElementById('sst-subtitle-overlay');
        if (overlay) {
            return overlay;
        }
        overlay = document.createElement('div');
        overlay.id = 'sst-subtitle-overlay';
        overlay.className = 'sst-subtitle-overlay';
        var host = document.querySelector('.videoPlayerContainer');
        if (host) {
            host.appendChild(overlay);
        } else {
            overlay.style.position = 'fixed';
            document.body.appendChild(overlay);
        }
        return overlay;
    }

    function startSstOverlay(cues) {
        stopSstOverlay();
        sstOverlayCues = cues || [];
        var overlay = ensureSstOverlay();
        sstOverlayTimer = setInterval(function () {
            var video = getVideoElement();
            if (!video) {
                return;
            }
            var t = video.currentTime;
            var offset = currentOffset || 0;
            var lines = [];
            for (var i = 0; i < sstOverlayCues.length; i++) {
                var cue = sstOverlayCues[i];
                if (t >= cue.start + offset && t <= cue.end + offset) {
                    lines.push(cue.text);
                }
            }
            overlay.innerHTML = lines.map(function (line) {
                return '<div class="sst-subtitle-line">' + escapeHtml(line).replace(/\n/g, '<br>') + '</div>';
            }).join('');
            overlay.style.display = lines.length ? 'block' : 'none';
        }, 80);
    }

    function applyVttCuesToVideo(vttText) {
        var cues = parseVttCues(vttText);
        if (!cues.length) {
            return false;
        }
        hidePlayerSubtitleOverlay();
        startSstOverlay(cues);
        console.info(LOG_PREFIX, 'Applied ' + cues.length + ' subtitle cues to current playback');
        return true;
    }

    async function fetchSubtitleVtt(itemId, mediaSourceId, index) {
        var api = getApiClient();
        var params = {};
        var token = getAccessToken(api);
        if (token) {
            params.api_key = token;
        }
        var url = api.getUrl(
            'Videos/' + itemId + '/' + (mediaSourceId || itemId) + '/Subtitles/' + index + '/Stream.vtt',
            params
        );

        if (typeof api.ajax === 'function') {
            try {
                var result = await api.ajax({ type: 'GET', url: url, dataType: 'text' });
                if (typeof result === 'string' && result.length) {
                    return result;
                }
            } catch (e) {
                console.debug(LOG_PREFIX, 'ajax VTT fetch failed, trying fetch()', e);
            }
        }

        var headers = {};
        if (token) {
            headers['X-Emby-Token'] = token;
            headers.Authorization = 'MediaBrowser Token="' + token + '"';
        }
        var response = await fetch(url, { method: 'GET', credentials: 'same-origin', headers: headers });
        if (!response.ok) {
            throw new Error('Subtitle stream HTTP ' + response.status);
        }
        return response.text();
    }

    async function refreshItemLight(itemId) {
        var api = getApiClient();
        if (!api || typeof api.ajax !== 'function') {
            return;
        }
        try {
            await api.ajax({
                type: 'POST',
                url: api.getUrl('Items/' + itemId + '/Refresh', {
                    Recursive: false,
                    MetadataRefreshMode: 'None',
                    ImageRefreshMode: 'None',
                    ReplaceAllMetadata: false,
                    ReplaceAllImages: false
                })
            });
        } catch (e) {
            console.debug(LOG_PREFIX, 'item refresh failed', e);
        }
    }

    async function waitForNewSubtitleStream(itemId, previousIndexes) {
        var latest = null;
        for (var attempt = 0; attempt < 16; attempt++) {
            if (attempt === 4) {
                await refreshItemLight(itemId);
            }
            await sleep(attempt < 4 ? 400 : 700);
            try {
                var subs = await getItemSubtitleStreams(itemId);
                for (var i = subs.length - 1; i >= 0; i--) {
                    if (previousIndexes.indexOf(subs[i].Index) === -1) {
                        latest = subs[i];
                        break;
                    }
                }
                if (latest) {
                    return latest;
                }
            } catch (e) {
                console.debug(LOG_PREFIX, 'subtitle stream poll failed', e);
            }
        }
        return null;
    }

    async function tryPlayerSetSubtitleIndex(index) {
        var pbm = getPlaybackManager();
        if (!pbm || typeof pbm.setSubtitleStreamIndex !== 'function') {
            return false;
        }
        try {
            var player = null;
            if (typeof pbm.getPlayer === 'function') {
                player = pbm.getPlayer();
            } else if (typeof pbm.getCurrentPlayer === 'function') {
                player = pbm.getCurrentPlayer();
            }
            if (player && player._currentPlayOptions && player._currentPlayOptions.mediaSource) {
                var streams = player._currentPlayOptions.mediaSource.MediaStreams || [];
                var hasStream = streams.some(function (s) {
                    return s.Type === 'Subtitle' && s.Index === index;
                });
                if (!hasStream) {
                    streams.push({ Type: 'Subtitle', Index: index, IsExternal: true, DeliveryMethod: 'External', IsTextSubtitleStream: true });
                    player._currentPlayOptions.mediaSource.MediaStreams = streams;
                }
            }
            if (player) {
                pbm.setSubtitleStreamIndex(index, player);
            } else {
                pbm.setSubtitleStreamIndex(index);
            }
            return true;
        } catch (e) {
            console.debug(LOG_PREFIX, 'setSubtitleStreamIndex failed', e);
            return false;
        }
    }

    async function trySessionSetSubtitleIndex(index) {
        var api = getApiClient();
        var ctx = await getPlayingContext();
        if (!api || !ctx || !ctx.sessionId || typeof api.ajax !== 'function') {
            return false;
        }
        try {
            await api.ajax({
                type: 'POST',
                url: api.getUrl('Sessions/' + ctx.sessionId + '/Command'),
                data: JSON.stringify({
                    Name: 'SetSubtitleStreamIndex',
                    Arguments: { Index: String(index) }
                }),
                contentType: 'application/json'
            });
            return true;
        } catch (e) {
            console.debug(LOG_PREFIX, 'session subtitle command failed', e);
            return false;
        }
    }

    async function activateDownloadedTrack(itemId, mediaSourceId, previousIndexes) {
        var latest = await waitForNewSubtitleStream(itemId, previousIndexes || []);
        if (!latest) {
            return false;
        }

        var applied = false;
        try {
            var vtt = await fetchSubtitleVtt(itemId, mediaSourceId, latest.Index);
            applied = applyVttCuesToVideo(vtt);
        } catch (e) {
            console.debug(LOG_PREFIX, 'direct VTT apply failed', e);
        }

        await tryPlayerSetSubtitleIndex(latest.Index);
        await trySessionSetSubtitleIndex(latest.Index);

        return applied;
    }

    function applyTextTrackOffset(absoluteSeconds) {
        var videos = document.querySelectorAll('video');
        for (var i = 0; i < videos.length; i++) {
            var tracks = videos[i].textTracks;
            if (!tracks) {
                continue;
            }
            for (var j = 0; j < tracks.length; j++) {
                var cues = tracks[j].cues;
                if (!cues) {
                    continue;
                }
                for (var k = 0; k < cues.length; k++) {
                    var cue = cues[k];
                    var base = cueBaseTimes ? cueBaseTimes.get(cue) : null;
                    if (!base) {
                        base = { start: cue.startTime, end: cue.endTime };
                        if (cueBaseTimes) {
                            cueBaseTimes.set(cue, base);
                        }
                    }
                    try {
                        cue.startTime = base.start + absoluteSeconds;
                        cue.endTime = Math.max(base.end + absoluteSeconds, cue.startTime + 0.05);
                    } catch (e) {
                        console.debug(LOG_PREFIX, 'cue offset failed', e);
                    }
                }
            }
        }
    }

    function applySubtitleOffset(absoluteSeconds) {
        var value = Math.round(absoluteSeconds * 10) / 10;
        var pbm = getPlaybackManager();
        var player = null;
        try {
            if (pbm && typeof pbm.getPlayer === 'function') {
                player = pbm.getPlayer();
            } else if (pbm && pbm._currentPlayer) {
                player = pbm._currentPlayer;
            }
        } catch (e) {
            player = null;
        }

        if (pbm && typeof pbm.setSubtitleOffset === 'function') {
            try {
                pbm.setSubtitleOffset(value, player);
                currentOffset = value;
                return;
            } catch (e) {
                console.debug(LOG_PREFIX, 'playbackManager.setSubtitleOffset failed', e);
            }
        }

        if (player && typeof player.setSubtitleOffset === 'function') {
            try {
                player.setSubtitleOffset(value);
                currentOffset = value;
                return;
            } catch (e) {
                console.debug(LOG_PREFIX, 'player.setSubtitleOffset failed', e);
            }
        }

        applyTextTrackOffset(value);
        currentOffset = value;
    }

    function resetOffsetIfItemChanged(itemId) {
        if (itemId !== lastItemId) {
            lastItemId = itemId;
            stopSstOverlay();
            sstOverlayCues = [];
            if (currentOffset !== 0) {
                applySubtitleOffset(0);
            }
            currentOffset = 0;
        }
    }

    function getErrorMessage(error) {
        if (!error) {
            return 'An unknown error occurred.';
        }
        if (error.status === 401 || error.status === 403) {
            return 'Your user is not allowed to search or download subtitles. Enable subtitle management for this account.';
        }
        if (error.status === 404) {
            return 'No subtitle provider is configured on the server. Install and configure Open Subtitles (or another provider).';
        }
        if (error.status === 429) {
            return 'Provider rate limit reached. Try again later.';
        }
        if (error.status >= 500) {
            return 'Server error while searching subtitles.';
        }
        if (error.message) {
            return error.message;
        }
        return 'Subtitle operation failed.';
    }

    function languageLabel(code, options) {
        for (var i = 0; i < options.length; i++) {
            if (options[i].code === code) {
                return options[i].name;
            }
        }
        return code;
    }

    function formatSubtitleResult(sub, index) {
        var badges = [];
        if (sub.IsHashMatch) {
            badges.push('<span class="sst-badge sst-badge-hash">Hash Match</span>');
        }
        if (sub.Forced || sub.IsForced) {
            badges.push('<span class="sst-badge sst-badge-forced">Forced</span>');
        }
        if (sub.HearingImpaired) {
            badges.push('<span class="sst-badge sst-badge-sdh">SDH</span>');
        }
        if (sub.MachineTranslated) {
            badges.push('<span class="sst-badge sst-badge-mt">Machine Translated</span>');
        }
        if (sub.AiTranslated) {
            badges.push('<span class="sst-badge sst-badge-ai">AI Translated</span>');
        }

        var metaItems = [];
        if (sub.ProviderName) {
            metaItems.push('<span class="sst-meta-item">' + escapeHtml(sub.ProviderName) + '</span>');
        }
        if (sub.Format) {
            metaItems.push('<span class="sst-meta-item">' + escapeHtml(String(sub.Format).toUpperCase()) + '</span>');
        }
        if (sub.FrameRate && sub.FrameRate > 0) {
            metaItems.push('<span class="sst-meta-item">' + sub.FrameRate.toFixed(3) + ' FPS</span>');
        }
        if (sub.DownloadCount && sub.DownloadCount > 0) {
            metaItems.push('<span class="sst-meta-item">' + formatNumber(sub.DownloadCount) + ' downloads</span>');
        }
        if (sub.CommunityRating && sub.CommunityRating > 0) {
            metaItems.push('<span class="sst-meta-item">★ ' + sub.CommunityRating.toFixed(1) + '</span>');
        }
        if (sub.Author) {
            metaItems.push('<span class="sst-meta-item">' + escapeHtml(sub.Author) + '</span>');
        }

        var releaseName = sub.Name || sub.Comment || ('Subtitle ' + (index + 1));

        return '<div class="sst-result" data-subtitle-id="' + escapeHtml(sub.Id) + '">' +
            '  <div class="sst-result-header">' +
            '    <div class="sst-result-index">' + (index + 1) + '</div>' +
            '    <div class="sst-result-title">' + escapeHtml(releaseName) + '</div>' +
            '    <button type="button" class="sst-btn sst-btn-download" data-subtitle-id="' + escapeHtml(sub.Id) + '" title="Download">⬇</button>' +
            '  </div>' +
            (badges.length ? '  <div class="sst-result-badges">' + badges.join('') + '</div>' : '') +
            (metaItems.length ? '  <div class="sst-result-meta">' + metaItems.join('') + '</div>' : '') +
            (sub.Comment && sub.Comment !== sub.Name ? '  <div class="sst-result-comment">' + escapeHtml(sub.Comment) + '</div>' : '') +
            '</div>';
    }

    function updateOffsetDisplay(dialog) {
        var display = dialog.querySelector('#sst-offset-value');
        if (!display) {
            return;
        }
        var sign = currentOffset > 0 ? '+' : '';
        display.textContent = sign + currentOffset.toFixed(1) + 's';
        display.className = currentOffset === 0 ? '' : (currentOffset > 0 ? 'sst-offset-positive' : 'sst-offset-negative');
    }

    async function showFindDialog() {
        await mountDialog(buildFindDialogHtml, function (dialog, playing, languageOptions) {
            bindFindDialogEvents(dialog, playing, languageOptions);
            if (playing && playing.itemId) {
                performSearch(playing, dialog.querySelector('#sst-language').value, dialog, languageOptions);
            }
        });
    }

    async function showOffsetDialog() {
        await mountDialog(buildOffsetDialogHtml, function (dialog) {
            bindOffsetDialogEvents(dialog);
            updateOffsetDisplay(dialog);
        });
    }

    function buildFindDialogHtml(playing, languages) {
        var languageOptions = languages.options.map(function (lang) {
            var selected = lang.code === languages.selected ? ' selected' : '';
            return '<option value="' + escapeHtml(lang.code) + '"' + selected + '>' + escapeHtml(lang.name) + '</option>';
        }).join('');

        return '<div class="sst-dialog-backdrop" id="sst-backdrop"></div>' +
            '<div class="sst-dialog-content">' +
            '  <div class="sst-dialog-header">' +
            '    <h2 class="sst-dialog-title">' + FIND_SUBTITLES_LABEL + '</h2>' +
            '    <button type="button" class="sst-close-btn" id="sst-close-btn" title="Close" aria-label="Close">✕</button>' +
            '  </div>' +
            '  <div class="sst-dialog-body">' +
            '    <div class="sst-media-info" id="sst-media-info">' +
            escapeHtml(playing ? playing.title : 'Start playback to search subtitles for the current title.') +
            '    </div>' +
            '    <div class="sst-search-controls">' +
            '      <div class="sst-language-row">' +
            '        <label class="sst-label" for="sst-language">Language</label>' +
            '        <select id="sst-language" class="sst-select">' + languageOptions + '</select>' +
            '      </div>' +
            '      <button type="button" id="sst-search-btn" class="sst-btn sst-btn-primary">Search</button>' +
            '    </div>' +
            '    <div id="sst-status" class="sst-status" style="display:none;"></div>' +
            '    <div id="sst-results" class="sst-results"></div>' +
            '  </div>' +
            '</div>';
    }

    function buildOffsetDialogHtml(playing) {
        return '<div class="sst-dialog-backdrop" id="sst-backdrop"></div>' +
            '<div class="sst-dialog-content sst-dialog-content-compact">' +
            '  <div class="sst-dialog-header">' +
            '    <h2 class="sst-dialog-title">' + OFFSET_LABEL + '</h2>' +
            '    <button type="button" class="sst-close-btn" id="sst-close-btn" title="Close" aria-label="Close">✕</button>' +
            '  </div>' +
            '  <div class="sst-dialog-body">' +
            '    <div class="sst-media-info" id="sst-media-info">' +
            escapeHtml(playing ? playing.title : 'Start playback to adjust subtitle timing.') +
            '    </div>' +
            '    <div class="sst-offset-controls">' +
            '      <div class="sst-offset-label">Subtitle delay: <span id="sst-offset-value">0.0s</span></div>' +
            '      <div class="sst-status-hint">This playback only. Does not edit subtitle files.</div>' +
            '      <div class="sst-offset-buttons">' +
            '        <button type="button" class="sst-btn sst-btn-offset" data-offset="-0.5">-0.5s</button>' +
            '        <button type="button" class="sst-btn sst-btn-offset" data-offset="-0.1">-0.1s</button>' +
            '        <button type="button" class="sst-btn sst-btn-offset sst-btn-reset" data-offset="0">0</button>' +
            '        <button type="button" class="sst-btn sst-btn-offset" data-offset="0.1">+0.1s</button>' +
            '        <button type="button" class="sst-btn sst-btn-offset" data-offset="0.5">+0.5s</button>' +
            '      </div>' +
            '    </div>' +
            '  </div>' +
            '</div>';
    }

    async function mountDialog(htmlBuilder, afterMount) {
        closeDialog(true);

        isDialogOpen = true;
        var playing = await getPlayingContext();
        resetOffsetIfItemChanged(playing ? playing.itemId : null);
        var languages = await getLanguageChoices();

        var dialog = document.createElement('div');
        dialog.id = 'sst-dialog';
        dialog.className = 'sst-dialog';
        dialog.innerHTML = htmlBuilder(playing, languages);

        dismissBlockingOverlays();
        getOverlayParent().appendChild(dialog);
        dialog.classList.add('sst-dialog-open');
        requestAnimationFrame(function () {
            dismissBlockingOverlays();
            dialog.classList.add('sst-dialog-open');
        });

        bindDialogChrome(dialog);
        afterMount(dialog, playing, languages.options);
    }

    function closeDialog(immediate) {
        var dialog = document.getElementById('sst-dialog');
        if (!dialog) {
            isDialogOpen = false;
            return;
        }

        function remove() {
            if (dialog.parentNode) {
                dialog.parentNode.removeChild(dialog);
            }
            if (!document.getElementById('sst-dialog')) {
                isDialogOpen = false;
            }
        }

        if (immediate) {
            remove();
            return;
        }

        dialog.classList.remove('sst-dialog-open');
        setTimeout(function () {
            if (dialog.isConnected && !dialog.classList.contains('sst-dialog-open')) {
                remove();
            } else if (!document.getElementById('sst-dialog')) {
                isDialogOpen = false;
            }
        }, 250);
    }

    function bindDialogChrome(dialog) {
        dialog.addEventListener('click', function (e) {
            e.stopPropagation();
        });
        dialog.addEventListener('mousedown', function (e) {
            e.stopPropagation();
        });
        dialog.addEventListener('pointerdown', function (e) {
            e.stopPropagation();
        });

        dialog.querySelector('#sst-close-btn').addEventListener('click', function () {
            closeDialog();
        });
        dialog.querySelector('#sst-backdrop').addEventListener('click', function () {
            closeDialog();
        });

        var keyHandler = function (e) {
            if (e.key === 'Escape') {
                closeDialog();
                document.removeEventListener('keydown', keyHandler);
            }
        };
        document.addEventListener('keydown', keyHandler);
    }

    function bindFindDialogEvents(dialog, playing, languageOptions) {
        dialog.querySelector('#sst-search-btn').addEventListener('click', function () {
            performSearch(playing, dialog.querySelector('#sst-language').value, dialog, languageOptions);
        });

        dialog.querySelector('#sst-language').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                performSearch(playing, dialog.querySelector('#sst-language').value, dialog, languageOptions);
            }
        });
    }

    function bindOffsetDialogEvents(dialog) {
        var offsetButtons = dialog.querySelectorAll('.sst-btn-offset');
        for (var i = 0; i < offsetButtons.length; i++) {
            offsetButtons[i].addEventListener('click', function () {
                var step = parseFloat(this.getAttribute('data-offset'));
                if (step === 0) {
                    applySubtitleOffset(0);
                } else {
                    applySubtitleOffset(currentOffset + step);
                }
                updateOffsetDisplay(dialog);
            });
        }
    }

    async function performSearch(playing, language, dialog, languageOptions) {
        var statusEl = dialog.querySelector('#sst-status');
        var resultsEl = dialog.querySelector('#sst-results');
        var searchBtn = dialog.querySelector('#sst-search-btn');

        if (!playing || !playing.itemId) {
            playing = await getPlayingContext();
            if (playing && playing.itemId) {
                var mediaInfo = dialog.querySelector('#sst-media-info');
                if (mediaInfo) {
                    mediaInfo.textContent = playing.title;
                }
            }
        }

        if (!playing || !playing.itemId) {
            statusEl.innerHTML = 'Play a video first, then search for subtitles.';
            statusEl.className = 'sst-status sst-status-error';
            statusEl.style.display = 'block';
            return;
        }

        searchBtn.disabled = true;
        searchBtn.textContent = 'Searching…';
        statusEl.style.display = 'none';
        resultsEl.innerHTML = '';

        try {
            var results = await searchSubtitles(playing.itemId, language);
            searchBtn.disabled = false;
            searchBtn.textContent = 'Search';

            if (!results || !results.length) {
                statusEl.innerHTML = 'No ' + escapeHtml(languageLabel(language, languageOptions)) +
                    ' subtitles found.<span class="sst-status-hint">Try another language, or check that Open Subtitles (or another provider) is configured on the server.</span>';
                statusEl.className = 'sst-status sst-status-empty';
                statusEl.style.display = 'block';
                return;
            }

            statusEl.textContent = results.length + ' subtitle' + (results.length === 1 ? '' : 's') + ' found';
            statusEl.className = 'sst-status sst-status-success';
            statusEl.style.display = 'block';

            var html = '';
            for (var i = 0; i < results.length; i++) {
                html += formatSubtitleResult(results[i], i);
            }
            resultsEl.innerHTML = html;

            var downloadBtns = resultsEl.querySelectorAll('.sst-btn-download');
            for (var j = 0; j < downloadBtns.length; j++) {
                downloadBtns[j].addEventListener('click', function (e) {
                    e.stopPropagation();
                    performDownload(playing, this.getAttribute('data-subtitle-id'), this, dialog);
                });
            }
        } catch (error) {
            searchBtn.disabled = false;
            searchBtn.textContent = 'Search';
            statusEl.innerHTML = escapeHtml(getErrorMessage(error));
            statusEl.className = 'sst-status sst-status-error';
            statusEl.style.display = 'block';
        }
    }

    async function performDownload(playing, subtitleId, button, dialog) {
        var originalHtml = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '…';
        var statusEl = dialog.querySelector('#sst-status');

        try {
            var previousIndexes = [];
            try {
                previousIndexes = (await getItemSubtitleStreams(playing.itemId)).map(function (s) {
                    return s.Index;
                });
            } catch (e) {
                previousIndexes = [];
            }
            await downloadSubtitle(playing.itemId, subtitleId);
            button.innerHTML = '✓';
            statusEl.innerHTML = 'Downloaded. Applying to this playback…';
            statusEl.className = 'sst-status sst-status-success';
            statusEl.style.display = 'block';

            var activated = await activateDownloadedTrack(playing.itemId, playing.mediaSourceId, previousIndexes);
            if (activated) {
                statusEl.innerHTML = 'Subtitle downloaded and applied to this video. Use 🪐 Subtitle Offset in the CC menu to adjust timing.';
                playing.subtitleCount = previousIndexes.length + 1;
            } else {
                statusEl.innerHTML = 'Subtitle downloaded to the library, but it could not be applied automatically. Open the CC menu and select the new track.';
            }
        } catch (error) {
            button.disabled = false;
            button.innerHTML = originalHtml;
            statusEl.innerHTML = escapeHtml(getErrorMessage(error));
            statusEl.className = 'sst-status sst-status-error';
            statusEl.style.display = 'block';
        }
    }

    function isSubtitleTrackActionSheet(sheet) {
        if (!sheet || !sheet.classList || !sheet.classList.contains('actionSheet')) {
            return false;
        }

        if (sheet.querySelector('.actionSheetMenuItem[data-id="-1"]')) {
            return true;
        }

        if (sheet.querySelector('.actionSheetMenuItem[data-id="secondarysubtitle"]')) {
            return true;
        }

        var titleEl = sheet.querySelector('.actionSheetTitle');
        var title = titleEl && titleEl.textContent ? titleEl.textContent.replace(/\s+/g, ' ').trim().toLowerCase() : '';
        return title.indexOf('subtitle') !== -1;
    }

    function dismissBlockingOverlays() {
        var nodes = document.querySelectorAll('.dialogContainer, .dialogBackdrop, .dialogBackdropOpened, .actionSheet');
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            if (el.id === 'sst-dialog' || (el.closest && el.closest('#sst-dialog'))) {
                continue;
            }
            el.style.setProperty('pointer-events', 'none', 'important');
            el.classList.remove('dialogBackdropOpened');
        }
    }

    function getOverlayParent() {
        return document.fullscreenElement || document.webkitFullscreenElement || document.body;
    }

    function closeActionSheet(sheet) {
        if (!sheet) {
            dismissBlockingOverlays();
            return;
        }

        try {
            var dlg = sheet.classList.contains('dialog') ? sheet : (sheet.closest('.dialog') || sheet);

            // Run Jellyfin's close path so .dialogContainer / backdrop / history are cleaned up.
            if (dlg.classList && !dlg.classList.contains('hide')) {
                dlg.dispatchEvent(new CustomEvent('closing', { bubbles: false, cancelable: false }));
                dlg.classList.add('hide');
                dlg.dispatchEvent(new CustomEvent('_close', { bubbles: false, cancelable: false }));
            }
        } catch (e) {
            console.debug(LOG_PREFIX, 'closeActionSheet failed', e);
        }

        dismissBlockingOverlays();
    }

    function createSheetMenuItem(sheet, id, label, className, onOpen) {
        var sample = sheet.querySelector('.actionSheetMenuItem');
        var item;

        if (sample) {
            item = sample.cloneNode(true);
            item.classList.add(className);
            item.setAttribute('data-id', id);
            item.removeAttribute('autofocus');
            item.removeAttribute('autoFocus');

            var textEl = item.querySelector('.listItemBodyText') || item.querySelector('.listItemBody');
            if (textEl) {
                textEl.textContent = label;
            } else {
                item.textContent = label;
            }

            var secondary = item.querySelector('.secondaryText, .listItemBody aside, .listItemAside');
            if (secondary) {
                secondary.textContent = '';
            }

            var selectedIcon = item.querySelector('.listItemIcon.check, .material-icons.check');
            if (selectedIcon) {
                selectedIcon.remove();
            }
        } else {
            item = document.createElement('button');
            item.type = 'button';
            item.className = 'listItem listItem-button actionSheetMenuItem ' + className;
            item.setAttribute('data-id', id);
            var body = document.createElement('div');
            body.className = 'listItemBody';
            var text = document.createElement('div');
            text.className = 'listItemBodyText';
            text.textContent = label;
            body.appendChild(text);
            item.appendChild(body);
        }

        item.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) {
                e.stopImmediatePropagation();
            }
            closeActionSheet(item.closest('.actionSheet') || item.closest('.dialog'));
            setTimeout(onOpen, 50);
        });

        return item;
    }

    function injectSstMenuItems(sheet) {
        if (!isSubtitleTrackActionSheet(sheet)) {
            return;
        }

        var scroller = sheet.querySelector('.actionSheetScroller') ||
            sheet.querySelector('.actionSheetContent') ||
            sheet;
        var firstNative = null;
        var menuItems = scroller.querySelectorAll('.actionSheetMenuItem');
        for (var i = 0; i < menuItems.length; i++) {
            var dataId = menuItems[i].getAttribute('data-id');
            if (dataId !== FIND_SUBTITLES_ID && dataId !== OFFSET_ID) {
                firstNative = menuItems[i];
                break;
            }
        }

        var findItem = sheet.querySelector('.' + INJECTED_ITEM_CLASS) ||
            sheet.querySelector('[data-id="' + FIND_SUBTITLES_ID + '"]');
        var offsetItem = sheet.querySelector('.' + OFFSET_ITEM_CLASS) ||
            sheet.querySelector('[data-id="' + OFFSET_ID + '"]');

        if (findItem && offsetItem) {
            fitActionSheetToViewport(sheet);
            return;
        }

        var injected = false;

        if (!findItem) {
            findItem = createSheetMenuItem(sheet, FIND_SUBTITLES_ID, FIND_SUBTITLES_LABEL, INJECTED_ITEM_CLASS, showFindDialog);
            injected = true;
            if (firstNative && firstNative.parentNode) {
                firstNative.parentNode.insertBefore(findItem, firstNative);
            } else {
                scroller.appendChild(findItem);
            }
        }

        if (!offsetItem) {
            offsetItem = createSheetMenuItem(sheet, OFFSET_ID, OFFSET_LABEL, OFFSET_ITEM_CLASS, showOffsetDialog);
            injected = true;
            if (findItem && findItem.parentNode) {
                if (findItem.nextSibling) {
                    findItem.parentNode.insertBefore(offsetItem, findItem.nextSibling);
                } else {
                    findItem.parentNode.appendChild(offsetItem);
                }
            } else if (firstNative && firstNative.parentNode) {
                firstNative.parentNode.insertBefore(offsetItem, firstNative);
            } else {
                scroller.appendChild(offsetItem);
            }
        }

        fitActionSheetToViewport(sheet);
        [0, 50, 160].forEach(function (delay) {
            setTimeout(function () {
                fitActionSheetToViewport(sheet);
            }, delay);
        });
        if (injected) {
            console.info(LOG_PREFIX, 'Injected SST items at top of subtitle action sheet');
        }
    }

    function getViewportHeight() {
        if (window.visualViewport && window.visualViewport.height) {
            return window.visualViewport.height;
        }
        return window.innerHeight || document.documentElement.clientHeight || 0;
    }

    function getVisibleBottomLimit() {
        var limit = getViewportHeight() - 12;
        var osdSelectors = [
            '.videoOsdBottom',
            '.osdMain',
            '.osdControls'
        ];
        for (var i = 0; i < osdSelectors.length; i++) {
            var osd = document.querySelector(osdSelectors[i]);
            if (!osd) {
                continue;
            }
            var osdRect = osd.getBoundingClientRect();
            if (osdRect.height > 8 && osdRect.top > 80 && osdRect.top < limit) {
                limit = osdRect.top - 8;
                break;
            }
        }
        return limit;
    }

    function fitActionSheetToViewport(sheet) {
        if (!sheet || !sheet.isConnected || sheet.classList.contains('actionsheet-fullscreen')) {
            return;
        }

        var margin = 12;
        var bottomLimit = getVisibleBottomLimit();
        var maxHeight = Math.max(160, bottomLimit - margin);
        sheet.style.maxHeight = maxHeight + 'px';

        var rect = sheet.getBoundingClientRect();
        var overflowY = rect.bottom - bottomLimit;
        if (overflowY > 0) {
            var newTop = Math.max(margin, rect.top - overflowY - 8);
            sheet.style.position = 'fixed';
            sheet.style.margin = '0';
            sheet.style.top = newTop + 'px';
            sheet.style.bottom = 'auto';
        }

        rect = sheet.getBoundingClientRect();
        if (rect.top < margin) {
            sheet.style.top = margin + 'px';
            rect = sheet.getBoundingClientRect();
        }

        var scroller = sheet.querySelector('.actionSheetScroller');
        if (!scroller) {
            return;
        }

        var title = sheet.querySelector('.actionSheetTitle');
        var titleHeight = title ? title.getBoundingClientRect().height : 0;
        var scrollerMax = Math.max(120, bottomLimit - rect.top - titleHeight - 12);
        scroller.style.maxHeight = scrollerMax + 'px';
        scroller.style.minHeight = '0';
        scroller.style.overflowY = 'auto';
    }

    function scanForSubtitleActionSheets(root) {
        try {
            var scope = root || document;
            if (scope.nodeType !== Node.ELEMENT_NODE && scope !== document) {
                return;
            }

            if (scope.classList && scope.classList.contains('actionSheet')) {
                injectSstMenuItems(scope);
            }

            if (scope.querySelectorAll) {
                var sheets = scope.querySelectorAll('.actionSheet');
                for (var i = 0; i < sheets.length; i++) {
                    injectSstMenuItems(sheets[i]);
                }
            }
        } catch (e) {
            console.debug(LOG_PREFIX, 'scanForSubtitleActionSheets failed', e);
        }
    }

    function onSubtitleButtonClick() {
        [0, 30, 80, 160, 300, 600, 1000].forEach(function (delay) {
            setTimeout(function () {
                scanForSubtitleActionSheets(document);
            }, delay);
        });
    }

    function attachSubtitleButtonListener() {
        if (subtitleButtonListenerAttached) {
            return;
        }

        document.addEventListener('click', function (e) {
            try {
                var target = e.target;
                if (!target || !target.closest) {
                    return;
                }

                if (target.closest('.btnSubtitles')) {
                    onSubtitleButtonClick();
                }
            } catch (err) {
                console.debug(LOG_PREFIX, 'subtitle button listener error', err);
            }
        }, true);

        subtitleButtonListenerAttached = true;
    }

    function startActionSheetObserver() {
        if (observer || !document.body) {
            return;
        }

        observer = new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var added = mutations[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                    var node = added[j];
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        scanForSubtitleActionSheets(node);
                    }
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        scanForSubtitleActionSheets(document);
    }

    function watchPlaybackItemChanges() {
        setInterval(function () {
            getPlayingContext().then(function (ctx) {
                resetOffsetIfItemChanged(ctx ? ctx.itemId : null);
            }).catch(function () {
                return null;
            });
        }, 2500);
    }

    function initWebInject() {
        attachSubtitleButtonListener();
        startActionSheetObserver();
        watchPlaybackItemChanges();
        console.info(LOG_PREFIX, 'Web injection active (v' + SST_VERSION + ')');
    }

    function destroyWebInject() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        subtitleButtonListenerAttached = false;
        stopSstOverlay();
    }

    window.SST = {
        version: SST_VERSION,
        loaded: true,
        integration: 'web-inject',
        Core: {
            getServerRoot: getServerRoot,
            getPlayingContext: getPlayingContext,
            search: searchSubtitles,
            download: downloadSubtitle,
            setOffset: applySubtitleOffset
        },
        UI: {
            show: showFindDialog,
            showOffset: showOffsetDialog,
            close: closeDialog
        },
        Integration: {
            init: initWebInject,
            destroy: destroyWebInject
        }
    };

    function init() {
        ensureStylesheet();
        initWebInject();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
