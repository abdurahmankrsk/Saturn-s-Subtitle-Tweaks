/**
 * Saturn's Subtitle Tweaks (SST) — Jellyfin Web Client Module
 *
 * Provides:
 * - In-player subtitle search via Jellyfin's existing subtitle API
 * - Language selection
 * - Multiple search results with rich metadata
 * - One-click subtitle downloading
 * - Fine-grained subtitle offset controls (session-only)
 *
 * SECURITY: This module contains NO API keys, credentials, or provider secrets.
 * All subtitle operations go through Jellyfin's authenticated REST API,
 * which delegates to server-side subtitle providers configured by the admin.
 *
 * @license MIT
 */
(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════
    // AUTO-INJECT STYLESHEET IF MISSING
    // ═══════════════════════════════════════════════════════════════
    if (!document.getElementById('sst-client-style')) {
        var styleLink = document.createElement('link');
        styleLink.id = 'sst-client-style';
        styleLink.rel = 'stylesheet';
        styleLink.href = '/sst/ClientStyle';
        document.head.appendChild(styleLink);
    }

    // ═══════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════

    const SST_VERSION = '1.0.4';

    // Common languages with ISO 639-2/B three-letter codes
    const COMMON_LANGUAGES = [
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
        { code: 'bul', name: 'Bulgarian' },
        { code: 'hrv', name: 'Croatian' },
        { code: 'srp', name: 'Serbian' },
        { code: 'bos', name: 'Bosnian' },
        { code: 'slv', name: 'Slovenian' },
        { code: 'gre', name: 'Greek' },
        { code: 'heb', name: 'Hebrew' },
        { code: 'tha', name: 'Thai' },
        { code: 'vie', name: 'Vietnamese' },
        { code: 'ind', name: 'Indonesian' },
        { code: 'may', name: 'Malay' },
        { code: 'ukr', name: 'Ukrainian' }
    ];

    // ═══════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════

    let currentOffset = 0;
    let isDialogOpen = false;
    let currentItemId = null;
    let currentMediaSourceId = null;

    // ═══════════════════════════════════════════════════════════════
    // API HELPERS
    // ═══════════════════════════════════════════════════════════════

    function getApiClient() {
        if (typeof ApiClient !== 'undefined') return ApiClient;
        if (window.ApiClient) return window.ApiClient;
        if (window.ConnectionManager && window.ConnectionManager.getApiClient) {
            try { return window.ConnectionManager.getApiClient(); } catch (e) {}
        }
        return null;
    }

    function getPlaybackManager() {
        if (window.Emby && window.Emby.PlaybackManager) return window.Emby.PlaybackManager;
        if (window.playbackManager) return window.playbackManager;
        return null;
    }

    async function getCurrentPlayingItemAsync() {
        var api = getApiClient();

        // 1. Try playbackManager
        var pbm = getPlaybackManager();
        if (pbm) {
            var item = null;
            try {
                if (typeof pbm.currentItem === 'function') item = pbm.currentItem();
                else if (typeof pbm.getCurrentPlayingItem === 'function') item = pbm.getCurrentPlayingItem();
            } catch (e) {}

            if (item && item.Id) {
                var mediaSource = null;
                try {
                    if (typeof pbm.currentMediaSource === 'function') mediaSource = pbm.currentMediaSource();
                    else if (typeof pbm.getMediaSource === 'function') mediaSource = pbm.getMediaSource();
                } catch (e) {}

                return {
                    itemId: item.Id,
                    mediaSourceId: mediaSource ? mediaSource.Id : item.Id,
                    serverId: item.ServerId || (api ? api.serverId() : ''),
                    title: formatItemTitle(item)
                };
            }
        }

        // 2. Try URL params
        var urlParams = new URLSearchParams(window.location.search || window.location.hash.split('?')[1] || '');
        var paramId = urlParams.get('id') || urlParams.get('itemId');
        if (paramId && api) {
            try {
                var fetchedItem = await api.getItem(api.getCurrentUserId ? api.getCurrentUserId() : '', paramId);
                if (fetchedItem && fetchedItem.Id) {
                    return {
                        itemId: fetchedItem.Id,
                        mediaSourceId: fetchedItem.Id,
                        serverId: fetchedItem.ServerId || api.serverId(),
                        title: formatItemTitle(fetchedItem)
                    };
                }
            } catch (e) {}
        }

        // 3. Try tracking state
        if (currentItemId) {
            return {
                itemId: currentItemId,
                mediaSourceId: currentMediaSourceId || currentItemId,
                serverId: api ? api.serverId() : '',
                title: ''
            };
        }

        // 4. Try Sessions API for current device
        if (api && typeof api.getSessions === 'function') {
            try {
                var sessions = await api.getSessions();
                if (sessions && sessions.length) {
                    var active = sessions.find(function (s) { return s.NowPlayingItem; });
                    if (active && active.NowPlayingItem) {
                        return {
                            itemId: active.NowPlayingItem.Id,
                            mediaSourceId: active.NowPlayingItem.Id,
                            serverId: api.serverId(),
                            title: formatItemTitle(active.NowPlayingItem)
                        };
                    }
                }
            } catch (e) {}
        }

        return null;
    }

    function formatItemTitle(item) {
        if (!item) return 'Media Item';
        var title = item.Name || '';
        if (item.SeriesName) {
            title = item.SeriesName;
            if (item.ParentIndexNumber !== undefined && item.IndexNumber !== undefined) {
                title += ' S' + String(item.ParentIndexNumber).padStart(2, '0') +
                         'E' + String(item.IndexNumber).padStart(2, '0');
            }
            if (item.Name) title += ' - ' + item.Name;
        }
        return title || item.Name || 'Now Playing';
    }

    async function searchSubtitles(itemId, language) {
        var api = getApiClient();
        if (!api) throw new Error('Jellyfin API client not available');
        var url = api.getUrl('/Items/' + itemId + '/RemoteSearch/Subtitles/' + language);
        return await api.getJSON(url) || [];
    }

    async function downloadSubtitle(itemId, subtitleId) {
        var api = getApiClient();
        if (!api) throw new Error('Jellyfin API client not available');
        var url = api.getUrl('/Items/' + itemId + '/RemoteSearch/Subtitles/' + subtitleId);
        await api.ajax({ type: 'POST', url: url });
    }

    // ═══════════════════════════════════════════════════════════════
    // UI: DIALOG CREATION
    // ═══════════════════════════════════════════════════════════════

    function createSearchDialog(title) {
        var dialog = document.createElement('div');
        dialog.id = 'sst-dialog';
        dialog.classList.add('sst-dialog');

        var languageOptions = COMMON_LANGUAGES.map(function (lang) {
            return '<option value="' + lang.code + '">' + lang.name + '</option>';
        }).join('');

        dialog.innerHTML =
            '<div class="sst-dialog-backdrop" id="sst-backdrop"></div>' +
            '<div class="sst-dialog-content">' +
            '  <div class="sst-dialog-header">' +
            '    <h2 class="sst-dialog-title"><span class="sst-planet-icon">🪐</span> Saturn\'s Subtitles</h2>' +
            '    <button class="sst-close-btn" id="sst-close-btn" title="Close">✕</button>' +
            '  </div>' +
            '  <div class="sst-dialog-body">' +
            '    <div class="sst-media-info" id="sst-media-info">' +
            '      🎬 ' + escapeHtml(title || 'Currently Playing Media') +
            '    </div>' +
            '    <div class="sst-search-controls">' +
            '      <div class="sst-language-row">' +
            '        <label class="sst-label" for="sst-language">Language</label>' +
            '        <select id="sst-language" class="sst-select">' +
                       languageOptions +
            '        </select>' +
            '      </div>' +
            '      <button id="sst-search-btn" class="sst-btn sst-btn-primary">' +
            '        🔍 Search' +
            '      </button>' +
            '    </div>' +
            '    <div id="sst-status" class="sst-status" style="display:none;"></div>' +
            '    <div id="sst-results" class="sst-results"></div>' +
            '  </div>' +
            '  <div class="sst-dialog-footer">' +
            '    <div class="sst-offset-controls" id="sst-offset-section">' +
            '      <div class="sst-offset-label">' +
            '        ⏱️ Subtitle delay: <span id="sst-offset-value">0.0s</span>' +
            '      </div>' +
            '      <div class="sst-offset-buttons">' +
            '        <button class="sst-btn sst-btn-offset" data-offset="-0.5">-0.5s</button>' +
            '        <button class="sst-btn sst-btn-offset" data-offset="-0.1">-0.1s</button>' +
            '        <button class="sst-btn sst-btn-offset sst-btn-reset" data-offset="0">Reset</button>' +
            '        <button class="sst-btn sst-btn-offset" data-offset="0.1">+0.1s</button>' +
            '        <button class="sst-btn sst-btn-offset" data-offset="0.5">+0.5s</button>' +
            '      </div>' +
            '    </div>' +
            '  </div>' +
            '</div>';

        return dialog;
    }

    function formatSubtitleResult(sub, index) {
        var badges = [];
        if (sub.IsHashMatch) badges.push('<span class="sst-badge sst-badge-hash">Hash Match</span>');
        if (sub.IsForced) badges.push('<span class="sst-badge sst-badge-forced">Forced</span>');
        if (sub.HearingImpaired) badges.push('<span class="sst-badge sst-badge-sdh">SDH</span>');
        if (sub.MachineTranslated) badges.push('<span class="sst-badge sst-badge-mt">Machine Translated</span>');
        if (sub.AiTranslated) badges.push('<span class="sst-badge sst-badge-ai">AI Translated</span>');

        var metaItems = [];
        if (sub.ProviderName) metaItems.push('<span class="sst-meta-item">☁️ ' + escapeHtml(sub.ProviderName) + '</span>');
        if (sub.Format) metaItems.push('<span class="sst-meta-item">📄 ' + escapeHtml(sub.Format.toUpperCase()) + '</span>');
        if (sub.FrameRate && sub.FrameRate > 0) metaItems.push('<span class="sst-meta-item">⚡ ' + sub.FrameRate.toFixed(3) + ' FPS</span>');
        if (sub.DownloadCount && sub.DownloadCount > 0) metaItems.push('<span class="sst-meta-item">⬇️ ' + formatNumber(sub.DownloadCount) + '</span>');
        if (sub.CommunityRating && sub.CommunityRating > 0) metaItems.push('<span class="sst-meta-item">★ ' + sub.CommunityRating.toFixed(1) + '</span>');
        if (sub.Author) metaItems.push('<span class="sst-meta-item">👤 ' + escapeHtml(sub.Author) + '</span>');

        var releaseName = sub.Name || sub.Comment || ('Subtitle ' + (index + 1));

        return '<div class="sst-result" data-subtitle-id="' + escapeHtml(sub.Id) + '">' +
            '  <div class="sst-result-header">' +
            '    <div class="sst-result-index">' + (index + 1) + '</div>' +
            '    <div class="sst-result-title">' + escapeHtml(releaseName) + '</div>' +
            '    <button class="sst-btn sst-btn-download" data-subtitle-id="' + escapeHtml(sub.Id) + '" title="Download this subtitle">⬇️</button>' +
            '  </div>' +
            (badges.length > 0 ? '  <div class="sst-result-badges">' + badges.join('') + '</div>' : '') +
            (metaItems.length > 0 ? '  <div class="sst-result-meta">' + metaItems.join('') + '</div>' : '') +
            (sub.Comment ? '  <div class="sst-result-comment">' + escapeHtml(sub.Comment) + '</div>' : '') +
            '</div>';
    }

    // ═══════════════════════════════════════════════════════════════
    // UI: DIALOG MANAGEMENT
    // ═══════════════════════════════════════════════════════════════

    async function showDialog() {
        if (isDialogOpen) return;

        var playing = await getCurrentPlayingItemAsync();
        var title = playing ? playing.title : 'Now Playing';
        var itemId = playing ? playing.itemId : null;

        isDialogOpen = true;

        var dialog = createSearchDialog(title);
        document.body.appendChild(dialog);

        requestAnimationFrame(function () {
            dialog.classList.add('sst-dialog-open');
        });

        bindDialogEvents(dialog, itemId);
    }

    function closeDialog() {
        var dialog = document.getElementById('sst-dialog');
        if (!dialog) return;

        dialog.classList.remove('sst-dialog-open');
        setTimeout(function () {
            if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
            isDialogOpen = false;
        }, 300);
    }

    function bindDialogEvents(dialog, itemId) {
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
            var language = dialog.querySelector('#sst-language').value;
            performSearch(itemId, language, dialog);
        });

        dialog.querySelector('#sst-language').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                var language = dialog.querySelector('#sst-language').value;
                performSearch(itemId, language, dialog);
            }
        });

        var offsetButtons = dialog.querySelectorAll('.sst-btn-offset');
        for (var i = 0; i < offsetButtons.length; i++) {
            offsetButtons[i].addEventListener('click', function () {
                var offsetValue = parseFloat(this.getAttribute('data-offset'));
                if (offsetValue === 0) currentOffset = 0;
                else currentOffset = Math.round((currentOffset + offsetValue) * 10) / 10;
                applySubtitleOffset(currentOffset);
                updateOffsetDisplay(dialog);
            });
        }

        updateOffsetDisplay(dialog);
    }

    async function performSearch(itemId, language, dialog) {
        var statusEl = dialog.querySelector('#sst-status');
        var resultsEl = dialog.querySelector('#sst-results');
        var searchBtn = dialog.querySelector('#sst-search-btn');

        if (!itemId) {
            // Re-attempt discovery
            var playing = await getCurrentPlayingItemAsync();
            if (playing && playing.itemId) {
                itemId = playing.itemId;
                var mediaInfo = dialog.querySelector('#sst-media-info');
                if (mediaInfo) mediaInfo.textContent = '🎬 ' + playing.title;
            } else {
                statusEl.innerHTML = '⚠️ Please start playing a video first to search subtitles for that title.';
                statusEl.className = 'sst-status sst-status-error';
                statusEl.style.display = 'block';
                return;
            }
        }

        searchBtn.disabled = true;
        searchBtn.innerHTML = '⏳ Searching...';
        statusEl.style.display = 'none';
        resultsEl.innerHTML = '';

        try {
            var results = await searchSubtitles(itemId, language);
            searchBtn.disabled = false;
            searchBtn.innerHTML = '🔍 Search';

            if (!results || results.length === 0) {
                var langName = COMMON_LANGUAGES.find(function (l) { return l.code === language; });
                statusEl.innerHTML = 'No ' + escapeHtml(langName ? langName.name : language) + ' subtitles found.<br><span class="sst-status-hint">Try another language or verify OpenSubtitles credentials in server settings.</span>';
                statusEl.className = 'sst-status sst-status-empty';
                statusEl.style.display = 'block';
                return;
            }

            statusEl.innerHTML = '✅ ' + results.length + ' subtitle' + (results.length !== 1 ? 's' : '') + ' found';
            statusEl.className = 'sst-status sst-status-success';
            statusEl.style.display = 'block';

            var html = '';
            for (var i = 0; i < results.length; i++) html += formatSubtitleResult(results[i], i);
            resultsEl.innerHTML = html;

            var downloadBtns = resultsEl.querySelectorAll('.sst-btn-download');
            for (var j = 0; j < downloadBtns.length; j++) {
                downloadBtns[j].addEventListener('click', function (e) {
                    e.stopPropagation();
                    var subId = this.getAttribute('data-subtitle-id');
                    performDownload(itemId, subId, this, dialog);
                });
            }
        } catch (error) {
            searchBtn.disabled = false;
            searchBtn.innerHTML = '🔍 Search';
            var errorMessage = getErrorMessage(error);
            statusEl.innerHTML = '⚠️ ' + escapeHtml(errorMessage);
            statusEl.className = 'sst-status sst-status-error';
            statusEl.style.display = 'block';
        }
    }

    async function performDownload(itemId, subtitleId, button, dialog) {
        var originalHtml = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '⏳';

        try {
            await downloadSubtitle(itemId, subtitleId);
            button.innerHTML = '✅';
            button.title = 'Downloaded successfully';

            var statusEl = dialog.querySelector('#sst-status');
            statusEl.innerHTML = '✅ Subtitle downloaded! Available in your subtitle tracks.';
            statusEl.className = 'sst-status sst-status-success';
            statusEl.style.display = 'block';
        } catch (error) {
            button.disabled = false;
            button.innerHTML = originalHtml;
            var errorMessage = getErrorMessage(error);
            var statusEl = dialog.querySelector('#sst-status');
            statusEl.innerHTML = '❌ Download failed: ' + escapeHtml(errorMessage);
            statusEl.className = 'sst-status sst-status-error';
            statusEl.style.display = 'block';
        }
    }

    function applySubtitleOffset(offsetSeconds) {
        var pbm = getPlaybackManager();
        if (pbm && typeof pbm.setSubtitleOffset === 'function') {
            pbm.setSubtitleOffset(offsetSeconds);
            return;
        }

        var videoElements = document.querySelectorAll('video');
        for (var i = 0; i < videoElements.length; i++) {
            var video = videoElements[i];
            if (video.textTracks) {
                for (var j = 0; j < video.textTracks.length; j++) {
                    var track = video.textTracks[j];
                    if (track.mode === 'showing' && track.cues) {
                        for (var k = 0; k < track.cues.length; k++) {
                            var cue = track.cues[k];
                            cue.startTime += offsetSeconds;
                            cue.endTime += offsetSeconds;
                        }
                    }
                }
            }
        }
    }

    function updateOffsetDisplay(dialog) {
        var display = dialog.querySelector('#sst-offset-value');
        if (display) {
            var sign = currentOffset > 0 ? '+' : '';
            display.textContent = sign + currentOffset.toFixed(1) + 's';
            if (currentOffset === 0) display.className = '';
            else if (currentOffset > 0) display.className = 'sst-offset-positive';
            else display.className = 'sst-offset-negative';
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // MENU & BUTTON INTEGRATION
    // ═══════════════════════════════════════════════════════════════

    function setupMenuIntegration() {
        var observer = new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var mutation = mutations[i];
                for (var j = 0; j < mutation.addedNodes.length; j++) {
                    var node = mutation.addedNodes[j];
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        checkForSubtitleMenu(node);
                    }
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        setupPlaybackButton();
    }

    function checkForSubtitleMenu(node) {
        var subtitleMenus = [];
        if (node.classList && (
            node.classList.contains('subtitleTrackMenu') ||
            node.classList.contains('trackSelections') ||
            node.id === 'subtitleTrackMenu'
        )) {
            subtitleMenus.push(node);
        }

        var found = node.querySelectorAll ? node.querySelectorAll(
            '.subtitleTrackMenu, .trackSelections, [data-type="subtitle"], .selectSubtitleContainer'
        ) : [];

        for (var i = 0; i < found.length; i++) subtitleMenus.push(found[i]);

        if (node.classList && (node.classList.contains('actionSheet') || node.classList.contains('dialog'))) {
            var hasSubtitleContent = node.querySelector &&
                (node.querySelector('[data-tracktype="Subtitle"]') ||
                 node.textContent.indexOf('Subtitle') >= 0 ||
                 node.textContent.indexOf('subtitle') >= 0);

            if (hasSubtitleContent) subtitleMenus.push(node);
        }

        for (var k = 0; k < subtitleMenus.length; k++) injectFindSubtitlesButton(subtitleMenus[k]);
    }

    function injectFindSubtitlesButton(menu) {
        if (menu.querySelector('.sst-find-btn')) return;

        var btn = document.createElement('button');
        btn.className = 'sst-find-btn';
        btn.innerHTML = '🪐 Find Subtitles (SST)';
        btn.title = 'Search for subtitles online';

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            var closeBtn = menu.querySelector('.btnCloseActionSheet, .btnCancel, [data-action="close"]');
            if (closeBtn) closeBtn.click();
            setTimeout(showDialog, 100);
        });

        btn.style.cssText = 'width:100%;padding:12px 16px;text-align:left;border:none;' +
            'background:transparent;color:inherit;font-size:inherit;cursor:pointer;' +
            'display:flex;align-items:center;border-top:1px solid rgba(255,255,255,0.1);';

        menu.appendChild(btn);
    }

    function setupPlaybackButton() {
        // Keyboard shortcut: Alt+S opens subtitle search
        document.addEventListener('keydown', function (e) {
            if (e.altKey && (e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                showDialog();
            }
        });

        // Check for any active video playback
        var checkPlayback = function () {
            var isOsd = window.location.hash && (
                window.location.hash.indexOf('videoosd') >= 0 ||
                window.location.hash.indexOf('video') >= 0 ||
                window.location.pathname.indexOf('video') >= 0 ||
                window.location.pathname.indexOf('playback') >= 0
            );
            var hasVideo = document.querySelector('video') !== null;

            if (isOsd || hasVideo) {
                showFloatingButton();
            } else {
                hideFloatingButton();
            }
        };

        setInterval(checkPlayback, 1000);
        checkPlayback();
    }

    function showFloatingButton() {
        if (document.getElementById('sst-floating-btn')) return;

        var btn = document.createElement('button');
        btn.id = 'sst-floating-btn';
        btn.className = 'sst-floating-btn';
        btn.innerHTML = '<span style="font-size:24px;line-height:1;">🪐</span>';
        btn.title = 'Saturn\'s Subtitle Tweaks (Alt + S)';
        btn.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:999999;' +
            'width:50px;height:50px;border-radius:50%;border:1px solid rgba(243,156,18,0.4);' +
            'background:linear-gradient(135deg,rgba(0,164,220,0.95),rgba(108,92,231,0.95));' +
            'color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;' +
            'box-shadow:0 4px 16px rgba(0,0,0,0.6),0 0 16px rgba(108,92,231,0.4);';

        btn.addEventListener('click', showDialog);
        document.body.appendChild(btn);
    }

    function hideFloatingButton() {
        var btn = document.getElementById('sst-floating-btn');
        if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
    }

    function setupPlaybackTracking() {
        var events = ['playbackstart', 'playbackstop', 'MediaSourceChanged'];
        events.forEach(function (eventName) {
            document.addEventListener(eventName, function (e) {
                if (eventName === 'playbackstart') {
                    try {
                        var detail = e.detail || {};
                        if (detail.item) currentItemId = detail.item.Id;
                        if (detail.mediaSource) currentMediaSourceId = detail.mediaSource.Id;
                    } catch (err) {}
                    showFloatingButton();
                }
                if (eventName === 'playbackstop' || eventName === 'MediaSourceChanged') {
                    currentOffset = 0;
                    currentItemId = null;
                    currentMediaSourceId = null;
                    hideFloatingButton();
                }
            });
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return String(num);
    }

    function getErrorMessage(error) {
        if (!error) return 'An unknown error occurred.';
        if (error.status === 401 || error.status === 403) return 'Permission denied for subtitle operations.';
        if (error.status === 404) return 'No subtitle provider configured on server.';
        if (error.status === 429) return 'Provider rate limit reached. Try again later.';
        if (error.status >= 500) return 'Server error occurred while searching subtitles.';
        if (error.message) return error.message;
        if (typeof error === 'string') return error;
        return 'An error occurred during subtitle operation.';
    }

    // ═══════════════════════════════════════════════════════════════
    // GLOBAL EXPOSURE & INIT
    // ═══════════════════════════════════════════════════════════════

    window.SST = {
        version: SST_VERSION,
        show: showDialog,
        close: closeDialog,
        search: searchSubtitles,
        download: downloadSubtitle,
        setOffset: applySubtitleOffset
    };

    function init() {
        console.info('[SST] Saturn\'s Subtitle Tweaks v' + SST_VERSION + ' loaded 🪐 (Type SST.show() or press Alt+S)');
        setupPlaybackTracking();
        setupMenuIntegration();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
