var ResolveUtils = (function () {
    'use strict';

    function isOurProxy(url) {
        var base = (CONFIG.PROXY_URL || '').replace(/\/$/, '');
        return !!(base && url.indexOf(base) === 0);
    }

    function mintTicket(streamUrl, referer) {
        if (!CONFIG.PROXY_URL) return Promise.resolve(null);
        return TvAuth.token().then(function (token) {
            return new Promise(function (resolve) {
                var xhr = new XMLHttpRequest();
                xhr.open('POST', CONFIG.PROXY_URL.replace(/\/$/, '') + '/ticket', true);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.setRequestHeader('Authorization', 'Bearer ' + token);
                xhr.onreadystatechange = function () {
                    if (xhr.readyState !== 4) return;
                    if (xhr.status < 200 || xhr.status >= 300) {
                        resolve(null);
                        return;
                    }
                    try {
                        var data = JSON.parse(xhr.responseText);
                        resolve(data && data.play ? data.play : null);
                    } catch (e) {
                        resolve(null);
                    }
                };
                xhr.onerror = function () { resolve(null); };
                xhr.send(JSON.stringify({ url: streamUrl, referer: referer || '' }));
            });
        }).catch(function () { return null; });
    }

    function makeResult(streamUrl, options) {
        options = options || {};
        var type = Utils.getStreamType(streamUrl);
        var proxyUrl = options.proxyUrl || '';

        return {
            streamUrl: streamUrl,
            proxyUrl: proxyUrl,
            type: type,
            userAgent: options.userAgent || CONFIG.FETCH_USER_AGENT,
            cookie: options.cookie || '',
            referer: options.referer || '',
            title: options.title || '',
            qualities: options.qualities || null
        };
    }

    return {
        makeResult: makeResult,
        mintTicket: mintTicket,
        isOurProxy: isOurProxy
    };
})();
