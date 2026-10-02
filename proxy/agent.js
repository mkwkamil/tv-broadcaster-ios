(function () {
    'use strict';

    if (window.__broadcasterAgent) return;
    window.__broadcasterAgent = true;

    var PROXY = '__PROXY_ORIGIN__';
    var PAGE_URL = '__PAGE_URL__';
    var PAGE_PATH = '__PAGE_PATH__';
    var RAW_PATH = '__RAW_PATH__';
    if (PAGE_PATH.indexOf('__') === 0) PAGE_PATH = '/page';
    if (RAW_PATH.indexOf('__') === 0) RAW_PATH = '/raw';

    var HOST = window.top;
    try {
        Object.defineProperty(window, 'top', { configurable: true, get: function () { return window; } });
        Object.defineProperty(window, 'parent', { configurable: true, get: function () { return window; } });
        Object.defineProperty(window, 'opener', { configurable: true, get: function () { return null; } });
    } catch (e) {  }
    var STREAM_RE = /\.(m3u8|mpd|mp4|mkv|webm)(\?|#|$)/i;
    var STREAM_HINT = /(\.m3u8|\.mpd|\/master\.|\/playlist\.|\/hls\/|\/dash\/|urlset|mpegurl)/i;
    var seen = {};

    var LEAVE = [
        'google.com', 'googleapis.com', 'gstatic.com', 'recaptcha.net',
        'hcaptcha.com', 'cloudflare.com', 'challenges.cloudflare.com'
    ];

    function abs(url) {
        try { return new URL(String(url), PAGE_URL).href; } catch (e) { return null; }
    }

    function hostIn(url, list) {
        try {
            var host = new URL(url, PAGE_URL).hostname.toLowerCase();
            for (var i = 0; i < list.length; i++) {
                if (host === list[i] || host.slice(-list[i].length - 1) === '.' + list[i]) {
                    return true;
                }
            }
        } catch (e) {  }
        return false;
    }

    function viaRaw(url) {
        return PROXY + RAW_PATH + '?url=' + encodeURIComponent(url) +
            '&referer=' + encodeURIComponent(PAGE_URL);
    }

    function isOurs(url) {
        return url && url.indexOf(PROXY) === 0;
    }

    function pageTarget(url) {
        var href = abs(url);
        if (!href) return null;
        if (isOurs(href)) {
            try { return new URL(href).searchParams.get('url') || href; } catch (e) { return href; }
        }
        return href;
    }

    function stay(url) {
        var target = pageTarget(url);
        if (!target || !/^https?:/i.test(target)) return;
        tell({ kind: 'navigate', url: target });
    }

    function tell(payload) {
        payload.source = 'broadcaster-agent';
        try { HOST.postMessage(payload, '*'); } catch (e) {  }
    }

    function found(url) {
        var href = abs(url);
        if (!href || seen[href]) return;
        if (href.indexOf('blob:') === 0 || href.indexOf('data:') === 0) return;
        if (!STREAM_RE.test(href) && !STREAM_HINT.test(href)) return;
        seen[href] = true;
        tell({ kind: 'stream', url: href, referer: PAGE_URL });
    }

    function harvest(text, source) {
        if (!text || text.length > 400000) return;
        if (/^\s*#EXTM3U/i.test(text)) found(source);
        var urls = text.match(/https?:\/\/[^\s"'<>\\]+/g) || [];
        for (var i = 0; i < urls.length; i++) found(urls[i].replace(/[),;]+$/, ''));
    }

    var origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        var href = abs(url);
        this.__bc = href;
        if (href && !isOurs(href) && !hostIn(href, LEAVE)) {
            found(href);
            arguments[1] = viaRaw(href);
        }
        return origOpen.apply(this, arguments);
    };

    var origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
        try { this.withCredentials = true; } catch (e) {  }
        this.addEventListener('load', function () {
            var src = this.__bc || this.responseURL;
            found(src);
            if (typeof this.responseText === 'string') harvest(this.responseText, src);
        });
        return origSend.apply(this, arguments);
    };

    var origFetch = window.fetch;
    if (origFetch) {
        window.fetch = function (input, init) {
            var href = null;
            try {
                var url = typeof input === 'string' ? input : (input && input.url);
                href = abs(url);
                if (href && !isOurs(href) && !hostIn(href, LEAVE)) {
                    found(href);
                    init = init || {};
                    init.credentials = 'include';
                    input = typeof input === 'string' ? viaRaw(href) : new Request(viaRaw(href), input);
                }
            } catch (e) {  }
            return origFetch.call(this, input, init).then(function (resp) {
                if (href) {
                    found(href);
                    try {
                        var type = (resp.headers && resp.headers.get('content-type')) || '';
                        if (/json|text|javascript|xml|mpegurl/i.test(type) && resp.clone) {
                            resp.clone().text().then(function (body) { harvest(body, href); }).catch(function () {});
                        }
                    } catch (e) {  }
                }
                return resp;
            });
        };
    }

    try {
        window.open = function (url) {
            if (url && String(url) !== 'about:blank') stay(String(url));
            return {
                closed: false,
                close: function () {},
                focus: function () {},
                location: {
                    href: '',
                    assign: stay,
                    replace: stay,
                    set href(value) { stay(value); }
                }
            };
        };
    } catch (e) {  }

    document.addEventListener('click', function (e) {
        if (e.button !== 0) return;
        var node = e.target;
        while (node && node !== document) {
            if (node.tagName === 'A' || node.tagName === 'AREA') {
                var href = node.getAttribute('href') || '';
                if (!href || href.charAt(0) === '#' || href.indexOf('javascript:') === 0) return;
                e.preventDefault();
                e.stopPropagation();
                stay(href);
                return;
            }
            node = node.parentNode;
        }
    }, true);

    function scan() {
        var media = document.querySelectorAll('video, audio, source');
        for (var i = 0; i < media.length; i++) {
            if (media[i].src) found(media[i].src);
            if (media[i].currentSrc) found(media[i].currentSrc);
        }
        try {
            var entries = performance.getEntriesByType('resource');
            for (var j = 0; j < entries.length; j++) found(entries[j].name);
        } catch (e) {  }
    }

    tell({ kind: 'navigated', url: PAGE_URL });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scan);
    } else {
        scan();
    }
    setInterval(scan, 1500);
})();
