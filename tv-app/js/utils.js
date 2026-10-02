var Utils = (function () {
    'use strict';

    function showScreen(id) {
        var screens = document.querySelectorAll('.screen');
        for (var i = 0; i < screens.length; i++) {
            screens[i].classList.remove('active');
        }
        var target = document.getElementById(id);
        if (target) {
            target.classList.add('active');
        }
    }

    var toastTimer = null;
    var toastIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"></circle><path d="M9 9l6 6M15 9l-6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>';

    function showToast(options) {
        options = options || {};
        var duration = options.duration || 5000;
        var title = options.title || (typeof I18n !== 'undefined' ? I18n.t('errorTitle') : 'Wystąpił błąd');
        var message = options.message || '';
        var toast = document.getElementById('toast');
        var icon = document.getElementById('toast-icon');
        var titleNode = document.getElementById('toast-title');
        var text = document.getElementById('toast-message');
        if (!toast || !titleNode || !text) return;

        if (icon) icon.innerHTML = toastIcon;
        titleNode.textContent = title;
        text.textContent = message;
        titleNode.style.display = title ? 'block' : 'none';
        text.style.display = message ? 'block' : 'none';

        if (toastTimer) clearTimeout(toastTimer);
        toast.classList.remove('is-visible', 'is-error');
        void toast.offsetWidth;
        toast.classList.add('is-visible', 'is-error');
        playErrorSound();

        toastTimer = setTimeout(function () {
            toast.classList.remove('is-visible');
            toastTimer = null;
        }, duration);
    }

    function playErrorSound() {
        var audio = document.getElementById('error-sound');
        if (!audio) return;
        try {
            audio.pause();
            audio.currentTime = 0;
            var pending = audio.play();
            if (pending && pending.catch) pending.catch(function () {});
        } catch (e) {  }
    }

    function hideToast() {
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = null;
        var toast = document.getElementById('toast');
        if (toast) toast.classList.remove('is-visible');
    }

    function formatTime(ms) {
        if (!ms || isNaN(ms) || ms < 0) return '00:00';
        var totalSec = Math.floor(ms / 1000);
        var h = Math.floor(totalSec / 3600);
        var m = Math.floor((totalSec % 3600) / 60);
        var s = totalSec % 60;
        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        if (h > 0) return h + ':' + pad(m) + ':' + pad(s);
        return pad(m) + ':' + pad(s);
    }

    function truncate(str, max) {
        if (!str) return '';
        if (str.length <= max) return str;
        return str.substring(0, max - 3) + '...';
    }

    function isDirectStream(url) {
        try {
            return /\.(m3u8|mp4|mkv|webm)$/i.test(new URL(url).pathname);
        } catch (e) {
            return /\.(m3u8|mp4|mkv|webm)(\?|#|$)/i.test(url);
        }
    }

    function getStreamType(url) {
        if (/\.m3u8/i.test(url)) return 'hls';
        if (/\.mp4/i.test(url)) return 'mp4';
        if (/\.mkv/i.test(url)) return 'mkv';
        if (/\.webm/i.test(url)) return 'webm';
        return 'unknown';
    }

    return {
        showScreen: showScreen,
        showToast: showToast,
        hideToast: hideToast,
        formatTime: formatTime,
        truncate: truncate,
        isDirectStream: isDirectStream,
        getStreamType: getStreamType
    };
})();
