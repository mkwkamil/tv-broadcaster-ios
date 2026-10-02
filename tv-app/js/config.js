/**
 * Konfiguracja Broadcaster.
 * Uzupełnij FIREBASE_DB_URL po utworzeniu projektu Firebase.
 */
var CONFIG = {
    // URL Firebase Realtime Database (bez końcowego slasha)
    // Przykład: https://twoj-projekt-default-rtdb.europe-west1.firebasedatabase.app
    FIREBASE_DB_URL: 'https://tizenos-broadcast-default-rtdb.europe-west1.firebasedatabase.app',

    // Stały pokój z aplikacją iOS. Ten sam kod jest w Broadcaster/AppConfig.swift.
    DEFAULT_ROOM: 'CAST01',

    // Opcjonalny Cloudflare Worker dodający nagłówek Referer do strumieni
    // Zostaw pusty string aby wyłączyć proxy
    PROXY_URL: 'https://broadcaster-proxy.kporebski.workers.dev',

    // User-Agent używany przy pobieraniu stron filehostów
    FETCH_USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

    // Maksymalna głębokość rekurencji po iframe
    MAX_IFRAME_DEPTH: 3,

    // Czas ukrycia overlay odtwarzacza (ms)
    OVERLAY_HIDE_DELAY: 5000,

    // Przewijanie pilotem (ms)
    SEEK_STEP: 10000
};
