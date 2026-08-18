/**
 * Saturn's Subtitle Tweaks (SST) — Jellyfin Web Client Module
 *
 * Phase 1: injection-only POC — "Find subtitles" in the CC/subtitle action sheet.
 *
 * Architecture (designed for future jellyfin-web native integration):
 *   SST.Core        — shared API/helpers (Phase 2+)
 *   SST.UI          — dialogs and presentation (callable without injection)
 *   SST.Integration — web-inject hooks (replaceable when patching jellyfin-web)
 *
 * SECURITY: No API keys, credentials, or provider secrets in this file.
 *
 * @license MIT
 */
(function () {
    'use strict';

    var SST_VERSION = '1.1.1.0';
    var PLUGIN_ID = 'b3a1c2d4-e5f6-4a89-9bcd-1234567890ab';
    var LOG_PREFIX = '[SST]';
    var FIND_SUBTITLES_ID = 'sst-find-subtitles';
    var FIND_SUBTITLES_LABEL = 'Find subtitles';
    var INJECTED_ITEM_CLASS = 'sst-find-subtitles-item';

    var isDialogOpen = false;
    var observer = null;
    var subtitleButtonListenerAttached = false;

    function getApiClient() {
        if (typeof ApiClient !== 'undefined') {
            return ApiClient;
        }
        if (window.ApiClient) {
            return window.ApiClient;
        }
        return null;
    }

    function loadPluginConfiguration() {
        var api = getApiClient();
        if (!api || typeof api.getPluginConfiguration !== 'function') {
            return Promise.resolve({ EnableSSTUI: true });
        }

        return api.getPluginConfiguration(PLUGIN_ID).catch(function () {
            return { EnableSSTUI: true };
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // BOOT — ensure stylesheet is present (fallback if index.html injection missed)
    // ═══════════════════════════════════════════════════════════════

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
        link.href = getServerRoot() + '/sst/ClientStyle';
        document.head.appendChild(link);
    }

  // ═══════════════════════════════════════════════════════════════
    // SST.UI — presentation layer (future: import from jellyfin-web without injection)
    // ═══════════════════════════════════════════════════════════════

    function showStubDialog() {
        if (isDialogOpen) {
            return;
        }

        isDialogOpen = true;

        var dialog = document.createElement('div');
        dialog.id = 'sst-dialog';
        dialog.className = 'sst-dialog';
        dialog.innerHTML =
            '<div class="sst-dialog-backdrop" id="sst-backdrop"></div>' +
            '<div class="sst-dialog-content">' +
            '  <div class="sst-dialog-header">' +
            '    <h2 class="sst-dialog-title"><span class="sst-planet-icon">🪐</span> Saturn\'s Subtitle Tweaks</h2>' +
            '    <button type="button" class="sst-close-btn" id="sst-close-btn" title="Close" aria-label="Close">✕</button>' +
            '  </div>' +
            '  <div class="sst-dialog-body">' +
            '    <p class="sst-stub-message">Phase 1 proof of concept</p>' +
            '    <p class="sst-stub-detail">You opened SST from the subtitle menu during playback. Subtitle search and download will be added in Phase 2.</p>' +
            '  </div>' +
            '</div>';

        document.body.appendChild(dialog);

        requestAnimationFrame(function () {
            dialog.classList.add('sst-dialog-open');
        });

        dialog.querySelector('#sst-close-btn').addEventListener('click', closeStubDialog);
        dialog.querySelector('#sst-backdrop').addEventListener('click', closeStubDialog);

        var onKeyDown = function (e) {
            if (e.key === 'Escape') {
                closeStubDialog();
                document.removeEventListener('keydown', onKeyDown);
            }
        };
        document.addEventListener('keydown', onKeyDown);
    }

    function closeStubDialog() {
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

    // ═══════════════════════════════════════════════════════════════
    // SST.Integration — Jellyfin 10.11.x action sheet hooks (injection-only)
    // ═══════════════════════════════════════════════════════════════

    /**
     * A subtitle track action sheet always includes the "Off" option (stream Index -1).
     * This is more reliable than matching translated titles or obsolete class names.
     */
    function isSubtitleTrackActionSheet(sheet) {
        if (!sheet || !sheet.classList || !sheet.classList.contains('actionSheet')) {
            return false;
        }

        return sheet.querySelector('.actionSheetMenuItem[data-id="-1"]') !== null;
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

            var backdrops = document.querySelectorAll('.dialogBackdrop');
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

    function createFindSubtitlesMenuItem() {
        var item = document.createElement('button');
        item.type = 'button';
        item.className = 'listItem listItem-button actionSheetMenuItem ' + INJECTED_ITEM_CLASS;
        item.setAttribute('data-id', FIND_SUBTITLES_ID);
        item.setAttribute('is', 'emby-button');

        var textWrap = document.createElement('div');
        textWrap.className = 'listItemBody actionsheet-xlargeFont';
        textWrap.textContent = FIND_SUBTITLES_LABEL;
        item.appendChild(textWrap);

        item.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            var sheet = item.closest('.actionSheet');
            closeActionSheet(sheet);
            setTimeout(showStubDialog, 100);
        });

        return item;
    }

    function injectFindSubtitlesIntoSheet(sheet) {
        if (!isSubtitleTrackActionSheet(sheet)) {
            return;
        }

        if (sheet.querySelector('.' + INJECTED_ITEM_CLASS)) {
            return;
        }

        var scroller = sheet.querySelector('.actionSheetScroller');
        if (!scroller) {
            return;
        }

        var divider = document.createElement('div');
        divider.className = 'sst-action-sheet-divider';
        divider.setAttribute('aria-hidden', 'true');

        scroller.appendChild(divider);
        scroller.appendChild(createFindSubtitlesMenuItem());

        console.info(LOG_PREFIX, 'Injected "' + FIND_SUBTITLES_LABEL + '" into subtitle action sheet');
    }

    function scanForSubtitleActionSheets(root) {
        var scope = root || document;
        var sheets;

        try {
            if (scope.classList && scope.classList.contains('actionSheet')) {
                injectFindSubtitlesIntoSheet(scope);
                return;
            }

            sheets = scope.querySelectorAll('.actionSheet');
            for (var i = 0; i < sheets.length; i++) {
                injectFindSubtitlesIntoSheet(sheets[i]);
            }
        } catch (e) {
            console.debug(LOG_PREFIX, 'scanForSubtitleActionSheets failed', e);
        }
    }

    function onSubtitleButtonClick() {
        // Action sheet is rendered asynchronously after the CC button handler runs.
        requestAnimationFrame(function () {
            setTimeout(function () {
                scanForSubtitleActionSheets(document);
            }, 0);
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
                    if (node.nodeType !== Node.ELEMENT_NODE) {
                        continue;
                    }
                    scanForSubtitleActionSheets(node);
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function initWebInject() {
        attachSubtitleButtonListener();
        startActionSheetObserver();
        console.info(LOG_PREFIX, 'Web injection active (v' + SST_VERSION + ')');
    }

    function destroyWebInject() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        subtitleButtonListenerAttached = false;
    }

    // ═══════════════════════════════════════════════════════════════
    // SST.Core — placeholder for Phase 2+ (API helpers, playback context)
    // ═══════════════════════════════════════════════════════════════

    var Core = {
        getServerRoot: getServerRoot
    };

    // ═══════════════════════════════════════════════════════════════
    // Global export — jellyfin-web native integration can call SST.UI directly
    // ═══════════════════════════════════════════════════════════════

    window.SST = {
        version: SST_VERSION,
        loaded: true,
        integration: 'web-inject',
        Core: Core,
        UI: {
            show: showStubDialog,
            close: closeStubDialog
        },
        Integration: {
            init: initWebInject,
            destroy: destroyWebInject
        }
    };

    function init() {
        ensureStylesheet();

        loadPluginConfiguration().then(function (config) {
            if (config && config.EnableSSTUI === false) {
                console.info(LOG_PREFIX, 'SST UI disabled in plugin configuration');
                return;
            }
            initWebInject();
        }).catch(function () {
            initWebInject();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
