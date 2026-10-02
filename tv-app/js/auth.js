var TvAuth = (function () {
    'use strict';

    var STORE_KEY = 'broadcaster.auth';
    var session = null;
    var starting = null;
    var refreshing = null;

    function init() {
        if (session) return Promise.resolve(session);
        if (starting) return starting;

        var stored = load();
        starting = (stored && stored.refreshToken
            ? refresh(stored)
            : Promise.reject(new Error('no session'))
        ).catch(createAccount).then(function (next) {
            starting = null;
            return next;
        }, function (err) {
            starting = null;
            throw err;
        });

        return starting;
    }

    function uid() {
        return session ? session.uid : null;
    }

    function token() {
        if (!session) return init().then(function (next) { return next.idToken; });
        if (session.expiresAt - 60000 > Date.now()) return Promise.resolve(session.idToken);
        if (refreshing) return refreshing;

        refreshing = refresh(session).then(function (next) {
            refreshing = null;
            return next.idToken;
        }, function (err) {
            refreshing = null;
            throw err;
        });
        return refreshing;
    }

    function createAccount() {
        return postJson(
            'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + CONFIG.FIREBASE_API_KEY,
            { returnSecureToken: true }
        ).then(function (data) {
            return store({
                uid: data.localId,
                idToken: data.idToken,
                refreshToken: data.refreshToken,
                expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000
            });
        });
    }

    function refresh(current) {
        return postForm(
            'https://securetoken.googleapis.com/v1/token?key=' + CONFIG.FIREBASE_API_KEY,
            'grant_type=refresh_token&refresh_token=' + encodeURIComponent(current.refreshToken)
        ).then(function (data) {
            return store({
                uid: data.user_id || current.uid,
                idToken: data.id_token,
                refreshToken: data.refresh_token || current.refreshToken,
                expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000
            });
        });
    }

    function store(next) {
        if (!next.uid || !next.idToken || !next.refreshToken) {
            throw new Error('Firebase nie zwrócił tożsamości telewizora');
        }
        session = next;
        try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch (e) {  }
        return next;
    }

    function load() {
        try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); }
        catch (e) { return null; }
    }

    function postJson(url, body) {
        return send(url, JSON.stringify(body), 'application/json');
    }

    function postForm(url, body) {
        return send(url, body, 'application/x-www-form-urlencoded');
    }

    function send(url, body, contentType) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            xhr.setRequestHeader('Content-Type', contentType);
            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4) return;
                if (xhr.status < 200 || xhr.status >= 300) {
                    reject(new Error('Auth HTTP ' + xhr.status));
                    return;
                }
                try { resolve(JSON.parse(xhr.responseText)); }
                catch (e) { reject(new Error('Auth: zła odpowiedź')); }
            };
            xhr.onerror = function () { reject(new Error('Auth: brak połączenia')); };
            xhr.send(body);
        });
    }

    return {
        init: init,
        uid: uid,
        token: token
    };
})();
