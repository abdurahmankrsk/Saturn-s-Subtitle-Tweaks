/**
 * Saturn's Subtitle Tweaks (SST) — Jellyfin Web Client Module
 *
 * Phase 1: "Find subtitles" in the CC/subtitle action sheet.
 *
 * @license MIT
 */
(function () {
    'use strict';

    if (window.SST && window.SST.loaded) {
        return;
    }

    var SST_VERSION = '1.1.2.0';
    var LOG_PREFIX = '[SST]';
    var FIND_SUBTITLES_ID = 'sst-find-subtitles';
    var FIND_SUBTITLES_LABEL = 'Find subtitles';
    var INJECTED_ITEM_CLASS = 'sst-find-subtitles-item';

    var isDialogOpen = false;
    var observer = null;
    var subtitleButtonListenerAttached = false;

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
            setTimeout(showStubDialog, 100);
        });

        return item;
    }

    function injectFindSubtitlesIntoSheet(sheet) {
        if (!isSubtitleTrackActionSheet(sheet)) {
            return;
        }

        if (sheet.querySelector('.' + INJECTED_ITEM_CLASS) ||
            sheet.querySelector('[data-id="' + FIND_SUBTITLES_ID + '"]')) {
            return;
        }

        var scroller = sheet.querySelector('.actionSheetScroller') || sheet;
        scroller.appendChild(createFindSubtitlesMenuItem(sheet));
        console.info(LOG_PREFIX, 'Injected "' + FIND_SUBTITLES_LABEL + '" into subtitle action sheet');
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

    function initWebInject() {
        attachSubtitleButtonListener();
        startActionSheetObserver();
        console.info(LOG_PREFIX, 'Web injection active (v' + SST_VERSION + '). Type SST in the console to verify.');
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
        Core: { getServerRoot: getServerRoot },
        UI: { show: showStubDialog, close: closeStubDialog },
        Integration: { init: initWebInject, destroy: destroyWebInject }
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
