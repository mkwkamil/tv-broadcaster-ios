/**
 * iOS przysyła gotowy plik albo krótki bilet HLS.
 * TV nie otwiera już stron filehostów.
 */
var ResolverChain = (function () {
    'use strict';

    function resolve(url, depth, options) {
        options = options || {};

        if (!url || typeof url !== 'string') {
            return Promise.reject(new Error('Nieprawidłowy URL'));
        }

        url = url.trim();

        if (!Utils.isDirectStream(url)) {
            return Promise.reject(new Error('To nie jest plik wideo. Uruchom go z aplikacji na iPhonie.'));
        }

        if (ResolveUtils.isOurProxy(url)) {
            return Promise.resolve(ResolveUtils.makeResult(url, {
                referer: options.referer || '',
                needsReferer: false
            }));
        }

        if (Utils.getStreamType(url) === 'hls' && options.referer) {
            return ResolveUtils.mintTicket(url, options.referer).then(function (play) {
                return ResolveUtils.makeResult(play || url, {
                    referer: options.referer,
                    needsReferer: !play
                });
            });
        }

        return Promise.resolve(ResolveUtils.makeResult(url, {
            referer: options.referer || '',
            needsReferer: !!options.referer
        }));
    }

    return { resolve: resolve };
})();
