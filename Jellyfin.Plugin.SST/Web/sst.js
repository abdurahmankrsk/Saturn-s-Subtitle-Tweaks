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

    var SST_VERSION = '1.4.0.0';
    var PLUGIN_ID = 'b3a1c2d4-e5f6-4a89-9bcd-1234567890ab';
    var LOG_PREFIX = '[SST]';
    var FIND_SUBTITLES_ID = 'sst-find-subtitles';
    var FIND_SUBTITLES_LABEL = '🪐 Find Subtitles';
    var OFFSET_ID = 'sst-subtitle-offset';
    var OFFSET_LABEL = '🪐 Subtitle Offset';
    var INJECTED_ITEM_CLASS = 'sst-find-subtitles-item';
    var OFFSET_ITEM_CLASS = 'sst-offset-item';
    var REMOTE_BANNER_ID = 'sst-remote-banner';
    var DETAIL_BTN_CLASS = 'sst-detail-btn';
    var REMOTE_POLL_MS = 20000;

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
    var DOWNLOAD_STORE_KEY = 'sst-downloaded-subtitles';
    var inFlightDownloads = {};
    var remotePollTimer = null;
    var dismissedSessions = {};
    var detailScanTimer = null;
    var cachedConfig = null;

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

    function isTvLayout() {
        try {
            if (window.layoutManager && window.layoutManager.tv) {
                return true;
            }
        } catch (e) {
            console.debug(LOG_PREFIX, 'layoutManager check failed', e);
        }
        var html = document.documentElement;
        if (html && html.classList && html.classList.contains('layout-tv')) {
            return true;
        }
        return !!(document.body && document.body.classList && document.body.classList.contains('layout-tv'));
    }

    function isMobileLayout() {
        try {
            if (window.layoutManager && window.layoutManager.mobile) {
                return true;
            }
        } catch (e) {
            console.debug(LOG_PREFIX, 'layoutManager mobile check failed', e);
        }
        var html = document.documentElement;
        if (html && html.classList && html.classList.contains('layout-mobile')) {
            return true;
        }
        if (document.body && document.body.classList && document.body.classList.contains('layout-mobile')) {
            return true;
        }
        return window.innerWidth > 0 && window.innerWidth < 850;
    }

    function isActivateKey(e) {
        var key = e.key || '';
        var code = e.keyCode || e.which || 0;
        return key === 'Enter' || key === ' ' || key === 'Spacebar' ||
            code === 13 || code === 32 || code === 23;
    }

    function isBackKey(e) {
        var key = e.key || '';
        var code = e.keyCode || e.which || 0;
        if (key === 'Escape' || code === 27) {
            return true;
        }
        if (!isTvLayout()) {
            return false;
        }
        return key === 'Backspace' || code === 8 || code === 461 || code === 166 || code === 4;
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

    function normalizeLang(code) {
        var c = String(code || '').toLowerCase().trim();
        if (c === 'en' || c === 'english') {
            return 'eng';
        }
        if (c === 'hr' || c === 'cro' || c === 'croatian' || c === 'hrvatski') {
            return 'hrv';
        }
        if (c === 'sr' || c === 'serbian') {
            return 'srp';
        }
        if (c === 'bs' || c === 'bosnian') {
            return 'bos';
        }
        return c;
    }

    function streamLang(stream) {
        return normalizeLang(stream.Language || stream.ThreeLetterISOLanguageName || stream.TwoLetterISOLanguageName || '');
    }

    function streamLabel(stream) {
        return String(stream.DisplayTitle || stream.Title || stream.Path || stream.Comment || '');
    }

    function isConflictingLanguage(stream, preferred) {
        var pref = normalizeLang(preferred);
        if (!pref) {
            return false;
        }
        var lang = streamLang(stream);
        var label = streamLabel(stream).toLowerCase();
        if (pref === 'eng') {
            if (lang === 'hrv' || lang === 'srp' || lang === 'bos' || lang === 'slv') {
                return true;
            }
            if (/\b(croatian|hrvatski|serbian|bosnian|slovenian|hrv|srp)\b/.test(label) ||
                /(^|[^a-z])hr([^a-z]|$)/.test(label)) {
                return true;
            }
        }
        if (lang && lang !== pref && lang.length === 3) {
            return true;
        }
        return false;
    }

    function isPreferredLanguage(stream, preferred) {
        var pref = normalizeLang(preferred);
        if (!pref) {
            return false;
        }
        if (streamLang(stream) === pref) {
            return true;
        }
        var label = streamLabel(stream);
        if (pref === 'eng' && /\b(english|eng)\b/i.test(label) && !isConflictingLanguage(stream, preferred)) {
            return true;
        }
        return false;
    }

    function matchesReleaseName(stream, releaseName) {
        if (!releaseName || releaseName.length < 8) {
            return false;
        }
        var label = streamLabel(stream).toLowerCase();
        var needle = String(releaseName).toLowerCase().replace(/\s+/g, '.');
        var shortNeedle = needle.split('.hdtv')[0].split('.web')[0].split('.bluray')[0];
        return label.indexOf(needle) !== -1 || (shortNeedle.length > 10 && label.indexOf(shortNeedle) !== -1);
    }

    function normalizeReleaseKey(value) {
        return String(value || '').toLowerCase().replace(/[\s._-]+/g, '.').replace(/^\.+|\.+$/g, '');
    }

    function isSameRelease(left, right) {
        var a = normalizeReleaseKey(left);
        var b = normalizeReleaseKey(right);
        if (!a || !b || a.length < 8 || b.length < 8) {
            return false;
        }
        return !!(a && b && a.length >= 8 && a === b);
    }

    function loadDownloadedMap() {
        try {
            var raw = window.localStorage && window.localStorage.getItem(DOWNLOAD_STORE_KEY);
            var parsed = raw ? JSON.parse(raw) : {};
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function saveDownloadedMap(map) {
        try {
            if (window.localStorage) {
                window.localStorage.setItem(DOWNLOAD_STORE_KEY, JSON.stringify(map));
            }
        } catch (e) {
            console.debug(LOG_PREFIX, 'could not persist downloaded subtitle ids', e);
        }
    }

    function forgetDownloadedSubtitle(itemId, subtitleId) {
        if (!itemId || !subtitleId) {
            return;
        }
        var map = loadDownloadedMap();
        if (!map[itemId] || !map[itemId][subtitleId]) {
            return;
        }
        delete map[itemId][subtitleId];
        if (!Object.keys(map[itemId]).length) {
            delete map[itemId];
        }
        saveDownloadedMap(map);
    }

    function markSubtitleDownloaded(itemId, subtitleId, releaseName, language) {
        if (!itemId || !subtitleId) {
            return;
        }
        var map = loadDownloadedMap();
        if (!map[itemId]) {
            map[itemId] = {};
        }
        map[itemId][subtitleId] = {
            name: releaseName || '',
            lang: normalizeLang(language),
            at: Date.now()
        };
        saveDownloadedMap(map);
    }

    function hasExternalForLanguage(streams, language) {
        var pref = normalizeLang(language);
        var list = streams || [];
        for (var i = 0; i < list.length; i++) {
            var stream = list[i];
            if (!stream.IsExternal) {
                continue;
            }
            if (isConflictingLanguage(stream, pref)) {
                continue;
            }
            if (!pref || isPreferredLanguage(stream, pref) || !streamLang(stream)) {
                return true;
            }
        }
        return false;
    }

    function isRemoteSubtitleAlreadyOwned(itemId, subtitleId, releaseName, language, streams) {
        var records = {};
        if (itemId) {
            var map = loadDownloadedMap();
            records = map[itemId] || {};
        }
        if (subtitleId && records[subtitleId]) {
            if (hasExternalForLanguage(streams, records[subtitleId].lang || language)) {
                return true;
            }
            forgetDownloadedSubtitle(itemId, subtitleId);
        }
        var keys = Object.keys(records);
        for (var i = 0; i < keys.length; i++) {
            if (isSameRelease(records[keys[i]] && records[keys[i]].name, releaseName)) {
                if (hasExternalForLanguage(streams, (records[keys[i]] && records[keys[i]].lang) || language)) {
                    return true;
                }
            }
        }
        var list = streams || [];
        for (var j = 0; j < list.length; j++) {
            if (matchesReleaseName(list[j], releaseName)) {
                return true;
            }
        }
        return false;
    }

    function markResultRowDownloaded(button) {
        if (!button) {
            return;
        }
        button.disabled = true;
        button.innerHTML = '✓';
        button.title = 'Already downloaded';
        button.classList.add('sst-btn-already');
        var row = button.closest ? button.closest('.sst-result') : null;
        if (row) {
            row.classList.add('sst-result-downloaded');
            var badges = row.querySelector('.sst-result-badges');
            if (!badges) {
                badges = document.createElement('div');
                badges.className = 'sst-result-badges';
                var header = row.querySelector('.sst-result-header');
                if (header && header.parentNode) {
                    header.parentNode.insertBefore(badges, header.nextSibling);
                } else {
                    row.appendChild(badges);
                }
            }
            if (!row.querySelector('.sst-badge-owned')) {
                var badge = document.createElement('span');
                badge.className = 'sst-badge sst-badge-owned';
                badge.textContent = 'In library';
                badges.insertBefore(badge, badges.firstChild);
            }
        }
    }

    function vttConflictsWithLanguage(vttText, preferred) {
        var pref = normalizeLang(preferred);
        if (pref !== 'eng') {
            return false;
        }
        var sample = String(vttText || '').slice(0, 20000);
        var marks = sample.match(/[čćžšđČĆŽŠĐ]/g);
        return !!(marks && marks.length >= 3);
    }

    function vttSignature(vttText) {
        var text = String(vttText || '').replace(/\s+/g, ' ').slice(0, 1800);
        var hash = 2166136261;
        for (var i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16) + ':' + text.length;
    }

    function subtitleStreamsFromItem(item) {
        return ((item && item.MediaStreams) || []).filter(function (s) {
            return s.Type === 'Subtitle';
        });
    }

    function mergeSubtitleStreams(lists) {
        var byIndex = {};
        for (var i = 0; i < lists.length; i++) {
            var list = lists[i] || [];
            for (var j = 0; j < list.length; j++) {
                byIndex[list[j].Index] = list[j];
            }
        }
        return Object.keys(byIndex).map(function (key) {
            return byIndex[key];
        });
    }

    async function getItemSubtitleStreams(itemId) {
        var api = getApiClient();
        var streams = [];
        if (api && typeof api.getItem === 'function') {
            try {
                var userId = typeof api.getCurrentUserId === 'function' ? api.getCurrentUserId() : '';
                var item = await api.getItem(userId, itemId);
                streams = subtitleStreamsFromItem(item);
            } catch (e) {
                console.debug(LOG_PREFIX, 'getItem subtitle streams failed', e);
            }
        }
        return {
            streams: streams,
            mediaSourceId: null
        };
    }

    function rankApplyCandidates(subs, previousIndexes, preferredLanguage, releaseName) {
        var previous = previousIndexes || [];
        var ranked = [];
        for (var i = 0; i < subs.length; i++) {
            var stream = subs[i];
            if (isConflictingLanguage(stream, preferredLanguage)) {
                continue;
            }
            var isNew = previous.indexOf(stream.Index) === -1;
            var score = stream.Index || 0;
            if (isNew) {
                score += 2000;
            }
            if (isPreferredLanguage(stream, preferredLanguage)) {
                score += 1000;
            }
            if (matchesReleaseName(stream, releaseName)) {
                score += 800;
            }
            ranked.push({ stream: stream, score: score });
        }
        ranked.sort(function (a, b) {
            return b.score - a.score;
        });
        return ranked;
    }

    async function snapshotExistingVtts(itemId, mediaSourceId, streams) {
        var signatures = {};
        var tasks = (streams || []).map(function (stream) {
            return fetchSubtitleVtt(itemId, mediaSourceId, stream.Index).then(function (vtt) {
                signatures[vttSignature(vtt)] = stream.Index;
            }).catch(function () {
                return null;
            });
        });
        await Promise.all(tasks);
        return signatures;
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

    function restorePlayerSubtitleOverlay() {
        var overlay = document.querySelector('.videoSubtitles');
        if (overlay) {
            overlay.style.display = '';
        }
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

    function releaseSstPlaybackControl() {
        stopSstOverlay();
        sstOverlayCues = [];
        restorePlayerSubtitleOverlay();
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
            hidePlayerSubtitleOverlay();
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

    async function activateDownloadedTrack(itemId, mediaSourceId, previousIndexes, preferredLanguage, releaseName, existingSignatures) {
        await turnOffAllSubtitles();
        var known = existingSignatures || {};
        var tried = {};
        var pref = normalizeLang(preferredLanguage);

        for (var attempt = 0; attempt < 20; attempt++) {
            if (attempt > 0) {
                await sleep(200);
            }
            try {
                var snapshot = await getItemSubtitleStreams(itemId);
                var sourceId = snapshot.mediaSourceId || mediaSourceId;
                var ranked = rankApplyCandidates(snapshot.streams, previousIndexes || [], pref, releaseName);
                for (var i = 0; i < ranked.length; i++) {
                    var stream = ranked[i].stream;
                    var key = String(stream.Index);
                    if (tried[key]) {
                        continue;
                    }
                    try {
                        var vtt = await fetchSubtitleVtt(itemId, sourceId, stream.Index);
                        var signature = vttSignature(vtt);
                        if (known[signature]) {
                            console.info(LOG_PREFIX, 'Skipped existing subtitle stream ' + stream.Index);
                            tried[key] = true;
                            continue;
                        }
                        if (vttConflictsWithLanguage(vtt, pref)) {
                            console.info(LOG_PREFIX, 'Skipped stream ' + stream.Index + ' because the file is not ' + pref);
                            tried[key] = true;
                            continue;
                        }
                        if (applyVttCuesToVideo(vtt)) {
                            console.info(LOG_PREFIX, 'Applied downloaded subtitle stream ' + stream.Index +
                                ' (' + (streamLang(stream) || streamLabel(stream) || 'unknown') + ')');
                            return true;
                        }
                    } catch (e) {
                        console.debug(LOG_PREFIX, 'candidate stream ' + stream.Index + ' failed', e);
                    }
                    tried[key] = true;
                }
            } catch (e) {
                console.debug(LOG_PREFIX, 'subtitle apply poll failed', e);
            }
        }
        return false;
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


    /* ---------------------------------------------------------------
       REMOTE SESSIONS
       Control a client that cannot load SST itself (Android TV, Google
       TV, webOS, Tizen). Those clients never fetch /web/index.html, so
       the only way in is Jellyfin's session remote-control API.
       --------------------------------------------------------------- */

    function isControllableRemoteSession(session, ownDeviceId) {
        if (!session || !session.NowPlayingItem || !session.NowPlayingItem.Id) {
            return false;
        }
        if (session.SupportsRemoteControl === false) {
            return false;
        }
        if (ownDeviceId && session.DeviceId === ownDeviceId) {
            return false;
        }
        return true;
    }

    function sessionLabel(session) {
        return session.DeviceName || session.Client || 'that device';
    }

    function contextFromSession(session) {
        var state = session.PlayState || {};
        return {
            itemId: session.NowPlayingItem.Id,
            mediaSourceId: state.MediaSourceId || session.NowPlayingItem.Id,
            title: formatTitle(session.NowPlayingItem),
            sessionId: session.Id,
            subtitleCount: countSubtitleStreams(session.NowPlayingItem),
            remote: true,
            deviceName: sessionLabel(session),
            positionTicks: state.PositionTicks || 0
        };
    }

    async function fetchSessions() {
        var api = getApiClient();
        if (!api || typeof api.getJSON !== 'function' || typeof api.getUrl !== 'function') {
            return [];
        }
        try {
            return (await api.getJSON(api.getUrl('Sessions', { activeWithinSeconds: 300 }))) || [];
        } catch (e) {
            console.debug(LOG_PREFIX, 'session list failed', e);
            return [];
        }
    }

    async function listRemoteSessions() {
        var api = getApiClient();
        var ownDeviceId = api ? getDeviceId(api) : '';
        var sessions = await fetchSessions();
        var out = [];
        for (var i = 0; i < sessions.length; i++) {
            if (isControllableRemoteSession(sessions[i], ownDeviceId)) {
                out.push(sessions[i]);
            }
        }
        return out;
    }

    async function refreshSession(sessionId) {
        var sessions = await fetchSessions();
        for (var i = 0; i < sessions.length; i++) {
            if (sessions[i].Id === sessionId) {
                return sessions[i];
            }
        }
        return null;
    }

    // The remote client negotiated its MediaSource before this file existed,
    // so poll the item until the freshly downloaded stream shows up.
    async function findNewSubtitleIndex(itemId, previousIndexes, language, releaseName) {
        var previous = previousIndexes || [];
        for (var attempt = 0; attempt < 20; attempt++) {
            if (attempt > 0) {
                await sleep(300);
            }
            try {
                var snapshot = await getItemSubtitleStreams(itemId);
                var ranked = rankApplyCandidates(snapshot.streams, previous, normalizeLang(language), releaseName);
                for (var i = 0; i < ranked.length; i++) {
                    if (previous.indexOf(ranked[i].stream.Index) === -1) {
                        return ranked[i].stream.Index;
                    }
                }
            } catch (e) {
                console.debug(LOG_PREFIX, 'new subtitle poll failed', e);
            }
        }
        return null;
    }

    async function sendSessionSubtitleIndex(sessionId, index) {
        var api = getApiClient();
        if (!api || typeof api.ajax !== 'function') {
            return false;
        }
        try {
            await api.ajax({
                type: 'POST',
                url: api.getUrl('Sessions/' + sessionId + '/Command'),
                data: JSON.stringify({
                    Name: 'SetSubtitleStreamIndex',
                    Arguments: { Index: String(index) }
                }),
                contentType: 'application/json'
            });
            return true;
        } catch (e) {
            console.debug(LOG_PREFIX, 'remote SetSubtitleStreamIndex failed', e);
            return false;
        }
    }

    // Fallback: replay the same item at the same position with the track
    // pre-selected. Costs a re-buffer but every native client honours it.
    async function restartSessionWithSubtitle(ctx, index) {
        var api = getApiClient();
        if (!api || typeof api.ajax !== 'function') {
            return false;
        }

        var position = ctx.positionTicks || 0;
        var live = await refreshSession(ctx.sessionId);
        if (live && live.PlayState && live.PlayState.PositionTicks) {
            position = live.PlayState.PositionTicks;
        }

        try {
            await api.ajax({
                type: 'POST',
                url: api.getUrl('Sessions/' + ctx.sessionId + '/Playing', {
                    playCommand: 'PlayNow',
                    itemIds: ctx.itemId,
                    startPositionTicks: position,
                    subtitleStreamIndex: index
                })
            });
            return true;
        } catch (e) {
            console.debug(LOG_PREFIX, 'remote restart failed', e);
            return false;
        }
    }

    async function applySubtitleToRemoteSession(ctx, index) {
        if (await sendSessionSubtitleIndex(ctx.sessionId, index)) {
            for (var attempt = 0; attempt < 6; attempt++) {
                await sleep(400);
                var live = await refreshSession(ctx.sessionId);
                if (live && live.PlayState && live.PlayState.SubtitleStreamIndex === index) {
                    return 'command';
                }
            }
        }

        if (await restartSessionWithSubtitle(ctx, index)) {
            return 'restart';
        }
        return null;
    }

    async function getSstConfig() {
        if (cachedConfig) {
            return cachedConfig;
        }
        var defaults = {
            EnableRemoteBanner: true,
            EnableDetailButton: false,
            EnableCastTargeting: true
        };
        var api = getApiClient();
        if (!api || typeof api.getPluginConfiguration !== 'function') {
            cachedConfig = defaults;
            return cachedConfig;
        }
        try {
            var config = await api.getPluginConfiguration(PLUGIN_ID);
            cachedConfig = {
                EnableRemoteBanner: config.EnableRemoteBanner !== false,
                EnableDetailButton: config.EnableDetailButton === true,
                EnableCastTargeting: config.EnableCastTargeting !== false
            };
        } catch (e) {
            console.debug(LOG_PREFIX, 'plugin config unavailable, using defaults', e);
            cachedConfig = defaults;
        }
        return cachedConfig;
    }

    // When the user has cast to another device, jellyfin-web swaps in a
    // non-local player whose id is the target session id. Point SST there
    // instead of at the (idle) local player.
    function getCastPlayerSessionId() {
        var pbm = getPlaybackManager();
        if (!pbm) {
            return null;
        }
        try {
            var player = null;
            if (typeof pbm.getCurrentPlayer === 'function') {
                player = pbm.getCurrentPlayer();
            } else if (typeof pbm.getPlayer === 'function') {
                player = pbm.getPlayer();
            }
            if (player && player.isLocalPlayer === false) {
                return player.id || player.Id || null;
            }
        } catch (e) {
            console.debug(LOG_PREFIX, 'cast player lookup failed', e);
        }
        return null;
    }

    async function getCastSessionContext() {
        var sessionId = getCastPlayerSessionId();
        if (!sessionId) {
            return null;
        }
        var session = await refreshSession(sessionId);
        if (session && session.NowPlayingItem) {
            return contextFromSession(session);
        }
        return null;
    }

    // Resolution order: an explicit target, then a cast target, then whatever
    // is playing locally. Returns the same shape everywhere so the search and
    // download paths do not need to care.
    async function resolveContext(explicitContext) {
        if (explicitContext) {
            return explicitContext;
        }
        var config = await getSstConfig();
        if (config.EnableCastTargeting) {
            var cast = await getCastSessionContext();
            if (cast) {
                return cast;
            }
        }
        return await getPlayingContext();
    }
    async function turnOffAllSubtitles() {
        stopSstOverlay();
        sstOverlayCues = [];
        hidePlayerSubtitleOverlay();
        await tryPlayerSetSubtitleIndex(-1);
        await trySessionSetSubtitleIndex(-1);
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
            releaseSstPlaybackControl();
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

    function formatSubtitleResult(sub, index, alreadyOwned) {
        var badges = [];
        if (alreadyOwned) {
            badges.push('<span class="sst-badge sst-badge-owned">In library</span>');
        }
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
        var rowClass = 'sst-result' + (alreadyOwned ? ' sst-result-downloaded' : '');
        var btnClass = 'sst-btn sst-btn-download' + (alreadyOwned ? ' sst-btn-already' : '');
        var btnLabel = alreadyOwned ? '✓' : '⬇';
        var btnTitle = alreadyOwned ? 'Already downloaded' : 'Download';
        var disabledAttr = alreadyOwned ? ' disabled' : '';

        return '<div class="' + rowClass + '" data-subtitle-id="' + escapeHtml(sub.Id) + '">' +
            '  <div class="sst-result-header">' +
            '    <div class="sst-result-index">' + (index + 1) + '</div>' +
            '    <div class="sst-result-title">' + escapeHtml(releaseName) + '</div>' +
            '    <button type="button" class="' + btnClass + '" data-subtitle-id="' + escapeHtml(sub.Id) +
            '" data-name="' + escapeHtml(releaseName) + '" title="' + btnTitle + '"' + disabledAttr + '>' + btnLabel + '</button>' +
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

    async function showFindDialog(contextOverride) {
        await mountDialog(buildFindDialogHtml, function (dialog, playing, languageOptions) {
            bindFindDialogEvents(dialog, playing, languageOptions);
            if (playing && playing.itemId) {
                performSearch(playing, dialog.querySelector('#sst-language').value, dialog, languageOptions);
            }
        }, contextOverride);
    }

    async function showOffsetDialog() {
        await mountDialog(buildOffsetDialogHtml, function (dialog) {
            bindOffsetDialogEvents(dialog);
            updateOffsetDisplay(dialog);
        });
    }

    function contextHeadline(playing) {
        if (!playing || !playing.itemId) {
            return escapeHtml('Start playback to search subtitles for the current title.');
        }
        var html = escapeHtml(playing.title);
        if (playing.remote) {
            html += '<span class="sst-target-chip">Playing on ' + escapeHtml(playing.deviceName) + '</span>';
        } else if (playing.library) {
            html += '<span class="sst-target-chip">Library only &mdash; nothing is playing</span>';
        }
        return html;
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
            contextHeadline(playing) +
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

    async function mountDialog(htmlBuilder, afterMount, contextOverride) {
        closeDialog(true);

        isDialogOpen = true;
        removeRemoteBanner();
        var playing = await resolveContext(contextOverride);
        resetOffsetIfItemChanged(playing ? playing.itemId : null);
        var languages = await getLanguageChoices();

        var dialog = document.createElement('div');
        dialog.id = 'sst-dialog';
        dialog.className = 'sst-dialog';
        dialog.innerHTML = htmlBuilder(playing, languages);

        dismissBlockingOverlays();
        getOverlayParent().appendChild(dialog);
        if (isTvLayout()) {
            dialog.classList.add('sst-dialog-tv');
        }
        dialog.classList.add('sst-dialog-open');
        requestAnimationFrame(function () {
            dismissBlockingOverlays();
            dialog.classList.add('sst-dialog-open');
            var focusTarget = dialog.querySelector('#sst-search-btn') ||
                dialog.querySelector('.sst-btn-offset') ||
                dialog.querySelector('#sst-close-btn');
            if (focusTarget && typeof focusTarget.focus === 'function') {
                focusTarget.focus();
            }
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
            if (isBackKey(e)) {
                e.preventDefault();
                closeDialog();
                document.removeEventListener('keydown', keyHandler, true);
            }
        };
        document.addEventListener('keydown', keyHandler, true);
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
            playing = await resolveContext(null);
            if (playing && playing.itemId) {
                var mediaInfo = dialog.querySelector('#sst-media-info');
                if (mediaInfo) {
                    mediaInfo.innerHTML = contextHeadline(playing);
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

            var existingStreams = [];
            try {
                existingStreams = ((await getItemSubtitleStreams(playing.itemId)).streams) || [];
            } catch (e) {
                existingStreams = [];
            }

            var html = '';
            for (var i = 0; i < results.length; i++) {
                html += formatSubtitleResult(
                    results[i],
                    i,
                    isRemoteSubtitleAlreadyOwned(
                        playing.itemId,
                        results[i].Id,
                        results[i].Name || results[i].Comment || '',
                        language,
                        existingStreams
                    )
                );
            }
            resultsEl.innerHTML = html;

            var downloadBtns = resultsEl.querySelectorAll('.sst-btn-download');
            for (var j = 0; j < downloadBtns.length; j++) {
                if (downloadBtns[j].disabled) {
                    continue;
                }
                downloadBtns[j].addEventListener('click', function (e) {
                    e.stopPropagation();
                    performDownload(
                        playing,
                        this.getAttribute('data-subtitle-id'),
                        this,
                        dialog,
                        dialog.querySelector('#sst-language').value,
                        this.getAttribute('data-name') || ''
                    );
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

    async function performDownload(playing, subtitleId, button, dialog, preferredLanguage, releaseName) {
        var originalHtml = button.innerHTML;
        var statusEl = dialog.querySelector('#sst-status');
        var language = normalizeLang(preferredLanguage || (dialog.querySelector('#sst-language') && dialog.querySelector('#sst-language').value) || 'eng');
        var flightKey = playing.itemId + '|' + subtitleId;

        if (button.disabled || inFlightDownloads[flightKey]) {
            return;
        }

        inFlightDownloads[flightKey] = true;
        button.disabled = true;
        button.innerHTML = '…';

        try {
            var existingStreams = [];
            try {
                existingStreams = ((await getItemSubtitleStreams(playing.itemId)).streams) || [];
            } catch (e) {
                existingStreams = [];
            }

            if (isRemoteSubtitleAlreadyOwned(playing.itemId, subtitleId, releaseName, language, existingStreams)) {
                markResultRowDownloaded(button);
                statusEl.innerHTML = 'This subtitle is already in the library. It will not be downloaded again.';
                statusEl.className = 'sst-status sst-status-success';
                statusEl.style.display = 'block';
                return;
            }
            var previousIndexes = existingStreams.map(function (s) {
                return s.Index;
            });

            // Remote and library targets have no local <video> to paint cues
            // onto, so they skip the overlay path entirely.
            if (playing.remote || playing.library) {
                await downloadSubtitle(playing.itemId, subtitleId);
                markSubtitleDownloaded(playing.itemId, subtitleId, releaseName, language);
                markResultRowDownloaded(button);
                statusEl.className = 'sst-status sst-status-success';
                statusEl.style.display = 'block';

                if (playing.library) {
                    statusEl.innerHTML = 'Downloaded to the library. It will be available the next time this title plays.';
                    return;
                }

                statusEl.innerHTML = 'Downloaded. Sending to ' + escapeHtml(playing.deviceName) + '&hellip;';

                var newIndex = await findNewSubtitleIndex(playing.itemId, previousIndexes, language, releaseName);
                if (newIndex === null) {
                    statusEl.innerHTML = 'Downloaded to the library, but the new track did not appear in time. Open the subtitle menu on ' +
                        escapeHtml(playing.deviceName) + ' and pick it there.';
                    statusEl.className = 'sst-status sst-status-error';
                    return;
                }

                var how = await applySubtitleToRemoteSession(playing, newIndex);
                if (how === 'command') {
                    statusEl.innerHTML = 'Subtitle applied on ' + escapeHtml(playing.deviceName) + '.';
                } else if (how === 'restart') {
                    statusEl.innerHTML = 'Subtitle applied on ' + escapeHtml(playing.deviceName) +
                        '. Playback resumed from the same spot so the new track could load.';
                } else {
                    statusEl.innerHTML = 'Downloaded to the library, but ' + escapeHtml(playing.deviceName) +
                        ' did not accept the change. Open the subtitle menu there and pick it manually.';
                    statusEl.className = 'sst-status sst-status-error';
                }
                return;
            }

            var existingSignatures = {};
            try {
                existingSignatures = await snapshotExistingVtts(
                    playing.itemId,
                    playing.mediaSourceId,
                    existingStreams
                );
            } catch (e) {
                existingSignatures = {};
            }
            await downloadSubtitle(playing.itemId, subtitleId);
            markSubtitleDownloaded(playing.itemId, subtitleId, releaseName, language);
            markResultRowDownloaded(button);
            statusEl.innerHTML = 'Downloaded. Applying to this playback…';
            statusEl.className = 'sst-status sst-status-success';
            statusEl.style.display = 'block';

            var activated = await activateDownloadedTrack(
                playing.itemId,
                playing.mediaSourceId,
                previousIndexes,
                language,
                releaseName,
                existingSignatures
            );
            if (activated) {
                statusEl.innerHTML = 'Subtitle downloaded and applied. Other tracks were turned off for this playback.';
                playing.subtitleCount = previousIndexes.length + 1;
            } else {
                statusEl.innerHTML = 'Subtitle downloaded to the library, but it could not be applied automatically. Open the CC menu and select the new track.';
            }
        } catch (error) {
            button.disabled = false;
            button.innerHTML = originalHtml;
            button.classList.remove('sst-btn-already');
            statusEl.innerHTML = escapeHtml(getErrorMessage(error));
            statusEl.className = 'sst-status sst-status-error';
            statusEl.style.display = 'block';
        } finally {
            delete inFlightDownloads[flightKey];
        }
    }

    /* ---------------------------------------------------------------
       REMOTE ENTRY POINTS
       The CC menu only exists during local playback, so a phone driving
       a TV needs its own way into the picker.
       --------------------------------------------------------------- */

    function removeRemoteBanner() {
        var existing = document.getElementById(REMOTE_BANNER_ID);
        if (existing && existing.parentNode) {
            existing.parentNode.removeChild(existing);
        }
    }

    function isLocalPlaybackActive() {
        if (getCastPlayerSessionId()) {
            return false;
        }
        var pbm = getPlaybackManager();
        try {
            if (pbm && typeof pbm.isPlayingVideo === 'function') {
                return pbm.isPlayingVideo();
            }
        } catch (e) {
            console.debug(LOG_PREFIX, 'local playback check failed', e);
        }
        return !!document.querySelector('video.htmlvideoplayer');
    }

    function renderRemoteBanner(session) {
        var existing = document.getElementById(REMOTE_BANNER_ID);
        if (existing && existing.getAttribute('data-session-id') === session.Id) {
            return;
        }
        removeRemoteBanner();

        var banner = document.createElement('div');
        banner.id = REMOTE_BANNER_ID;
        banner.className = 'sst-remote-banner';
        banner.setAttribute('data-session-id', session.Id);
        banner.innerHTML =
            '<button type="button" class="sst-remote-open">' +
            '<span class="sst-remote-glyph">' + FIND_SUBTITLES_LABEL.split(' ')[0] + '</span>' +
            '<span class="sst-remote-text">' +
            '<span class="sst-remote-title">Find subtitles for ' + escapeHtml(sessionLabel(session)) + '</span>' +
            '<span class="sst-remote-sub">' + escapeHtml(formatTitle(session.NowPlayingItem)) + '</span>' +
            '</span>' +
            '</button>' +
            '<button type="button" class="sst-remote-dismiss" title="Hide" aria-label="Hide">&#10005;</button>';

        banner.querySelector('.sst-remote-open').addEventListener('click', function () {
            showFindDialog(contextFromSession(session));
        });
        banner.querySelector('.sst-remote-dismiss').addEventListener('click', function () {
            dismissedSessions[session.Id] = true;
            removeRemoteBanner();
        });

        document.body.appendChild(banner);
    }

    async function pollRemoteSessions() {
        if (isDialogOpen || document.hidden || isLocalPlaybackActive()) {
            removeRemoteBanner();
            return;
        }

        var config = await getSstConfig();
        if (!config.EnableRemoteBanner) {
            removeRemoteBanner();
            return;
        }

        var sessions = await listRemoteSessions();
        var pick = null;
        for (var i = 0; i < sessions.length; i++) {
            if (!dismissedSessions[sessions[i].Id]) {
                pick = sessions[i];
                break;
            }
        }

        if (pick) {
            renderRemoteBanner(pick);
        } else {
            removeRemoteBanner();
        }
    }

    function safePollRemoteSessions() {
        pollRemoteSessions().catch(function (e) {
            console.debug(LOG_PREFIX, 'remote session poll failed', e);
        });
    }

    function startRemoteSessionWatch() {
        if (remotePollTimer) {
            return;
        }
        remotePollTimer = setInterval(safePollRemoteSessions, REMOTE_POLL_MS);
        safePollRemoteSessions();
    }

    function stopRemoteSessionWatch() {
        if (remotePollTimer) {
            clearInterval(remotePollTimer);
            remotePollTimer = null;
        }
        removeRemoteBanner();
    }

    /* ---------------------------------------------------------------
       ITEM DETAIL BUTTON
       Off by default. Fetches subtitles for a title before anyone
       starts watching it.
       --------------------------------------------------------------- */

    function getDetailPageItemId() {
        var hash = window.location.hash || '';
        if (hash.indexOf('details') === -1) {
            return null;
        }
        var match = /[?&]id=([^&]+)/.exec(hash);
        return match ? decodeURIComponent(match[1]) : null;
    }

    function removeDetailButton() {
        var stale = document.querySelectorAll('.' + DETAIL_BTN_CLASS);
        for (var i = 0; i < stale.length; i++) {
            if (stale[i].parentNode) {
                stale[i].parentNode.removeChild(stale[i]);
            }
        }
    }

    async function buildLibraryContext(itemId) {
        var api = getApiClient();
        var title = 'Selected title';
        var count = 0;
        try {
            var userId = typeof api.getCurrentUserId === 'function' ? api.getCurrentUserId() : '';
            var item = await api.getItem(userId, itemId);
            title = formatTitle(item);
            count = countSubtitleStreams(item);
        } catch (e) {
            console.debug(LOG_PREFIX, 'detail item lookup failed', e);
        }
        return {
            itemId: itemId,
            mediaSourceId: itemId,
            title: title,
            sessionId: null,
            subtitleCount: count,
            remote: false,
            library: true
        };
    }

    async function openDetailPicker(itemId) {
        var ctx = await resolveContext(null);
        if (!ctx || ctx.itemId !== itemId) {
            ctx = await buildLibraryContext(itemId);
        }
        showFindDialog(ctx);
    }

    async function injectDetailButton() {
        var config = await getSstConfig();
        if (!config.EnableDetailButton) {
            removeDetailButton();
            return;
        }

        var itemId = getDetailPageItemId();
        if (!itemId) {
            removeDetailButton();
            return;
        }

        var host = document.querySelector('.mainDetailButtons');
        if (!host) {
            return;
        }

        var existing = host.querySelector('.' + DETAIL_BTN_CLASS);
        if (existing) {
            if (existing.getAttribute('data-item-id') === itemId) {
                return;
            }
            if (existing.parentNode) {
                existing.parentNode.removeChild(existing);
            }
        }

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'detailButton emby-button ' + DETAIL_BTN_CLASS;
        btn.setAttribute('data-item-id', itemId);
        btn.title = FIND_SUBTITLES_LABEL;
        btn.innerHTML =
            '<div class="detailButton-content">' +
            '<span class="sst-detail-glyph">' + FIND_SUBTITLES_LABEL.split(' ')[0] + '</span>' +
            '<div class="detailButton-text">Subtitles</div>' +
            '</div>';
        btn.addEventListener('click', function () {
            openDetailPicker(itemId);
        });
        host.appendChild(btn);
    }

    function scheduleDetailButtonScan() {
        if (detailScanTimer) {
            return;
        }
        detailScanTimer = setTimeout(function () {
            detailScanTimer = null;
            injectDetailButton().catch(function (e) {
                console.debug(LOG_PREFIX, 'detail button inject failed', e);
            });
        }, 150);
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
        return /subtitle|podnaslov|titlov|sous-titr|untertitel|sottotitol|napisy|felirat|undertext|ondertitel/.test(title);
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

        item.setAttribute('tabindex', '0');
        item.addEventListener('click', onActivate);
        item.addEventListener('keydown', function (e) {
            if (isActivateKey(e)) {
                onActivate(e);
            }
        });

        return item;

        function onActivate(e) {
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) {
                e.stopImmediatePropagation();
            }
            closeActionSheet(item.closest('.actionSheet') || item.closest('.dialog'));
            setTimeout(onOpen, 50);
        }
    }

    function bindNativeTrackClicks(sheet) {
        if (sheet.getAttribute('data-sst-native-bound') === '1') {
            return;
        }
        sheet.setAttribute('data-sst-native-bound', '1');
        var onNativeTrack = function (e) {
            var target = e.target;
            if (!target || !target.closest) {
                return;
            }
            var item = target.closest('.actionSheetMenuItem');
            if (!item) {
                return;
            }
            var id = item.getAttribute('data-id');
            if (id === FIND_SUBTITLES_ID || id === OFFSET_ID) {
                return;
            }
            releaseSstPlaybackControl();
        };
        sheet.addEventListener('click', onNativeTrack, true);
        sheet.addEventListener('keydown', function (e) {
            if (isActivateKey(e)) {
                onNativeTrack(e);
            }
        }, true);
    }

    function injectSstMenuItems(sheet) {
        if (!isSubtitleTrackActionSheet(sheet)) {
            return;
        }

        bindNativeTrackClicks(sheet);

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
            scheduleConstrainActionSheet(sheet);
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

        if (injected) {
            console.info(LOG_PREFIX, 'Injected SST items at top of subtitle action sheet');
        }
        scheduleConstrainActionSheet(sheet);
    }

    function scheduleConstrainActionSheet(sheet) {
        [0, 16, 50, 120, 250, 500, 900].forEach(function (delay) {
            setTimeout(function () {
                constrainActionSheetScroller(sheet);
            }, delay);
        });
    }

    function getOsdBottomLimit() {
        var viewportH = (window.visualViewport && window.visualViewport.height) || window.innerHeight || 0;
        var limit = viewportH - 8;
        var osd = document.querySelector('.videoOsdBottom');
        if (!osd || osd.classList.contains('hide')) {
            return limit;
        }
        var osdRect = osd.getBoundingClientRect();
        if (osdRect.top > 40 && osdRect.top < viewportH - 24 && osdRect.height > 16) {
            return osdRect.top - 8;
        }
        return limit;
    }

    function isPopoverActionSheet(sheet) {
        var rect = sheet.getBoundingClientRect();
        var vw = window.innerWidth || 0;
        return vw > 0 && rect.width > 0 && rect.width < vw * 0.72;
    }

    function clearSheetConstraint(sheet) {
        if (!sheet) {
            return;
        }
        sheet.classList.remove('sst-cc-constrained');
        sheet.style.removeProperty('transform');
        sheet.style.removeProperty('max-height');
        sheet.style.removeProperty('overflow');
        var scroller = sheet.querySelector('.actionSheetScroller');
        if (scroller) {
            scroller.style.removeProperty('max-height');
            scroller.style.removeProperty('overflow-y');
        }
    }

    function constrainActionSheetScroller(sheet) {
        if (!sheet || !sheet.isConnected) {
            return;
        }

        if (isMobileLayout() || isTvLayout() || !isPopoverActionSheet(sheet)) {
            clearSheetConstraint(sheet);
            return;
        }

        sheet.style.removeProperty('transform');

        var sheetRect = sheet.getBoundingClientRect();
        var bottomLimit = getOsdBottomLimit();
        var overflow = sheetRect.bottom - bottomLimit;
        if (overflow > 1) {
            var maxShift = Math.max(0, sheetRect.top - 8);
            var shift = Math.round(Math.min(overflow, maxShift));
            if (shift > 0) {
                sheet.style.transform = 'translateY(' + (-shift) + 'px)';
            }
        }

        var placed = sheet.getBoundingClientRect();
        var available = Math.floor(bottomLimit - placed.top);
        if (available < 280) {
            return;
        }

        sheet.classList.add('sst-cc-constrained');
        sheet.style.setProperty('max-height', available + 'px', 'important');
        sheet.style.overflow = 'hidden';

        var scroller = sheet.querySelector('.actionSheetScroller');
        if (!scroller) {
            return;
        }

        var title = sheet.querySelector('.actionSheetTitle');
        var topUsed = title ? Math.max(0, title.getBoundingClientRect().bottom - placed.top) : 0;
        var scrollMax = Math.floor(available - topUsed - 8);
        if (scrollMax >= 200) {
            scroller.style.setProperty('max-height', scrollMax + 'px', 'important');
            scroller.style.overflowY = 'auto';
        }
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
        var delays = [0, 40, 120, 300];
        delays.forEach(function (delay) {
            setTimeout(function () {
                scanForSubtitleActionSheets(document);
            }, delay);
        });
    }

    function attachSubtitleButtonListener() {
        if (subtitleButtonListenerAttached) {
            return;
        }

        function maybeFromSubtitleButton(target) {
            return target && target.closest && target.closest('.btnSubtitles');
        }

        document.addEventListener('click', function (e) {
            try {
                if (maybeFromSubtitleButton(e.target)) {
                    onSubtitleButtonClick();
                }
            } catch (err) {
                console.debug(LOG_PREFIX, 'subtitle button listener error', err);
            }
        }, true);

        document.addEventListener('keydown', function (e) {
            try {
                if ((isActivateKey(e) && maybeFromSubtitleButton(document.activeElement)) ||
                    (isActivateKey(e) && maybeFromSubtitleButton(e.target))) {
                    onSubtitleButtonClick();
                }
            } catch (err) {
                console.debug(LOG_PREFIX, 'subtitle button key listener error', err);
            }
        }, true);

        subtitleButtonListenerAttached = true;
    }

    function startActionSheetObserver() {
        if (observer || !document.body) {
            return;
        }

        var scanTimer = null;
        observer = new MutationObserver(function () {
            if (scanTimer) {
                return;
            }
            scanTimer = setTimeout(function () {
                scanTimer = null;
                scanForSubtitleActionSheets(document);
                scheduleDetailButtonScan();
            }, 80);
        });

        observer.observe(document.body, { childList: true, subtree: true });
        scanForSubtitleActionSheets(document);
    }

    function attachNavigationListeners() {
        window.addEventListener('hashchange', function () {
            scheduleDetailButtonScan();
            safePollRemoteSessions();
        });
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) {
                safePollRemoteSessions();
            }
        });
    }

    function initWebInject() {
        attachSubtitleButtonListener();
        startActionSheetObserver();
        attachNavigationListeners();
        startRemoteSessionWatch();
        scheduleDetailButtonScan();
        console.info(LOG_PREFIX, 'Web injection active (v' + SST_VERSION + ')');
    }

    function destroyWebInject() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        subtitleButtonListenerAttached = false;
        stopSstOverlay();
        stopRemoteSessionWatch();
        removeDetailButton();
    }

    window.SST = {
        version: SST_VERSION,
        loaded: true,
        integration: 'web-inject',
        Core: {
            getServerRoot: getServerRoot,
            getPlayingContext: getPlayingContext,
            resolveContext: resolveContext,
            search: searchSubtitles,
            download: downloadSubtitle,
            setOffset: applySubtitleOffset
        },
        Remote: {
            list: listRemoteSessions,
            context: contextFromSession,
            apply: applySubtitleToRemoteSession,
            poll: safePollRemoteSessions
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
