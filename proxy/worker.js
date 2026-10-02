const PROJECT_ID = 'tizenos-broadcast';
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

const tickets = new Map();
let jwks = null;
let jwksFetchedAt = 0;

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
            if (url.pathname === '/ticket') {
                if (request.method !== 'POST') {
                    return new Response('Method not allowed', { status: 405, headers: corsHeaders() });
                }
                const caller = await verifyIdToken(request);
                if (!caller) {
                    return new Response('Unauthorized', { status: 401, headers: corsHeaders() });
                }
                return await createTicket(request);
            }

            const ticketed = url.pathname.match(/^\/t\/([A-Za-z0-9]+)\/([^/]+)$/);
            if (ticketed) {
                return await serveTicket(request, ticketed[1], ticketed[2]);
            }

            return new Response('Not found', { status: 404, headers: corsHeaders() });
        } catch (err) {
            return new Response('Proxy error: ' + err.message, { status: 502 });
        }
    }
};

async function verifyIdToken(request) {
    const header = request.headers.get('authorization') || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;

    const parts = match[1].split('.');
    if (parts.length !== 3) return null;

    let head;
    let claims;
    try {
        head = JSON.parse(decodeSegment(parts[0]));
        claims = JSON.parse(decodeSegment(parts[1]));
    } catch (e) {
        return null;
    }

    if (head.alg !== 'RS256' || !head.kid) return null;
    if (claims.aud !== PROJECT_ID) return null;
    if (claims.iss !== 'https://securetoken.google.com/' + PROJECT_ID) return null;
    if (!claims.sub) return null;

    const now = Math.floor(Date.now() / 1000);
    if (!claims.exp || claims.exp <= now) return null;

    const jwk = await publicKey(head.kid);
    if (!jwk) return null;

    const key = await crypto.subtle.importKey(
        'jwk',
        { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
    );

    const valid = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        key,
        base64UrlToBytes(parts[2]),
        new TextEncoder().encode(parts[0] + '.' + parts[1])
    );

    return valid ? claims.sub : null;
}

async function publicKey(kid) {
    if (!jwks || Date.now() - jwksFetchedAt > 3600000) {
        const response = await fetch(JWKS_URL);
        if (!response.ok) return null;
        jwks = await response.json();
        jwksFetchedAt = Date.now();
    }
    return (jwks.keys || []).find((key) => key.kid === kid) || null;
}

function base64UrlToBytes(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(padded + '='.repeat((4 - padded.length % 4) % 4));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
}

function decodeSegment(value) {
    return new TextDecoder().decode(base64UrlToBytes(value));
}

function isM3u(text) {
    return /^\s*#EXTM3U/i.test(text || '');
}

function looksLikePlaylist(url) {
    return /\.m3u8(\?|#|$)/i.test(url || '');
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
    return looksLikePlaylist(target) ||
        type.includes('mpegurl') ||
        type.includes('x-mpegurl');
}

async function servePlaylist(upstream, target, proxyOrigin, options) {
    options = options || {};

    let base = upstream.url || target;
    let text = await upstream.text();

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

    const rewritten = rewritePlaylistText(text, base, options.rewrite);

    const headers = new Headers(corsHeaders());
    headers.set('Content-Type', 'application/vnd.apple.mpegurl');
    headers.set('Cache-Control', 'no-store');

    return new Response(rewritten, { status: upstream.status, headers });
}

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
    } catch (e) {  }

    name = name.replace(/[^A-Za-z0-9._-]/g, '');
    return name || 'stream';
}

async function createTicket(request) {
    const body = await request.json();
    if (!body || !body.url || !/^https?:\/\//i.test(body.url)) {
        return new Response('Missing url', { status: 400, headers: corsHeaders() });
    }

    const id = randomId();
    const origin = new URL(request.url).origin;

    const ticket = {
        url: body.url,
        referer: body.referer || '',
        cookie: body.cookie || '',
        userAgent: body.userAgent || BROWSER_UA,
        parts: {},
        playlist: ''
    };

    try {
        if (body.playlist && isM3u(body.playlist)) {
            applyUploadedPlaylist(ticket, body.playlist, body.base || body.url, origin, id);
        } else if (looksLikePlaylist(body.url)) {
            await snapshotPlaylist(ticket, origin, id);
        }
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 502,
            headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
        });
    }

    await putTicket(id, ticket);

    const name = ticket.playlist ? 'master.m3u8' : fileNameOf(ticket.url);
    return new Response(JSON.stringify({
        id: id,
        play: origin + '/t/' + id + '/' + name
    }), {
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });
}

function applyUploadedPlaylist(ticket, text, base, origin, id) {
    const pending = {};

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
        try { headers['Origin'] = new URL(ticket.referer).origin; } catch (e) {  }
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

    const target = ticket.parts[name] || (ticket.playlist ? null : ticket.url);
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
        const response = await servePlaylist(upstream, target, origin, {
            flatten: true,
            headers,
            rewrite: function (absolute) {
                const key = partKey(absolute);
                pending[key] = absolute;
                return origin + '/t/' + id + '/' + key;
            }
        });
        ticket.parts = Object.assign(ticket.parts || {}, pending);
        await putTicket(id, ticket);
        return response;
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
    const bytes = crypto.getRandomValues(new Uint8Array(16));
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
    } catch (e) {  }
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

function passthrough(upstream, target) {
    const headers = new Headers(upstream.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    headers.set('Access-Control-Expose-Headers', '*');

    headers.delete('set-cookie');
    headers.delete('x-frame-options');
    headers.delete('content-security-policy');
    headers.delete('content-security-policy-report-only');

    if (target && looksLikePlaylist(target)) {
        headers.set('Content-Type', 'application/vnd.apple.mpegurl');
    }

    return new Response(upstream.body, { status: upstream.status, headers });
}

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, content-type'
    };
}
