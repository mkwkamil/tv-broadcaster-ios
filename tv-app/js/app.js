/**
 * Główna logika aplikacji Broadcaster.
 */
var App = (function () {
    'use strict';

    var queue = [];
    var processing = false;
    var currentItem = null;
    var pendingQueue = [];

    function init() {
        Player.init();
        Keys.init();

        Pairing.init(function (code) {
            Channel.connect(code, onIncomingUrl);
            Channel.setStatus('idle', { room: code });
        });

        setupPairingKeys();

        Utils.showScreen('screen-pairing');
        Keys.setupFocusNavigation();
    }

    function onIncomingUrl(item) {
        pendingQueue.push(item);
        Pairing.updateQueuePreview(pendingQueue);

        if (!processing) {
            processNext();
        }
    }

    function processNext() {
        if (queue.length === 0 && pendingQueue.length === 0) {
            processing = false;
            goToPairing();
            return;
        }

        if (queue.length === 0) {
            queue = pendingQueue.splice(0);
        }

        if (queue.length === 0) {
            processing = false;
            return;
        }

        processing = true;
        currentItem = queue.shift();
        pendingQueue = pendingQueue.filter(function (item) {
            return item.key !== currentItem.key;
        });
        Pairing.updateQueuePreview(pendingQueue);

        resolveAndPlay(currentItem);
    }

    function resolveAndPlay(item) {
        Player.stop();
        Keys.clear();
        setupPairingKeys();
        Utils.showScreen('screen-pairing');

        Channel.setStatus('resolving', { url: item.url });

        ResolverChain.resolve(item.url, 0, { referer: item.referer }).then(function (result) {
            if (!result || !result.streamUrl) {
                throw new Error('Nie znaleziono strumienia wideo na tej stronie');
            }

            Channel.setStatus('playing', {
                url: item.url,
                stream: result.streamUrl
            });
            Channel.markConsumed(item.key);

            Utils.hideToast();
            Utils.showScreen('screen-player');
            setupPlayerKeys();

            Player.play(result, {
                onComplete: function () {
                    Channel.setStatus('idle');
                    processNext();
                },
                onError: function (msg) {
                    showError(msg);
                }
            });
        }).catch(function (err) {
            Channel.setStatus('error', { url: item.url, message: err.message });
            Channel.markConsumed(item.key);
            showError(err.message);
        });
    }

    function showError(message) {
        Player.stop();
        processing = false;
        var hasMore = queue.length > 0 || pendingQueue.length > 0;
        if (!hasMore) {
            goToPairing();
        }
        Utils.showToast({
            title: 'Wystąpił błąd',
            message: message || 'Nie udało się odtworzyć strumienia'
        });
        if (hasMore) {
            processNext();
        }
    }

    function goToPairing() {
        Player.stop();
        Keys.clear();
        setupPairingKeys();
        Utils.showScreen('screen-pairing');
        Keys.setupFocusNavigation();
        processing = false;
        Channel.setStatus('idle');
    }

    function setupPairingKeys() {
        Keys.on(Keys.KEY.UP, function () { Keys.focusPrev(); return true; });
        Keys.on(Keys.KEY.DOWN, function () { Keys.focusNext(); return true; });
        Keys.on(Keys.KEY.ENTER, function () { Keys.activateFocused(); return true; });
    }

    function setupPlayerKeys() {
        Keys.clear();

        Keys.on(Keys.KEY.ENTER, function () { Player.togglePlayPause(); return true; });
        Keys.on(Keys.KEY.PLAY, function () { Player.togglePlayPause(); return true; });
        Keys.on(Keys.KEY.PAUSE, function () { Player.togglePlayPause(); return true; });
        Keys.on(Keys.KEY.PLAY_PAUSE, function () { Player.togglePlayPause(); return true; });
        Keys.on(Keys.KEY.RIGHT, function () { Player.seekForward(); return true; });
        Keys.on(Keys.KEY.FF, function () { Player.seekForward(); return true; });
        Keys.on(Keys.KEY.LEFT, function () { Player.seekBackward(); return true; });
        Keys.on(Keys.KEY.RW, function () { Player.seekBackward(); return true; });
        Keys.on(Keys.KEY.RETURN, function () { goToPairing(); return true; });
        Keys.on(Keys.KEY.BACK, function () { goToPairing(); return true; });
        Keys.on(Keys.KEY.STOP, function () { goToPairing(); return true; });
    }

    return { init: init };
})();

document.addEventListener('DOMContentLoaded', function () {
    App.init();
});
