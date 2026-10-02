(function () {
    if (window.__broadcasterSniffer) return;
    window.__broadcasterSniffer = true;

    var STREAM_RE = /\.(m3u8|mpd|mp4|mkv|webm)(\?|#|$)/i;
    var STREAM_HINT = /(\.m3u8|\.mpd|\/master\.|\/playlist\.|\/hls\/|\/dash\/|urlset|mpegurl)/i;
    var seen = {};

    function post(payload) {
        try {
            window.webkit.messageHandlers.broadcaster.postMessage(payload);
        } catch (e) { /* native handler missing in Safari preview */ }
    }

    function pathnameOf(url) {
        try {
            return new URL(url, location.href).pathname;
        } catch (e) {
            return String(url || '').split('?')[0];
        }
    }

    function found(url) {
        if (!url || seen[url]) return;
        if (!/^https?:/i.test(url)) return;
        if (/^about:/i.test(location.href)) return;

        var path = pathnameOf(url);
        if (/\.(gif|png|jpe?g|webp|svg|js|css|json|xml|woff2?|ico|html?)$/i.test(path)) return;
        if (!STREAM_RE.test(path) && !STREAM_HINT.test(path)) return;

        seen[url] = true;
        post({ kind: 'stream', url: url, page: String(location.href) });
    }

    function harvest(text, source) {
        if (!text || text.length > 400000) return;
        if (/^\s*#EXTM3U/i.test(text)) found(source);
        var urls = text.match(/https?:\/\/[^\s"'<>\\]+/g) || [];
        for (var i = 0; i < urls.length; i++) {
            found(urls[i].replace(/[),;]+$/, ''));
        }
    }

    var xhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        this.__bcUrl = String(url || '');
        found(this.__bcUrl);
        return xhrOpen.apply(this, arguments);
    };
    var xhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
        this.addEventListener('load', function () {
            found(this.responseURL || this.__bcUrl);
            try {
                if (typeof this.responseText === 'string') harvest(this.responseText, this.responseURL || this.__bcUrl);
            } catch (e) { /* ignore */ }
        });
        return xhrSend.apply(this, arguments);
    };

    var nativeFetch = window.fetch;
    if (nativeFetch) {
        window.fetch = function (input, init) {
            var url = typeof input === 'string' ? input : (input && input.url);
            found(url);
            return nativeFetch.call(this, input, init).then(function (resp) {
                found(resp && resp.url);
                try {
                    var type = (resp.headers && resp.headers.get('content-type')) || '';
                    if (/json|text|javascript|xml|mpegurl/i.test(type) && resp.clone) {
                        resp.clone().text().then(function (body) { harvest(body, resp.url || url); }).catch(function () {});
                    }
                } catch (e) { /* ignore */ }
                return resp;
            });
        };
    }

    function scan() {
        var media = document.querySelectorAll('video, audio, source');
        for (var i = 0; i < media.length; i++) {
            if (media[i].src) found(media[i].src);
            if (media[i].currentSrc) found(media[i].currentSrc);
        }
        try {
            var entries = performance.getEntriesByType('resource');
            for (var j = 0; j < entries.length; j++) found(entries[j].name);
        } catch (e) { /* ignore */ }
    }

    function scanPage() {
        seen = {};
        scan();
        try {
            harvest(document.documentElement ? document.documentElement.innerHTML : '', location.href);
        } catch (e) { /* ignore */ }
        var frames = document.querySelectorAll('iframe');
        for (var i = 0; i < frames.length; i++) {
            try {
                var doc = frames[i].contentDocument;
                if (doc && doc.documentElement) harvest(doc.documentElement.innerHTML, frames[i].src || location.href);
            } catch (e) { /* obca ramka */ }
        }
    }

    window.__broadcasterScan = scanPage;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scan);
    } else {
        scan();
    }
    setInterval(scan, 1500);
})();
