var ResolverChain = (function () {
    'use strict';

    function resolve(url, depth, options) {
        options = options || {};

        if (!url || typeof url !== 'string') {
            return Promise.reject(new Error(I18n.t('badUrl')));
        }

        url = url.trim();

        if (!Utils.isDirectStream(url)) {
            return Promise.reject(new Error(I18n.t('notVideo')));
        }

        if (ResolveUtils.isOurProxy(url)) {
            return Promise.resolve(ResolveUtils.makeResult(url, {
                referer: options.referer || ''
            }));
        }

        if (!options.referer) {
            return Promise.resolve(ResolveUtils.makeResult(url, {}));
        }

        return ResolveUtils.mintTicket(url, options.referer).then(function (play) {
            return ResolveUtils.makeResult(play || url, {
                referer: options.referer,
                proxyUrl: play ? url : ''
            });
        });
    }

    return { resolve: resolve };
})();
