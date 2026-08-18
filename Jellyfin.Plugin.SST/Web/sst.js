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

    var SST_VERSION = '1.2.1.0';
    var PLUGIN_ID = 'b3a1c2d4-e5f6-4a89-9bcd-1234567890ab';
    var LOG_PREFIX = '[SST]';
    var FIND_SUBTITLES_ID = 'sst-find-subtitles';
    var FIND_SUBTITLES_LABEL = 'Find subtitles';
    var INJECTED_ITEM_CLASS = 'sst-find-subtitles-item';

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

    async function activateDownloadedTrack(itemId, previousCount) {
        var api = getApiClient();
        if (!api || typeof api.getItem !== 'function') {
            return false;
        }

        var userId = typeof api.getCurrentUserId === 'function' ? api.getCurrentUserId() : '';
        var latest = null;

        for (var attempt = 0; attempt < 12; attempt++) {
            await sleep(500);
            try {
                var item = await api.getItem(userId, itemId);
                var subs = (item.MediaStreams || []).filter(function (s) {
                    return s.Type === 'Subtitle';
                });
                if (subs.length > previousCount) {
                    latest = subs[subs.length - 1];
                    break;
                }
            } catch (e) {
                console.debug(LOG_PREFIX, 'item refresh failed', e);
            }
        }

        if (!latest) {
            return false;
        }

        var index = latest.Index;
        var pbm = getPlaybackManager();
        if (pbm && typeof pbm.setSubtitleStreamIndex === 'function') {
            try {
                pbm.setSubtitleStreamIndex(index);
                return true;
            } catch (e) {
                console.debug(LOG_PREFIX, 'setSubtitleStreamIndex failed', e);
            }
        }

        var ctx = await getPlayingContext();
        if (ctx && ctx.sessionId && typeof api.ajax === 'function') {
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
            }
        }

        return false;
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

    async function showDialog() {
        if (isDialogOpen) {
            return;
        }

        isDialogOpen = true;
        var playing = await getPlayingContext();
        resetOffsetIfItemChanged(playing ? playing.itemId : null);

        var languages = await getLanguageChoices();
        var languageOptions = languages.options.map(function (lang) {
            var selected = lang.code === languages.selected ? ' selected' : '';
            return '<option value="' + escapeHtml(lang.code) + '"' + selected + '>' + escapeHtml(lang.name) + '</option>';
        }).join('');

        var dialog = document.createElement('div');
        dialog.id = 'sst-dialog';
        dialog.className = 'sst-dialog';
        dialog.innerHTML =
            '<div class="sst-dialog-backdrop" id="sst-backdrop"></div>' +
            '<div class="sst-dialog-content">' +
            '  <div class="sst-dialog-header">' +
            '    <h2 class="sst-dialog-title"><span class="sst-planet-icon">🪐</span> Find subtitles</h2>' +
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
            '  <div class="sst-dialog-footer">' +
            '    <div class="sst-offset-controls">' +
            '      <div class="sst-offset-label">Subtitle delay: <span id="sst-offset-value">0.0s</span> <span class="sst-status-hint">(this playback only)</span></div>' +
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

        document.body.appendChild(dialog);
        requestAnimationFrame(function () {
            dialog.classList.add('sst-dialog-open');
        });

        bindDialogEvents(dialog, playing, languages.options);
        updateOffsetDisplay(dialog);

        if (playing && playing.itemId) {
            performSearch(playing, dialog.querySelector('#sst-language').value, dialog, languages.options);
        }
    }

    function closeDialog() {
        var dialog = document.getElementById('sst-dialog');
        if (!dialog) {
            isDialogOpen = false;
            return;
        }

        dialog.classList.remove('sst-dialog-open');
        setTimeout(function () {
            if (dialog.parentNode) {
                dialog.parentNode.removeChild(dialog);
            }
            isDialogOpen = false;
        }, 250);
    }

    function bindDialogEvents(dialog, playing, languageOptions) {
        dialog.querySelector('#sst-close-btn').addEventListener('click', closeDialog);
        dialog.querySelector('#sst-backdrop').addEventListener('click', closeDialog);

        var keyHandler = function (e) {
            if (e.key === 'Escape') {
                closeDialog();
                document.removeEventListener('keydown', keyHandler);
            }
        };
        document.addEventListener('keydown', keyHandler);

        dialog.querySelector('#sst-search-btn').addEventListener('click', function () {
            performSearch(playing, dialog.querySelector('#sst-language').value, dialog, languageOptions);
        });

        dialog.querySelector('#sst-language').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                performSearch(playing, dialog.querySelector('#sst-language').value, dialog, languageOptions);
            }
        });

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
            var previousCount = playing.subtitleCount || 0;
            await downloadSubtitle(playing.itemId, subtitleId);
            button.innerHTML = '✓';
            statusEl.innerHTML = 'Downloaded. Activating subtitle track…';
            statusEl.className = 'sst-status sst-status-success';
            statusEl.style.display = 'block';

            var activated = await activateDownloadedTrack(playing.itemId, previousCount);
            if (activated) {
                statusEl.innerHTML = 'Subtitle downloaded and selected. You can adjust timing below.';
                playing.subtitleCount = previousCount + 1;
            } else {
                statusEl.innerHTML = 'Subtitle downloaded. Re-open the CC menu and select the new track if it is not already on.';
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

    function closeActionSheet(sheet) {
        if (!sheet) {
            return;
        }

        try {
            var closeBtn = sheet.querySelector('.btnCloseActionSheet');
            if (closeBtn) {
                closeBtn.click();
                return;
            }

            var backdrops = document.querySelectorAll('.dialogBackdrop, .dialogBackdropOpened');
            for (var i = 0; i < backdrops.length; i++) {
                backdrops[i].click();
            }

            if (sheet.isConnected) {
                sheet.remove();
            }
        } catch (e) {
            console.debug(LOG_PREFIX, 'closeActionSheet failed', e);
        }
    }

    function createFindSubtitlesMenuItem(sheet) {
        var sample = sheet.querySelector('.actionSheetMenuItem');
        var item;

        if (sample) {
            item = sample.cloneNode(true);
            item.classList.add(INJECTED_ITEM_CLASS);
            item.setAttribute('data-id', FIND_SUBTITLES_ID);
            item.removeAttribute('autofocus');
            item.removeAttribute('autoFocus');

            var textEl = item.querySelector('.listItemBodyText') || item.querySelector('.listItemBody');
            if (textEl) {
                textEl.textContent = FIND_SUBTITLES_LABEL;
            } else {
                item.textContent = FIND_SUBTITLES_LABEL;
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
            item.className = 'listItem listItem-button actionSheetMenuItem ' + INJECTED_ITEM_CLASS;
            item.setAttribute('data-id', FIND_SUBTITLES_ID);
            var body = document.createElement('div');
            body.className = 'listItemBody';
            var text = document.createElement('div');
            text.className = 'listItemBodyText';
            text.textContent = FIND_SUBTITLES_LABEL;
            body.appendChild(text);
            item.appendChild(body);
        }

        item.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            closeActionSheet(item.closest('.actionSheet'));
            setTimeout(showDialog, 100);
        });

        return item;
    }

    function injectFindSubtitlesIntoSheet(sheet) {
        if (!isSubtitleTrackActionSheet(sheet)) {
            return;
        }

        if (sheet.querySelector('.' + INJECTED_ITEM_CLASS) ||
            sheet.querySelector('[data-id="' + FIND_SUBTITLES_ID + '"]')) {
            fitActionSheetToViewport(sheet);
            return;
        }

        var scroller = sheet.querySelector('.actionSheetScroller') ||
            sheet.querySelector('.actionSheetContent') ||
            sheet;
        var item = createFindSubtitlesMenuItem(sheet);
        var firstItem = scroller.querySelector('.actionSheetMenuItem');
        if (firstItem && firstItem.parentNode) {
            firstItem.parentNode.insertBefore(item, firstItem);
        } else if (scroller.firstElementChild) {
            scroller.insertBefore(item, scroller.firstElementChild);
        } else {
            scroller.appendChild(item);
        }
        fitActionSheetToViewport(sheet);
        [0, 50, 160].forEach(function (delay) {
            setTimeout(function () {
                fitActionSheetToViewport(sheet);
            }, delay);
        });
        console.info(LOG_PREFIX, 'Injected "' + FIND_SUBTITLES_LABEL + '" at top of subtitle action sheet');
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
                injectFindSubtitlesIntoSheet(scope);
            }

            if (scope.querySelectorAll) {
                var sheets = scope.querySelectorAll('.actionSheet');
                for (var i = 0; i < sheets.length; i++) {
                    injectFindSubtitlesIntoSheet(sheets[i]);
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
            show: showDialog,
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
