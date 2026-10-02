var Pairing = (function () {
    'use strict';

    var tvId = null;
    var currentCode = null;
    var accepting = true;
    var refreshing = false;
    var heartbeat = null;

    function init(onReady) {
        currentCode = localStorage.getItem('broadcaster.pairCode') || randomCode();
        var label = document.getElementById('room-code');
        if (label) label.textContent = currentCode;
        setConnected(false);

        var refresh = document.getElementById('refresh-code');
        if (refresh) refresh.onclick = refreshCode;
        var language = document.getElementById('language-button');
        if (language && typeof I18n !== 'undefined') language.onclick = function () { I18n.open(); };
        if (typeof I18n !== 'undefined') I18n.apply();

        document.addEventListener('visibilitychange', onVisibility);

        TvAuth.init().then(function (account) {
            tvId = account.uid;
            return claimCode(currentCode);
        }).then(function () {
            if (heartbeat) clearInterval(heartbeat);
            heartbeat = setInterval(beat, 10000);
            if (onReady) onReady(tvId);
        }).catch(function (err) {
            if (label) label.textContent = '------';
            Utils.showToast({
                title: I18n.t('errorTitle'),
                message: err.message
            });
        });
    }

    function setAccepting(value) {
        accepting = !!value;
        beat();
    }

    function setConnected(connected) {
        var pill = document.getElementById('status-pill');
        var label = document.getElementById('qr-hint');
        if (!pill || !label) return;
        if (connected) {
            pill.classList.remove('is-off');
            label.textContent = I18n.t('connected');
        } else {
            pill.classList.add('is-off');
            label.textContent = I18n.t('disconnected');
        }
    }

    function refreshCode() {
        if (refreshing) return;
        refreshing = true;
        var old = currentCode;
        var next = randomCode();
        restDelete(base() + '/codes/' + old)
            .catch(function () {})
            .then(function () { return restDelete(base() + '/tvs/' + tvId + '/trusted'); })
            .catch(function () {})
            .then(function () { return claimCode(next); })
            .then(function () {
                setConnected(false);
                refreshing = false;
            })
            .catch(function () { refreshing = false; });
    }

    function claimCode(code) {
        return restGet(base() + '/codes/' + code).then(function (data) {
            if (data && data.tvId && data.tvId !== tvId) {
                return claimCode(randomCode());
            }
            currentCode = code;
            localStorage.setItem('broadcaster.pairCode', code);
            var label = document.getElementById('room-code');
            if (label) label.textContent = code;
            return restPut(base() + '/codes/' + code, { tvId: tvId, accepting: accepting }).then(beat);
        });
    }

    function beat() {
        if (!tvId || !currentCode || document.hidden) return Promise.resolve();
        return restPut(base() + '/tvs/' + tvId + '/presence', {
            online: true,
            lastSeen: Date.now(),
            code: currentCode,
            accepting: accepting
        });
    }

    function onVisibility() {
        if (document.hidden) {
            restPut(base() + '/tvs/' + tvId + '/presence', {
                online: false,
                lastSeen: Date.now(),
                code: currentCode,
                accepting: false
            });
            return;
        }
        var screen = document.getElementById('screen-pairing');
        setAccepting(!!(screen && screen.classList.contains('active')));
    }

    function updateQueuePreview(items) {
        var preview = document.getElementById('queue-preview');
        var list = document.getElementById('queue-list');
        if (!preview || !list) return;

        if (!items || items.length === 0) {
            preview.classList.add('hidden');
            return;
        }

        preview.classList.remove('hidden');
        list.innerHTML = '';
        for (var i = 0; i < items.length; i++) {
            var li = document.createElement('li');
            li.textContent = Utils.truncate(items[i].url, 80);
            list.appendChild(li);
        }
    }

    function base() {
        return CONFIG.FIREBASE_DB_URL.replace(/\/$/, '');
    }

    function randomCode() {
        var value = Math.floor(Math.random() * 1000000);
        var text = String(value);
        while (text.length < 6) text = '0' + text;
        return text;
    }

    function restGet(url) {
        return TvAuth.token().then(function (token) {
            return new Promise(function (resolve) {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url + '.json?auth=' + token + '&t=' + Date.now(), true);
                xhr.onreadystatechange = function () {
                    if (xhr.readyState !== 4) return;
                    if (xhr.status < 200 || xhr.status >= 300) {
                        resolve(null);
                        return;
                    }
                    try { resolve(JSON.parse(xhr.responseText)); }
                    catch (e) { resolve(null); }
                };
                xhr.send();
            });
        });
    }

    function restPut(url, data) {
        return TvAuth.token().then(function (token) {
            return new Promise(function (resolve, reject) {
                var xhr = new XMLHttpRequest();
                xhr.open('PUT', url + '.json?auth=' + token, true);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.onreadystatechange = function () {
                    if (xhr.readyState === 4) {
                        if (xhr.status >= 200 && xhr.status < 300) resolve();
                        else reject(new Error('PUT failed: ' + xhr.status));
                    }
                };
                xhr.send(JSON.stringify(data));
            });
        });
    }

    function restDelete(url) {
        return TvAuth.token().then(function (token) {
            return new Promise(function (resolve, reject) {
                var xhr = new XMLHttpRequest();
                xhr.open('DELETE', url + '.json?auth=' + token, true);
                xhr.onreadystatechange = function () {
                    if (xhr.readyState === 4) {
                        if (xhr.status >= 200 && xhr.status < 300) resolve();
                        else reject(new Error('DELETE failed: ' + xhr.status));
                    }
                };
                xhr.send();
            });
        });
    }

    return {
        init: init,
        setAccepting: setAccepting,
        setConnected: setConnected,
        updateQueuePreview: updateQueuePreview
    };
})();
