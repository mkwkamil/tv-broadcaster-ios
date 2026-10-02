/**
 * Opakowanie gotowego pliku w adres, który AVPlay potrafi otworzyć.
 */
var ResolveUtils = (function () {
    'use strict';

    /**
     * AVPlay rozpoznaje rodzaj strumienia po rozszerzeniu w adresie, jeszcze
     * zanim cokolwiek pobierze. Nazwa pliku musi więc przetrwać opakowanie
     * w proxy, inaczej playlista HLS trafia do złego dekodera.
     */
    function isOurProxy(url) {
        var base = (CONFIG.PROXY_URL || '').replace(/\/$/, '');
        return !!(base && url.indexOf(base) === 0);
    }

    function mintTicket(streamUrl, referer) {
        if (!CONFIG.PROXY_URL) return Promise.resolve(null);
        return new Promise(function (resolve) {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', CONFIG.PROXY_URL.replace(/\/$/, '') + '/ticket', true);
            xhr.setRequestHeader('Content-Type', 'application/json');
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
    }

    function proxied(streamUrl, referer) {
        // flatten=1 każe proxy podmienić playlistę zbiorczą na jeden wariant –
        // AVPlay nie radzi sobie z listami wariantów.
        return CONFIG.PROXY_URL.replace(/\/$/, '') + '/s/' + streamFileName(streamUrl) +
            '?url=' + encodeURIComponent(streamUrl) +
            '&referer=' + encodeURIComponent(referer || '') +
            '&flatten=1';
    }

    function streamFileName(url) {
        var name = '';
        try {
            name = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
        } catch (e) { /* ignore */ }

        name = name.replace(/[^A-Za-z0-9._-]/g, '');
        return name || 'stream';
    }

    function makeResult(streamUrl, options) {
        options = options || {};
        var type = Utils.getStreamType(streamUrl);

        // Oba adresy jadą do odtwarzacza, bo z góry nie wiadomo który zadziała.
        // Token bywa przypisany do adresu IP, z którego pobrano playlistę –
        // wtedy proxy przeszkadza. Kiedy indziej serwer wymaga nagłówka
        // Referer, którego AVPlay nie wyśle – wtedy proxy jest niezbędne.
        var proxyUrl = '';
        if (CONFIG.PROXY_URL && options.needsReferer && !isOurProxy(streamUrl)) {
            proxyUrl = proxied(streamUrl, options.referer);
        }

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
