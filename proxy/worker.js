/**
 * Cloudflare Worker – proxy dla trybu przeglądania i dla strumieni.
 *
 * Deploy:
 *   1. npm i -g wrangler
 *   2. wrangler login
 *   3. wrangler deploy
 *   4. Wklej URL workera do CONFIG.PROXY_URL w tv-app/js/config.js
 *      oraz do SENDER_CONFIG.PROXY_URL w sender/config.js
 *
 * Trasy:
 *   /page?url=...&room=...&db=...   strona z wstrzykniętym agentem
 *   /raw?url=...&referer=...        dowolny zasób z nagłówkami i CORS
 *   /?url=...&referer=...           to samo co /raw (używa tego aplikacja na TV)
 *
 * Ciasteczka krążą w obie strony i są przepisywane na domenę workera. Bez tego
 * serwisy za wyzwaniem Cloudflare odsyłają w kółko stronę „Just a moment…”.
 */

import AGENT_SOURCE from './agent.js';

const tickets = new Map();

const BROWSER_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default {
    async fetch(request) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders() });
        }

        const url = new URL(request.url);

        try {
            if (request.method === 'POST' && url.pathname === '/ticket') {
                return await createTicket(request);
            }

            const ticketed = url.pathname.match(/^\/t\/([A-Za-z0-9]+)\/([^/]+)$/);
            if (ticketed) {
                return await serveTicket(request, ticketed[1], ticketed[2]);
            }

            const target = url.searchParams.get('url');
            if (!target) {
                return new Response('Missing url parameter', { status: 400 });
            }

            if (url.pathname === '/page') {
                return await servePage(request, target, url);
            }
            return await serveRaw(request, target, url.searchParams.get('referer') || '');
        } catch (err) {
            return new Response('Proxy error: ' + err.message, { status: 502 });
        }
    }
};

/**
 * Zwraca stronę przygotowaną do otwarcia w osobnej karcie telefonu:
 * z agentem na samej górze i z <base>, żeby względne adresy nadal
 * wskazywały prawdziwy serwis.
 */
async function servePage(request, target, requestUrl) {
    const headers = withCookies(request, {
        'User-Agent': request.headers.get('user-agent') || BROWSER_UA,
        'Referer': new URL(target).origin + '/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': request.headers.get('accept-language') || 'pl-PL,pl;q=0.9,en;q=0.8'
    });

    const init = {
        method: request.method === 'HEAD' ? 'HEAD' : request.method,
        headers,
        redirect: 'follow'
    };

    // Captcha na viderze i podobnych idzie zwykłym POST-em. Bez przekazania
    // ciała i ciasteczek serwer uznaje kod za nieważny i rysuje nowy.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        const contentType = request.headers.get('content-type');
        if (contentType) headers['Content-Type'] = contentType;
        init.body = await request.arrayBuffer();
    }

    const upstream = await fetch(target, init);

    const contentType = upstream.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
        return passthrough(upstream, target);
    }

    const pageUrl = upstream.url || target;
    const rewritten = rewriteNavAttrs(await upstream.text(), pageUrl, requestUrl.origin);
    const injected = injectAgent(rewritten, pageUrl, {
        proxyOrigin: requestUrl.origin,
        room: requestUrl.searchParams.get('room') || '',
        dbUrl: requestUrl.searchParams.get('db') || ''
    });

    const responseHeaders = new Headers(corsHeaders());
    responseHeaders.set('Content-Type', 'text/html; charset=utf-8');
    responseHeaders.set('Cache-Control', 'no-store');
    relayCookies(upstream, responseHeaders);

    return new Response(injected, { status: upstream.status, headers: responseHeaders });
}

/**
 * Przepuszcza zasób z podszyciem się pod przeglądarkę. Tędy idą strumienie
 * z aplikacji na TV oraz wszystkie XHR-y przekierowane przez agenta.
 */
async function serveRaw(request, target, referer) {
    const headers = withCookies(request, {
        'User-Agent': request.headers.get('user-agent') || BROWSER_UA,
        'Accept': request.headers.get('accept') || '*/*'
    });

    if (referer) {
        headers['Referer'] = referer;
        headers['Origin'] = new URL(referer).origin;
    }

    const range = request.headers.get('range');
    if (range) headers['Range'] = range;

    const init = {
        method: request.method === 'HEAD' ? 'HEAD' : request.method,
        headers,
        redirect: 'follow'
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        const contentType = request.headers.get('content-type');
        if (contentType) headers['Content-Type'] = contentType;
        init.body = await request.arrayBuffer();
    }

    const upstream = await fetch(target, init);

    if (request.method !== 'HEAD' && isPlaylist(target, upstream)) {
        const requestUrl = new URL(request.url);
        return servePlaylist(upstream, target, referer, requestUrl.origin, {
            flatten: requestUrl.searchParams.get('flatten') === '1',
            headers
        });
    }

    return passthrough(upstream, target);
}

function isM3u(text) {
    return /^\s*#EXTM3U/i.test(text || '');
}

function rewritePlaylistText(text, base, rewrite) {
    function link(uri) {
        try {
            return rewrite(new URL(uri, base).href);
        } catch (e) {
            return null;
        }
    }

    return text.split('\n').map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;

        if (trimmed.charAt(0) === '#') {
            return trimmed.replace(/URI="([^"]+)"/g, (whole, uri) => {
                const proxied = link(uri);
                return proxied ? 'URI="' + proxied + '"' : whole;
            });
        }

        return link(trimmed) || line;
    }).join('\n');
}

function isPlaylist(target, upstream) {
    const type = (upstream.headers.get('content-type') || '').toLowerCase();
    return /\.m3u8(\?|#|$)/i.test(target) ||
        type.includes('mpegurl') ||
        type.includes('x-mpegurl');
}

/**
 * Playlisty HLS wskazują warianty i segmenty ścieżkami względnymi, które bez
 * przepisania rozwiązałyby się względem workera zamiast serwera z filmem.
 * Przy okazji jest to konieczne z drugiego powodu: CDN-y potrafią wiązać token
 * z adresem IP, który pobrał playlistę – a pobrał ją worker, nie telewizor.
 */
async function servePlaylist(upstream, target, referer, proxyOrigin, options) {
    options = options || {};

    let base = upstream.url || target;
    let text = await upstream.text();

    // Dokumentacja Samsunga nie wymienia playlist zbiorczych, a AVPlay
    // potrafi się na nich wyłożyć. Dla telewizora podmieniamy więc listę
    // wariantów na zawartość jednego z nich.
    if (options.flatten && /#EXT-X-STREAM-INF/i.test(text)) {
        const variantUrl = pickVariant(text, base);
        if (variantUrl) {
            const variant = await fetch(variantUrl, {
                headers: options.headers,
                redirect: 'follow'
            });
            const variantText = await variant.text();
            if (isM3u(variantText)) {
                text = variantText;
                base = variant.url || variantUrl;
            }
        }
    }

    if (!isM3u(text)) {
        return new Response(text, {
            status: upstream.status,
            headers: { ...corsHeaders(), 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }

    const rewrite = options.rewrite || function (absolute) {
        return toProxied(absolute, referer, proxyOrigin);
    };

    const rewritten = rewritePlaylistText(text, base, rewrite);

    const headers = new Headers(corsHeaders());
    headers.set('Content-Type', 'application/vnd.apple.mpegurl');
    headers.set('Cache-Control', 'no-store');

    return new Response(rewritten, { status: upstream.status, headers });
}

/**
 * Odtwarzacze rozpoznają rodzaj zasobu po rozszerzeniu w adresie, więc nazwa
 * pliku musi przetrwać opakowanie w proxy. Bez tego AVPlay bierze playlistę
 * wariantu za cokolwiek innego i przerywa odtwarzanie.
 */
function toProxied(absolute, referer, proxyOrigin) {
    return proxyOrigin + '/s/' + fileNameOf(absolute) +
        '?url=' + encodeURIComponent(absolute) +
        (referer ? '&referer=' + encodeURIComponent(referer) : '');
}

/**
 * Wybiera z playlisty zbiorczej wariant o najwyższej przepływności – zwykle
 * najlepszej jakości, którą telewizor i tak udźwignie po kablu.
 */
function pickVariant(text, base) {
    const lines = text.split('\n');
    let best = null;
    let bestBandwidth = -1;

    for (let i = 0; i < lines.length; i++) {
        if (!/^#EXT-X-STREAM-INF/i.test(lines[i].trim())) continue;

        const match = /BANDWIDTH=(\d+)/i.exec(lines[i]);
        const bandwidth = match ? parseInt(match[1], 10) : 0;

        for (let j = i + 1; j < lines.length; j++) {
            const candidate = lines[j].trim();
            if (!candidate) continue;
            if (candidate.charAt(0) === '#') break;

            if (bandwidth > bestBandwidth) {
                bestBandwidth = bandwidth;
                best = candidate;
            }
            break;
        }
    }

    if (!best) return null;
    try {
        return new URL(best, base).href;
    } catch (e) {
        return null;
    }
}

function fileNameOf(url) {
    let name = '';
    try {
        name = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
    } catch (e) { /* ignore */ }

    name = name.replace(/[^A-Za-z0-9._-]/g, '');
    return name || 'stream';
}

/**
 * Bilet zamienia kilkusetznakowy adres CDN na krótki /t/id/master.m3u8.
 * AVPlay na Tizenie gubi połączenie, gdy query string po opakowaniu w proxy
 * przekracza mniej więcej dwa tysiące znaków – a tokeny z filehostów tak
 * właśnie wyglądają.
 */
async function createTicket(request) {
    const body = await request.json();
    if (!body || !body.url) {
        return new Response('Missing url', { status: 400, headers: corsHeaders() });
    }

    const id = randomId();
    const origin = new URL(request.url).origin;
    const cookie = [request.headers.get('cookie'), body.cookie]
        .filter(Boolean)
        .join('; ');

    const ticket = {
        url: body.url,
        referer: body.referer || '',
        cookie: cookie,
        userAgent: body.userAgent || request.headers.get('user-agent') || BROWSER_UA,
        parts: {},
        playlist: ''
    };

    try {
        // Telefon przysyła już ściągniętą playlistę (ten sam IP i ciasteczka
        // co przy oglądaniu). Worker z Cloudflare nie potrafi jej ponownie
        // pobrać – token CDN jest przypięty do sieci telefonu.
        if (body.playlist && isM3u(body.playlist)) {
            applyUploadedPlaylist(ticket, body.playlist, body.base || body.url, origin, id);
        } else {
            await snapshotPlaylist(ticket, origin, id);
        }
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 502,
            headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
        });
    }

    await putTicket(id, ticket);
    return new Response(JSON.stringify({
        id: id,
        play: origin + '/t/' + id + '/master.m3u8'
    }), {
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });
}

/**
 * Ściąga playlistę od razu, w sesji telefonu. Późniejszy odczyt z TV
 * dostaje już gotowy tekst – nie woła już umierającego biletu CDN.
 */
function applyUploadedPlaylist(ticket, text, base, origin, id) {
    const pending = {};
    // AVPlay otwiera master.m3u8, a potem każdy segment osobno. Długi token
    // CDN w adresie segmentu urywa połączenie tak samo jak długi master.
    ticket.playlist = rewritePlaylistText(text, base, function (absolute) {
        const key = partKey(absolute);
        pending[key] = absolute;
        return origin + '/t/' + id + '/' + key;
    });
    ticket.parts = pending;
}

async function snapshotPlaylist(ticket, origin, id) {
    const headers = ticketHeaders(ticket);
    const upstream = await fetch(ticket.url, { headers, redirect: 'follow' });
    let text = await upstream.text();
    let base = upstream.url || ticket.url;

    if (!isM3u(text)) {
        throw new Error('CDN nie oddał playlisty (HTTP ' + upstream.status + ')');
    }

    if (/#EXT-X-STREAM-INF/i.test(text)) {
        const variantUrl = pickVariant(text, base);
        if (variantUrl) {
            const variant = await fetch(variantUrl, { headers, redirect: 'follow' });
            const variantText = await variant.text();
            if (isM3u(variantText)) {
                text = variantText;
                base = variant.url || variantUrl;
            }
        }
    }

    const pending = {};
    ticket.playlist = rewritePlaylistText(text, base, function (absolute) {
        const key = partKey(absolute);
        pending[key] = absolute;
        return origin + '/t/' + id + '/' + key;
    });
    ticket.parts = pending;
}

function ticketHeaders(ticket, request) {
    const headers = {
        'User-Agent': ticket.userAgent || BROWSER_UA,
        'Accept': '*/*'
    };
    if (ticket.cookie) headers['Cookie'] = ticket.cookie;
    if (ticket.referer) {
        headers['Referer'] = ticket.referer;
        try { headers['Origin'] = new URL(ticket.referer).origin; } catch (e) { /* ignore */ }
    }
    if (request) {
        const range = request.headers.get('range');
        if (range) headers['Range'] = range;
        const accept = request.headers.get('accept');
        if (accept) headers['Accept'] = accept;
    }
    return headers;
}

async function serveTicket(request, id, name) {
    const ticket = await getTicket(id);
    if (!ticket) {
        return new Response('Unknown ticket', { status: 404, headers: corsHeaders() });
    }

    if (name === 'master.m3u8' && ticket.playlist) {
        return new Response(ticket.playlist, {
            headers: {
                ...corsHeaders(),
                'Content-Type': 'application/vnd.apple.mpegurl',
                'Cache-Control': 'no-store'
            }
        });
    }

    const target = name === 'master.m3u8' ? ticket.url : ticket.parts[name];
    if (!target) {
        return new Response('Unknown part', { status: 404, headers: corsHeaders() });
    }

    const origin = new URL(request.url).origin;
    const headers = ticketHeaders(ticket, request);

    const upstream = await fetch(target, {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET',
        headers,
        redirect: 'follow'
    });

    if (request.method !== 'HEAD' && isPlaylist(target, upstream)) {
        const pending = {};
        return servePlaylist(upstream, target, ticket.referer, origin, {
            flatten: true,
            headers,
            rewrite: function (absolute) {
                const key = partKey(absolute);
                pending[key] = absolute;
                return origin + '/t/' + id + '/' + key;
            }
        }).then(async (response) => {
            ticket.parts = Object.assign(ticket.parts || {}, pending);
            await putTicket(id, ticket);
            return response;
        });
    }

    return passthrough(upstream, target);
}

function partKey(url) {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
        hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
    }
    const ext = (fileNameOf(url).split('.').pop() || 'bin').slice(0, 8);
    return (hash >>> 0).toString(36) + '.' + ext;
}

function randomId() {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function ticketRequest(id) {
    return new Request('https://ticket.local/' + id);
}

async function putTicket(id, data) {
    tickets.set(id, data);
    try {
        await caches.default.put(ticketRequest(id), new Response(JSON.stringify(data), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'max-age=7200'
            }
        }));
    } catch (e) { /* Cache API bywa niedostępne w lokalnym wranglerze */ }
}

async function getTicket(id) {
    if (tickets.has(id)) return tickets.get(id);
    try {
        const cached = await caches.default.match(ticketRequest(id));
        if (!cached) return null;
        const data = await cached.json();
        tickets.set(id, data);
        return data;
    } catch (e) {
        return null;
    }
}

function withCookies(request, headers) {
    const cookie = request.headers.get('cookie');
    if (cookie) headers['Cookie'] = cookie;
    return headers;
}

/**
 * Przepisuje Set-Cookie z serwisu na domenę workera. Atrybut Domain trzeba
 * usunąć, bo inaczej przeglądarka odrzuci ciasteczko jako obce.
 */
function relayCookies(upstream, headers) {
    const cookies = upstream.headers.getSetCookie
        ? upstream.headers.getSetCookie()
        : [];

    for (const raw of cookies) {
        const cleaned = raw
            .split(';')
            .filter((part) => !/^\s*domain=/i.test(part))
            .join(';');
        headers.append('Set-Cookie', cleaned + '; Secure; SameSite=None');
    }
}

function passthrough(upstream, target) {
    const headers = new Headers(upstream.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    headers.set('Access-Control-Expose-Headers', '*');

    // Skoro i tak pośredniczymy, polityki osadzania serwisu są bez znaczenia,
    // a potrafią zablokować wyświetlenie strony.
    headers.delete('x-frame-options');
    headers.delete('content-security-policy');
    headers.delete('content-security-policy-report-only');

    // Kilka nagłówków Set-Cookie zlewa się w kopii w jeden, co je psuje.
    // Odtwarzamy je pojedynczo i przepisujemy na domenę workera.
    headers.delete('set-cookie');
    relayCookies(upstream, headers);

    if (target && target.includes('.m3u8')) {
        headers.set('Content-Type', 'application/vnd.apple.mpegurl');
    }

    return new Response(upstream.body, { status: upstream.status, headers });
}

function rewriteNavAttrs(html, pageUrl, origin) {
    function wrap(raw) {
        if (!raw || raw.charAt(0) === '#') return null;
        if (/^(javascript:|data:|blob:|mailto:)/i.test(raw)) return null;
        try {
            const abs = new URL(raw, pageUrl).href;
            if (!/^https?:/i.test(abs)) return null;
            if (abs.indexOf(origin) === 0) return null;
            return origin + '/page?url=' + encodeURIComponent(abs);
        } catch (e) {
            return null;
        }
    }

    const rewritten = html.replace(
        /(<(?:a|area|iframe|form)\b[^>]*?\b(?:href|src|action)\s*=\s*)(["'])([^"']+)\2/gi,
        function (whole, pre, quote, val) {
            const next = wrap(val);
            return next ? pre + quote + next + quote : whole;
        }
    );

    // target=_blank otwiera prawdziwą kartę Chrome poza web.app
    return rewritten.replace(/<a\b[^>]*>/gi, function (tag) {
        return tag
            .replace(/\s+target\s*=\s*(['"]?)[^'"\s>]+\1/gi, '')
            .replace(/\s+rel\s*=\s*(['"]?)[^'"]*\1/gi, '');
    });
}

function injectAgent(html, pageUrl, context) {
    const agent = AGENT_SOURCE
        .split('__PROXY_ORIGIN__').join(context.proxyOrigin)
        .split('__PAGE_URL__').join(pageUrl)
        .split('__PAGE_PATH__').join('/page')
        .split('__RAW_PATH__').join('/raw')
        .split('__ROOM__').join(context.room || '')
        .split('__DB_URL__').join(context.dbUrl || '')
        .split('__TICKET_ORIGIN__').join(context.ticketOrigin || context.proxyOrigin);

    const head =
        '<base href="' + escapeAttribute(pageUrl) + '">' +
        '<script>' + agent + '</script>';

    // Agent musi wystartować przed skryptami strony, więc wchodzi zaraz
    // za <head>. Gdy znacznika brak, doklejamy go na początek dokumentu.
    const match = /<head[^>]*>/i.exec(html);
    if (match) {
        const at = match.index + match[0].length;
        return html.slice(0, at) + head + html.slice(at);
    }
    return head + html;
}

function escapeAttribute(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*'
    };
}
