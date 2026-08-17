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
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════

    const SST_VERSION = '1.0.0';
    const SST_ID = 'sst-plugin';

    // Common languages with ISO 639-2/B three-letter codes
    // These are used as the default set; the language selector also allows
    // any language Jellyfin supports.
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

    /**
     * Get the Jellyfin ApiClient instance.
     * @returns {object|null} The ApiClient or null if not available.
     */
    function getApiClient() {
        // Jellyfin Web exposes ApiClient globally or via window.ApiClient
        if (typeof ApiClient !== 'undefined') {
            return ApiClient;
        }
        if (window.ApiClient) {
            return window.ApiClient;
        }
        return null;
    }

    /**
     * Get the playback manager instance.
     * @returns {object|null}
     */
    function getPlaybackManager() {
        // Jellyfin Web exposes playbackManager via various paths
        if (window.Emby && window.Emby.PlaybackManager) {
            return window.Emby.PlaybackManager;
        }
        // Try the module import path used in newer Jellyfin Web
        if (window.playbackManager) {
            return window.playbackManager;
        }
        return null;
    }

    /**
     * Get currently playing item information from the playback manager.
     * @returns {{ itemId: string, mediaSourceId: string, serverId: string, title: string } | null}
     */
    function getCurrentPlayingItem() {
        var api = getApiClient();
        if (!api) return null;

        // Try multiple approaches to get current playing item
        var pbm = getPlaybackManager();

        // Approach 1: playbackManager.currentItem()
        if (pbm) {
            var item = null;
            try {
                if (typeof pbm.currentItem === 'function') {
                    item = pbm.currentItem();
                } else if (typeof pbm.getCurrentPlayingItem === 'function') {
                    item = pbm.getCurrentPlayingItem();
                }
            } catch (e) {
                console.debug('[SST] Error getting current item from playbackManager:', e);
            }

            if (item && item.Id) {
                var mediaSource = null;
                try {
                    if (typeof pbm.currentMediaSource === 'function') {
                        mediaSource = pbm.currentMediaSource();
                    } else if (typeof pbm.getMediaSource === 'function') {
                        mediaSource = pbm.getMediaSource();
                    }
                } catch (e) {
                    console.debug('[SST] Error getting media source:', e);
                }

                var title = item.Name || '';
                if (item.SeriesName) {
                    title = item.SeriesName;
                    if (item.ParentIndexNumber !== undefined && item.IndexNumber !== undefined) {
                        title += ' S' + String(item.ParentIndexNumber).padStart(2, '0') +
                                 'E' + String(item.IndexNumber).padStart(2, '0');
                    }
                    if (item.Name) {
                        title += ' - ' + item.Name;
                    }
                }

                return {
                    itemId: item.Id,
                    mediaSourceId: mediaSource ? mediaSource.Id : item.Id,
                    serverId: item.ServerId || api.serverId(),
                    title: title
                };
            }
        }

        // Approach 2: parse from URL
        // URL patterns: /video?... or /#!/videoosd.html
        if (currentItemId) {
            return {
                itemId: currentItemId,
                mediaSourceId: currentMediaSourceId || currentItemId,
                serverId: api.serverId(),
                title: ''
            };
        }

        return null;
    }

    /**
     * Search for remote subtitles using Jellyfin's API.
     * @param {string} itemId - The item ID.
     * @param {string} language - Three-letter ISO language code.
     * @returns {Promise<Array>} Array of RemoteSubtitleInfo objects.
     */
    async function searchSubtitles(itemId, language) {
        var api = getApiClient();
        if (!api) throw new Error('Jellyfin API client not available');

        var url = api.getUrl('/Items/' + itemId + '/RemoteSearch/Subtitles/' + language);

        var response = await api.getJSON(url);
        return response || [];
    }

    /**
     * Download a remote subtitle and attach it to the item.
     * @param {string} itemId - The item ID.
     * @param {string} subtitleId - The subtitle ID from RemoteSubtitleInfo.
     * @returns {Promise<void>}
     */
    async function downloadSubtitle(itemId, subtitleId) {
        var api = getApiClient();
        if (!api) throw new Error('Jellyfin API client not available');

        var url = api.getUrl('/Items/' + itemId + '/RemoteSearch/Subtitles/' + subtitleId);

        await api.ajax({
            type: 'POST',
            url: url
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // UI: DIALOG CREATION
    // ═══════════════════════════════════════════════════════════════

    /**
     * Create the SST search dialog HTML.
     * @param {string} title - Current media title for display.
     * @returns {HTMLElement}
     */
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
            '    <h2 class="sst-dialog-title">Find Subtitles</h2>' +
            '    <button class="sst-close-btn" id="sst-close-btn" title="Close">' +
            '      <span class="material-icons">close</span>' +
            '    </button>' +
            '  </div>' +
            '  <div class="sst-dialog-body">' +
            '    <div class="sst-media-info" id="sst-media-info">' +
            '      <span class="material-icons" style="font-size:1.1em;margin-right:4px;">movie</span> ' +
                   escapeHtml(title || 'Unknown media') +
            '    </div>' +
            '    <div class="sst-search-controls">' +
            '      <div class="sst-language-row">' +
            '        <label class="sst-label" for="sst-language">Language</label>' +
            '        <select id="sst-language" class="sst-select">' +
                       languageOptions +
            '        </select>' +
            '      </div>' +
            '      <button id="sst-search-btn" class="sst-btn sst-btn-primary">' +
            '        <span class="material-icons" style="font-size:1.1em;margin-right:4px;">search</span>' +
            '        Search' +
            '      </button>' +
            '    </div>' +
            '    <div id="sst-status" class="sst-status" style="display:none;"></div>' +
            '    <div id="sst-results" class="sst-results"></div>' +
            '  </div>' +
            '  <div class="sst-dialog-footer">' +
            '    <div class="sst-offset-controls" id="sst-offset-section">' +
            '      <div class="sst-offset-label">' +
            '        <span class="material-icons" style="font-size:1em;margin-right:4px;">timer</span>' +
            '        Subtitle delay: <span id="sst-offset-value">0.0s</span>' +
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

    /**
     * Format a subtitle result into an HTML card.
     * @param {object} sub - RemoteSubtitleInfo from Jellyfin API.
     * @param {number} index - Result index.
     * @returns {string} HTML string.
     */
    function formatSubtitleResult(sub, index) {
        var badges = [];

        if (sub.IsHashMatch) {
            badges.push('<span class="sst-badge sst-badge-hash">Hash Match</span>');
        }
        if (sub.IsForced) {
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
            metaItems.push('<span class="sst-meta-item"><span class="material-icons sst-meta-icon">cloud</span>' +
                escapeHtml(sub.ProviderName) + '</span>');
        }
        if (sub.Format) {
            metaItems.push('<span class="sst-meta-item"><span class="material-icons sst-meta-icon">description</span>' +
                escapeHtml(sub.Format.toUpperCase()) + '</span>');
        }
        if (sub.FrameRate && sub.FrameRate > 0) {
            metaItems.push('<span class="sst-meta-item"><span class="material-icons sst-meta-icon">speed</span>' +
                sub.FrameRate.toFixed(3) + ' FPS</span>');
        }
        if (sub.DownloadCount && sub.DownloadCount > 0) {
            metaItems.push('<span class="sst-meta-item"><span class="material-icons sst-meta-icon">download</span>' +
                formatNumber(sub.DownloadCount) + '</span>');
        }
        if (sub.CommunityRating && sub.CommunityRating > 0) {
            metaItems.push('<span class="sst-meta-item"><span class="material-icons sst-meta-icon">star</span>' +
                sub.CommunityRating.toFixed(1) + '</span>');
        }
        if (sub.Author) {
            metaItems.push('<span class="sst-meta-item"><span class="material-icons sst-meta-icon">person</span>' +
                escapeHtml(sub.Author) + '</span>');
        }

        var releaseName = sub.Name || sub.Comment || ('Subtitle ' + (index + 1));

        return '<div class="sst-result" data-subtitle-id="' + escapeHtml(sub.Id) + '">' +
            '  <div class="sst-result-header">' +
            '    <div class="sst-result-index">' + (index + 1) + '</div>' +
            '    <div class="sst-result-title">' + escapeHtml(releaseName) + '</div>' +
            '    <button class="sst-btn sst-btn-download" data-subtitle-id="' + escapeHtml(sub.Id) + '" title="Download this subtitle">' +
            '      <span class="material-icons">download</span>' +
            '    </button>' +
            '  </div>' +
            (badges.length > 0 ? '  <div class="sst-result-badges">' + badges.join('') + '</div>' : '') +
            (metaItems.length > 0 ? '  <div class="sst-result-meta">' + metaItems.join('') + '</div>' : '') +
            (sub.Comment ? '  <div class="sst-result-comment">' + escapeHtml(sub.Comment) + '</div>' : '') +
            '</div>';
    }

    // ═══════════════════════════════════════════════════════════════
    // UI: DIALOG MANAGEMENT
    // ═══════════════════════════════════════════════════════════════

    /**
     * Show the SST search dialog.
     */
    function showDialog() {
        if (isDialogOpen) return;

        var playing = getCurrentPlayingItem();
        if (!playing) {
            console.warn('[SST] No item currently playing');
            return;
        }

        isDialogOpen = true;

        var dialog = createSearchDialog(playing.title);
        document.body.appendChild(dialog);

        // Force reflow then animate in
        requestAnimationFrame(function () {
            dialog.classList.add('sst-dialog-open');
        });

        // Bind events
        bindDialogEvents(dialog, playing);
    }

    /**
     * Close the SST search dialog.
     */
    function closeDialog() {
        var dialog = document.getElementById('sst-dialog');
        if (!dialog) return;

        dialog.classList.remove('sst-dialog-open');

        // Wait for animation to complete before removing
        setTimeout(function () {
            if (dialog.parentNode) {
                dialog.parentNode.removeChild(dialog);
            }
            isDialogOpen = false;
        }, 300);
    }

    /**
     * Bind all events for the dialog.
     * @param {HTMLElement} dialog - The dialog element.
     * @param {object} playing - Current playing item info.
     */
    function bindDialogEvents(dialog, playing) {
        // Close button
        dialog.querySelector('#sst-close-btn').addEventListener('click', closeDialog);

        // Backdrop click
        dialog.querySelector('#sst-backdrop').addEventListener('click', closeDialog);

        // Escape key
        var keyHandler = function (e) {
            if (e.key === 'Escape') {
                closeDialog();
                document.removeEventListener('keydown', keyHandler);
            }
        };
        document.addEventListener('keydown', keyHandler);

        // Search button
        dialog.querySelector('#sst-search-btn').addEventListener('click', function () {
            var language = dialog.querySelector('#sst-language').value;
            performSearch(playing.itemId, language, dialog);
        });

        // Enter key in language select triggers search
        dialog.querySelector('#sst-language').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                var language = dialog.querySelector('#sst-language').value;
                performSearch(playing.itemId, language, dialog);
            }
        });

        // Offset buttons
        var offsetButtons = dialog.querySelectorAll('.sst-btn-offset');
        for (var i = 0; i < offsetButtons.length; i++) {
            offsetButtons[i].addEventListener('click', function () {
                var offsetValue = parseFloat(this.getAttribute('data-offset'));
                if (offsetValue === 0) {
                    currentOffset = 0;
                } else {
                    currentOffset = Math.round((currentOffset + offsetValue) * 10) / 10;
                }
                applySubtitleOffset(currentOffset);
                updateOffsetDisplay(dialog);
            });
        }

        // Update offset display to reflect current state
        updateOffsetDisplay(dialog);
    }

    /**
     * Perform a subtitle search and display results.
     * @param {string} itemId - The item ID.
     * @param {string} language - Three-letter language code.
     * @param {HTMLElement} dialog - The dialog element.
     */
    async function performSearch(itemId, language, dialog) {
        var statusEl = dialog.querySelector('#sst-status');
        var resultsEl = dialog.querySelector('#sst-results');
        var searchBtn = dialog.querySelector('#sst-search-btn');

        // Show loading state
        searchBtn.disabled = true;
        searchBtn.innerHTML = '<span class="sst-spinner"></span> Searching...';
        statusEl.style.display = 'none';
        resultsEl.innerHTML = '';

        try {
            var results = await searchSubtitles(itemId, language);

            searchBtn.disabled = false;
            searchBtn.innerHTML = '<span class="material-icons" style="font-size:1.1em;margin-right:4px;">search</span> Search';

            if (!results || results.length === 0) {
                var langName = COMMON_LANGUAGES.find(function (l) { return l.code === language; });
                statusEl.innerHTML =
                    '<span class="material-icons" style="font-size:1.2em;margin-right:6px;">subtitles_off</span>' +
                    'No ' + escapeHtml(langName ? langName.name : language) + ' subtitles found.' +
                    '<br><span class="sst-status-hint">Try another language or check that a subtitle provider is configured.</span>';
                statusEl.className = 'sst-status sst-status-empty';
                statusEl.style.display = 'block';
                return;
            }

            statusEl.innerHTML = results.length + ' subtitle' + (results.length !== 1 ? 's' : '') + ' found';
            statusEl.className = 'sst-status sst-status-success';
            statusEl.style.display = 'block';

            var html = '';
            for (var i = 0; i < results.length; i++) {
                html += formatSubtitleResult(results[i], i);
            }
            resultsEl.innerHTML = html;

            // Bind download buttons
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
            searchBtn.innerHTML = '<span class="material-icons" style="font-size:1.1em;margin-right:4px;">search</span> Search';

            var errorMessage = getErrorMessage(error);
            statusEl.innerHTML =
                '<span class="material-icons" style="font-size:1.2em;margin-right:6px;">error_outline</span>' +
                escapeHtml(errorMessage);
            statusEl.className = 'sst-status sst-status-error';
            statusEl.style.display = 'block';

            console.error('[SST] Search failed:', error);
        }
    }

    /**
     * Download a subtitle and refresh the player's track list.
     * @param {string} itemId - The item ID.
     * @param {string} subtitleId - The subtitle ID.
     * @param {HTMLElement} button - The download button element.
     * @param {HTMLElement} dialog - The dialog element.
     */
    async function performDownload(itemId, subtitleId, button, dialog) {
        var originalHtml = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<span class="sst-spinner"></span>';

        try {
            await downloadSubtitle(itemId, subtitleId);

            button.innerHTML = '<span class="material-icons" style="color:#4caf50;">check_circle</span>';
            button.title = 'Downloaded successfully';

            // Show success status
            var statusEl = dialog.querySelector('#sst-status');
            statusEl.innerHTML =
                '<span class="material-icons" style="font-size:1.2em;margin-right:6px;color:#4caf50;">check_circle</span>' +
                'Subtitle downloaded! It should now appear in your subtitle track list.';
            statusEl.className = 'sst-status sst-status-success';
            statusEl.style.display = 'block';

            // Try to refresh subtitle tracks
            refreshSubtitleTracks();

        } catch (error) {
            button.disabled = false;
            button.innerHTML = originalHtml;

            var errorMessage = getErrorMessage(error);

            var statusEl = dialog.querySelector('#sst-status');
            statusEl.innerHTML =
                '<span class="material-icons" style="font-size:1.2em;margin-right:6px;">error_outline</span>' +
                'Download failed: ' + escapeHtml(errorMessage);
            statusEl.className = 'sst-status sst-status-error';
            statusEl.style.display = 'block';

            console.error('[SST] Download failed:', error);
        }
    }

    /**
     * Try to refresh the player's subtitle track list after download.
     * This may require reloading the media source info.
     */
    function refreshSubtitleTracks() {
        // Attempt to tell the playback manager to refresh media info
        // This is necessary for the newly downloaded subtitle to appear
        var pbm = getPlaybackManager();
        if (!pbm) return;

        try {
            // Try various methods that might exist on the playback manager
            if (typeof pbm.refreshMediaInfo === 'function') {
                pbm.refreshMediaInfo();
            } else if (typeof pbm.getPlaybackMediaSources === 'function') {
                pbm.getPlaybackMediaSources();
            }
        } catch (e) {
            console.debug('[SST] Could not auto-refresh subtitle tracks:', e);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // SUBTITLE OFFSET
    // ═══════════════════════════════════════════════════════════════

    /**
     * Apply subtitle offset to the current playback.
     * Uses Jellyfin Web's built-in subtitle sync mechanism.
     * @param {number} offsetSeconds - Offset in seconds (positive = later, negative = earlier).
     */
    function applySubtitleOffset(offsetSeconds) {
        // Method 1: Use the playback manager's subtitle offset if available
        var pbm = getPlaybackManager();
        if (pbm && typeof pbm.setSubtitleOffset === 'function') {
            pbm.setSubtitleOffset(offsetSeconds);
            return;
        }

        // Method 2: Manipulate the video element's text tracks directly
        var videoElements = document.querySelectorAll('video');
        for (var i = 0; i < videoElements.length; i++) {
            var video = videoElements[i];
            if (video.textTracks) {
                for (var j = 0; j < video.textTracks.length; j++) {
                    var track = video.textTracks[j];
                    if (track.mode === 'showing' && track.cues) {
                        // Note: Modifying cue timing directly is not ideal.
                        // Jellyfin Web typically handles this through its own subtitle sync system.
                        // This is a fallback only.
                        console.debug('[SST] Direct text track offset is a fallback mechanism');
                    }
                }
            }
        }

        // Method 3: Dispatch an event that Jellyfin's subtitle sync might listen to
        try {
            var event = new CustomEvent('subtitleoffsetchange', {
                detail: { offset: offsetSeconds },
                bubbles: true
            });
            document.dispatchEvent(event);
        } catch (e) {
            console.debug('[SST] Could not dispatch offset event:', e);
        }
    }

    /**
     * Update the offset display in the dialog.
     * @param {HTMLElement} dialog - The dialog element.
     */
    function updateOffsetDisplay(dialog) {
        var display = dialog.querySelector('#sst-offset-value');
        if (display) {
            var sign = currentOffset > 0 ? '+' : '';
            display.textContent = sign + currentOffset.toFixed(1) + 's';

            if (currentOffset === 0) {
                display.className = '';
            } else if (currentOffset > 0) {
                display.className = 'sst-offset-positive';
            } else {
                display.className = 'sst-offset-negative';
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // MENU INTEGRATION
    // ═══════════════════════════════════════════════════════════════

    /**
     * Add the "Find Subtitles" button to Jellyfin's subtitle menu.
     * This observes the DOM for the subtitle menu/dialog to appear
     * and injects our button into it.
     */
    function setupMenuIntegration() {
        // Use a MutationObserver to detect when the subtitle menu opens
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

        // Also add a floating button for quick access during playback
        setupPlaybackButton();
    }

    /**
     * Check if the added node is or contains the subtitle menu,
     * and inject our "Find Subtitles" button if so.
     * @param {HTMLElement} node - The newly added DOM node.
     */
    function checkForSubtitleMenu(node) {
        // Jellyfin's subtitle selection appears in dialogs/menus during playback.
        // We look for the track selection menu and add our option.

        // Look for subtitle-related selectors
        var subtitleMenus = [];

        // The OSD subtitle button menu
        if (node.classList && (
            node.classList.contains('subtitleTrackMenu') ||
            node.classList.contains('trackSelections') ||
            node.id === 'subtitleTrackMenu'
        )) {
            subtitleMenus.push(node);
        }

        // Also search within the node
        var found = node.querySelectorAll ? node.querySelectorAll(
            '.subtitleTrackMenu, .trackSelections, [data-type="subtitle"], .selectSubtitleContainer'
        ) : [];

        for (var i = 0; i < found.length; i++) {
            subtitleMenus.push(found[i]);
        }

        // Check for generic dialog/actionSheet containing subtitle tracks
        if (node.classList && (node.classList.contains('actionSheet') || node.classList.contains('dialog'))) {
            var hasSubtitleContent = node.querySelector &&
                (node.querySelector('[data-tracktype="Subtitle"]') ||
                 node.textContent.indexOf('Subtitle') >= 0 ||
                 node.textContent.indexOf('subtitle') >= 0);

            if (hasSubtitleContent) {
                subtitleMenus.push(node);
            }
        }

        for (var k = 0; k < subtitleMenus.length; k++) {
            injectFindSubtitlesButton(subtitleMenus[k]);
        }
    }

    /**
     * Inject the "Find Subtitles" button into a subtitle menu.
     * @param {HTMLElement} menu - The subtitle menu element.
     */
    function injectFindSubtitlesButton(menu) {
        // Don't inject twice
        if (menu.querySelector('.sst-find-btn')) return;

        var btn = document.createElement('button');
        btn.className = 'sst-find-btn';
        btn.innerHTML =
            '<span class="material-icons" style="font-size:1.2em;margin-right:8px;">search</span>' +
            'Find Subtitles (SST)';
        btn.title = 'Search for subtitles online';

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            // Close the current menu if possible
            var closeBtn = menu.querySelector('.btnCloseActionSheet, .btnCancel, [data-action="close"]');
            if (closeBtn) closeBtn.click();

            // Small delay to let the menu close
            setTimeout(showDialog, 100);
        });

        // Style it to match the menu
        btn.style.cssText = 'width:100%;padding:12px 16px;text-align:left;border:none;' +
            'background:transparent;color:inherit;font-size:inherit;cursor:pointer;' +
            'display:flex;align-items:center;border-top:1px solid rgba(255,255,255,0.1);';

        menu.appendChild(btn);
    }

    /**
     * Set up a floating SST button that appears during video playback.
     * This provides an alternative way to access SST without going through
     * the subtitle menu.
     */
    function setupPlaybackButton() {
        // Listen for playback start/stop to show/hide the button
        document.addEventListener('viewshow', function (e) {
            var target = e.target || e.detail;
            if (target && target.id === 'videoOsdPage') {
                showFloatingButton();
            }
        });

        // Also try to detect OSD page via URL
        var checkPlayback = function () {
            var isOsd = window.location.hash && (
                window.location.hash.indexOf('videoosd') >= 0 ||
                window.location.hash.indexOf('video') >= 0
            );
            var isPlaying = document.querySelector('.videoPlayerContainer video');

            if (isOsd || isPlaying) {
                showFloatingButton();
            } else {
                hideFloatingButton();
            }
        };

        // Periodic check as a fallback
        setInterval(checkPlayback, 2000);
    }

    /**
     * Show the floating SST access button.
     */
    function showFloatingButton() {
        if (document.getElementById('sst-floating-btn')) return;

        var btn = document.createElement('button');
        btn.id = 'sst-floating-btn';
        btn.className = 'sst-floating-btn';
        btn.innerHTML = '<span class="material-icons">subtitles</span>';
        btn.title = 'Saturn\'s Subtitle Tweaks';
        btn.addEventListener('click', showDialog);

        document.body.appendChild(btn);
    }

    /**
     * Hide the floating SST access button.
     */
    function hideFloatingButton() {
        var btn = document.getElementById('sst-floating-btn');
        if (btn && btn.parentNode) {
            btn.parentNode.removeChild(btn);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // PLAYBACK STATE TRACKING
    // ═══════════════════════════════════════════════════════════════

    /**
     * Set up listeners to track current playback state
     * and reset offset when playback changes.
     */
    function setupPlaybackTracking() {
        // Listen for Jellyfin playback events
        var events = [
            'playbackstart',
            'playbackstop',
            'MediaSourceChanged'
        ];

        events.forEach(function (eventName) {
            document.addEventListener(eventName, function (e) {
                if (eventName === 'playbackstart') {
                    // Store current item info
                    try {
                        var detail = e.detail || {};
                        if (detail.item) {
                            currentItemId = detail.item.Id;
                        }
                        if (detail.mediaSource) {
                            currentMediaSourceId = detail.mediaSource.Id;
                        }
                    } catch (err) {
                        console.debug('[SST] Error in playbackstart handler:', err);
                    }
                }

                if (eventName === 'playbackstop' || eventName === 'MediaSourceChanged') {
                    // Reset subtitle offset when playback stops or media changes
                    currentOffset = 0;
                    currentItemId = null;
                    currentMediaSourceId = null;
                    hideFloatingButton();
                }
            });
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // UTILITY FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Escape HTML to prevent XSS.
     * @param {string} str - String to escape.
     * @returns {string} Escaped string.
     */
    function escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Format a large number with K/M suffixes.
     * @param {number} num - Number to format.
     * @returns {string} Formatted string.
     */
    function formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return String(num);
    }

    /**
     * Extract a human-readable error message from various error types.
     * @param {*} error - The error object.
     * @returns {string} Human-readable message.
     */
    function getErrorMessage(error) {
        if (!error) return 'An unknown error occurred.';

        // HTTP status code errors
        if (error.status === 401 || error.status === 403) {
            return 'You do not have permission to search for subtitles. ' +
                'Contact your server administrator.';
        }
        if (error.status === 404) {
            return 'No subtitle provider is configured. ' +
                'Ask your server administrator to install a subtitle provider plugin (e.g., Open Subtitles).';
        }
        if (error.status === 429) {
            return 'Subtitle provider rate limit reached. Please try again later.';
        }
        if (error.status >= 500) {
            return 'The server encountered an error. Please try again later.';
        }

        // Network errors
        if (error.message && error.message.indexOf('network') >= 0) {
            return 'Network error. Check your connection and try again.';
        }

        // Fallback
        if (error.message) return error.message;
        if (typeof error === 'string') return error;

        return 'An unexpected error occurred. Check the browser console for details.';
    }

    // ═══════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════════════════════════

    /**
     * Initialize SST when the page is ready.
     */
    function init() {
        console.info('[SST] Saturn\'s Subtitle Tweaks v' + SST_VERSION + ' loaded');

        setupPlaybackTracking();
        setupMenuIntegration();
    }

    // Wait for DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
