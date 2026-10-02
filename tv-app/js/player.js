/**
 * Odtwarzacz AVPlay z fallbackiem HTML5 video.
 */
var Player = (function () {
    'use strict';

    var avplay = null;
    var avObject = null;
    var usingAvplay = false;
    var html5 = null;
    var overlayTimer = null;
    var currentResult = null;
    var onCompleteCallback = null;
    var onErrorCallback = null;
    var state = 'idle';
    var attempts = [];
    var attemptIndex = 0;
    var generation = 0;
    var mp4UsedAvplay = false;

    function init() {
        html5 = document.getElementById('html5-player');
        avObject = document.getElementById('av-player');

        try {
            if (typeof webapis !== 'undefined' && webapis.avplay) {
                avplay = webapis.avplay;
            }
        } catch (e) { /* AVPlay niedostępny */ }
    }

    function play(result, callbacks) {
        stop();
        currentResult = result;
        onCompleteCallback = callbacks.onComplete;
        onErrorCallback = callbacks.onError;
        state = 'preparing';

        updateTime(0, 0);
        updateStatus('');
        showOverlay();

        attempts = [];
        if (result.streamUrl) attempts.push(result.streamUrl);
        if (result.proxyUrl && result.proxyUrl !== result.streamUrl) {
            attempts.push(result.proxyUrl);
        }
        attemptIndex = 0;
        generation++;
        mp4UsedAvplay = false;

        tryNextSource();
    }

    /**
     * Kolejne adresy tego samego strumienia: najpierw wprost, potem przez
     * proxy. Każdy z nich bywa jedynym działającym, zależnie od tego czy
     * serwer pilnuje adresu IP, czy nagłówka Referer.
     */
    function tryNextSource() {
        if (attemptIndex >= attempts.length) {
            handleError(attempts.length > 1
                ? 'Nie udało się połączyć – próbowano bezpośrednio i przez proxy'
                : 'Nie udało się połączyć ze źródłem wideo');
            return;
        }

        updateStatus(attemptIndex === 0 ? 'Łączenie...' : 'Próbuję przez proxy...');

        var url = attempts[attemptIndex++];

        if (avplay && shouldUseAvplay(currentResult)) {
            playAvplay(url);
        } else {
            playHtml5(url);
        }
    }

    function sourceFailed(mine) {
        if (mine !== generation) return;

        // Błąd w trakcie odtwarzania to nie powód, żeby zaczynać od nowa
        // innym adresem – to źródło już się sprawdziło.
        if (state === 'playing') {
            handleError('Odtwarzanie przerwane przez błąd strumienia');
            return;
        }

        if (attemptIndex < attempts.length) {
            resetAvplay();
            usingAvplay = false;
            tryNextSource();
            return;
        }

        resetAvplay();
        usingAvplay = false;

        // Tizen w HTML5 nie odtworzy HLS – kolejny błąd tylko myli komunikat.
        if (currentResult && currentResult.type === 'hls') {
            handleError('AVPlay nie odtworzył tego strumienia HLS');
            return;
        }

        playHtml5(attempts[0]);
    }

    function shouldUseAvplay(result) {
        // Zwykły plik MP4 AVPlay często odrzuca przy prepare. Tizen odtwarza
        // go poprawnie z elementu video – AVPlay zostaje zapasem.
        return result.type === 'hls' || result.type === 'mkv';
    }

    /**
     * Prostokąt i tryb skalowania AVPlay przyjmuje dopiero w stanie READY,
     * czyli po prepare. Wcześniejsze wywołanie jest ignorowane – zostaje
     * dźwięk, a obraz leci poza ekran albo pod nieprzezroczyste tło.
     */
    function applyAvplayDisplay() {
        // Rozmiar aplikacji, nie okna. innerWidth na tym telewizorze bywa
        // mniejsze i zostawia mały prostokąt obrazu na środku panelu.
        var width = 1920;
        var height = 1080;

        document.documentElement.classList.add('av-playing');

        if (avObject) {
            avObject.style.width = '0px';
            avObject.style.height = '0px';
            avObject.style.border = '0';
            avObject.style.outline = 'none';
            avObject.style.overflow = 'hidden';
            avObject.classList.remove('hidden');
        }
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
        parkHtml5();

        try {
            avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
        } catch (e) { /* ignore */ }
        try { avplay.setDisplayRect(0, 0, width, height); } catch (e) { /* ignore */ }
    }

    function parkHtml5() {
        if (!html5 || !html5.parentNode) return;
        html5.classList.add('hidden');
        html5.parentNode.removeChild(html5);
    }

    function restoreHtml5() {
        var container = document.getElementById('player-container');
        if (!html5 || html5.parentNode || !container) return;
        var object = document.getElementById('av-player');
        if (object && object.parentNode === container) {
            container.insertBefore(html5, object.nextSibling);
        } else {
            container.appendChild(html5);
        }
    }

    function playAvplay(streamUrl) {
        var mine = generation;
        usingAvplay = true;
        parkHtml5();
        if (avObject) avObject.classList.remove('hidden');
        document.documentElement.classList.add('av-playing');

        resetAvplay();

        try {
            // AVPlay przyjmuje właściwości strumienia dopiero w stanie IDLE,
            // w który wchodzi po open(). Zmiana kolejności rzuca wyjątkiem.
            avplay.open(streamUrl);

            // Podmiana User-Agent na zwykłym pliku MP4 bywa powodem
            // CONNECTION_FAILED. Używamy jej tylko przy ciasteczku albo
            // gdy strumień i tak idzie przez nasze proxy.
            if (currentResult.userAgent && (currentResult.cookie || isProxied(streamUrl))) {
                avplay.setStreamingProperty('USER_AGENT', currentResult.userAgent);
            }
            if (currentResult.cookie) {
                avplay.setStreamingProperty('COOKIE', currentResult.cookie);
            }

            avplay.setListener({
                onbufferingstart: function () {
                    applyAvplayDisplay();
                    updateStatus('Buforowanie...');
                },
                onbufferingprogress: function (percent) {
                    updateStatus('Buforowanie ' + percent + '%');
                },
                onbufferingcomplete: function () {
                    applyAvplayDisplay();
                    updateStatus('');
                    scheduleHideOverlay();
                },
                oncurrentplaytime: function (time) {
                    updateTime(time, getDuration());
                },
                onstreamcompleted: function () {
                    state = 'completed';
                    if (onCompleteCallback) onCompleteCallback();
                },
                onerror: function () {
                    sourceFailed(mine);
                },
                onevent: function (eventType) {
                    if (eventType === 'PLAYER_MSG_BITRATE_CHANGE') {
                        scheduleHideOverlay();
                    }
                }
            });

            avplay.prepareAsync(function () {
                if (mine !== generation) return;
                state = 'playing';
                avplay.play();
                applyAvplayDisplay();
                updateStatus('');
                scheduleHideOverlay();
            }, function () {
                sourceFailed(mine);
            });
        } catch (e) {
            sourceFailed(mine);
        }
    }

    function resetAvplay() {
        try {
            if (avplay.getState() !== 'NONE') {
                avplay.stop();
                avplay.close();
            }
        } catch (e) { /* instancja jeszcze nie istnieje */ }
    }

    function isProxied(url) {
        return CONFIG.PROXY_URL && url.indexOf(CONFIG.PROXY_URL) === 0;
    }

    function detachHtml5() {
        if (!html5) return;
        html5.onerror = null;
        html5.onloadedmetadata = null;
        html5.ontimeupdate = null;
        html5.onended = null;
        try { html5.pause(); } catch (e) { /* ignore */ }
        html5.removeAttribute('src');
        // load() na pustym src strzela onerror. Nowy plik i tak woła load()
        // po ustawieniu src, więc tu go pomijamy.
    }

    function playHtml5(streamUrl) {
        var mine = generation;
        usingAvplay = false;
        document.documentElement.classList.remove('av-playing');
        if (avObject) avObject.classList.add('hidden');
        restoreHtml5();
        html5.classList.remove('hidden');

        // Najpierw zdejmujemy stare handlery. Inaczej puste load() z stop()
        // odpala onerror już po podpięciu nowego pliku i udaje, że to on padł.
        detachHtml5();
        html5.classList.remove('hidden');

        html5.onloadedmetadata = function () {
            if (mine !== generation) return;
            var playPromise = html5.play();
            if (playPromise && playPromise.catch) {
                playPromise.catch(function () { /* autoplay bywa odrzucany */ });
            }
            state = 'playing';
            updateStatus('');
            scheduleHideOverlay();
        };

        html5.ontimeupdate = function () {
            updateTime(html5.currentTime * 1000, html5.duration * 1000);
        };

        html5.onended = function () {
            state = 'completed';
            if (onCompleteCallback) onCompleteCallback();
        };

        html5.onerror = function () {
            if (mine !== generation) return;
            if (!html5.getAttribute('src')) return;
            if (avplay && currentResult && currentResult.type === 'mp4' && !mp4UsedAvplay) {
                mp4UsedAvplay = true;
                playAvplay(streamUrl);
                return;
            }
            handleError('Nie udało się odtworzyć strumienia');
        };

        html5.src = streamUrl;
        html5.load();
    }

    function togglePlayPause() {
        showOverlay();
        if (usingAvplay && avplay) {
            try {
                var avState = avplay.getState();
                if (avState === 'PLAYING') {
                    avplay.pause();
                    updateStatus('Pauza');
                } else if (avState === 'PAUSED') {
                    avplay.play();
                    updateStatus('');
                }
            } catch (e) { /* ignore */ }
        } else if (html5) {
            if (html5.paused) {
                html5.play();
                updateStatus('');
            } else {
                html5.pause();
                updateStatus('Pauza');
            }
        }
        scheduleHideOverlay();
    }

    function seekForward() {
        seek(CONFIG.SEEK_STEP);
    }

    function seekBackward() {
        seek(-CONFIG.SEEK_STEP);
    }

    function seek(deltaMs) {
        showOverlay();
        if (usingAvplay && avplay) {
            try {
                var current = avplay.getCurrentTime();
                var duration = avplay.getDuration();
                var target = Math.max(0, Math.min(current + deltaMs, duration));
                avplay.seekTo(target);
                updateTime(target, duration);
            } catch (e) { /* ignore */ }
        } else if (html5) {
            html5.currentTime = Math.max(0, html5.currentTime + deltaMs / 1000);
        }
        scheduleHideOverlay();
    }

    function getDuration() {
        if (usingAvplay && avplay) {
            try { return avplay.getDuration(); } catch (e) { return 0; }
        }
        if (html5) return html5.duration * 1000;
        return 0;
    }

    function stop() {
        state = 'idle';
        generation++;
        attempts = [];
        attemptIndex = 0;
        clearOverlayTimer();

        if (avplay) {
            resetAvplay();
        }

        document.documentElement.classList.remove('av-playing');

        if (avObject) {
            avObject.classList.add('hidden');
        }

        if (html5) {
            restoreHtml5();
            detachHtml5();
            html5.classList.add('hidden');
        }

        usingAvplay = false;
        currentResult = null;
    }

    function handleError(msg) {
        state = 'error';
        stop();
        if (onErrorCallback) onErrorCallback(msg);
    }

    function updateStatus(text) {
        var node = document.getElementById('player-status');
        if (!node) return;
        if (!text) {
            node.textContent = '';
            node.classList.add('hidden');
            return;
        }
        node.textContent = text;
        node.classList.remove('hidden');
    }

    function updateTime(current, total) {
        document.getElementById('player-time').textContent =
            Utils.formatTime(current) + ' / ' + Utils.formatTime(total);
        var fill = document.getElementById('player-progress-fill');
        if (!fill) return;
        var ratio = total > 0 ? Math.max(0, Math.min(1, current / total)) : 0;
        fill.style.width = (ratio * 100) + '%';
    }

    function showOverlay() {
        document.getElementById('player-overlay').classList.remove('hidden');
    }

    function scheduleHideOverlay() {
        clearOverlayTimer();
        overlayTimer = setTimeout(function () {
            if (state === 'playing') {
                document.getElementById('player-overlay').classList.add('hidden');
            }
        }, CONFIG.OVERLAY_HIDE_DELAY);
    }

    function clearOverlayTimer() {
        if (overlayTimer) {
            clearTimeout(overlayTimer);
            overlayTimer = null;
        }
    }

    function getState() {
        return state;
    }

    return {
        init: init,
        play: play,
        stop: stop,
        togglePlayPause: togglePlayPause,
        seekForward: seekForward,
        seekBackward: seekBackward,
        getState: getState
    };
})();
