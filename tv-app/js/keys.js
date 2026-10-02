var Keys = (function () {
    'use strict';

    var handlers = {};
    var focusables = [];
    var focusIndex = 0;

    var KEY = {
        UP: 38,
        DOWN: 40,
        LEFT: 37,
        RIGHT: 39,
        ENTER: 13,
        RETURN: 10009,
        BACK: 461,
        PLAY: 415,
        PAUSE: 19,
        PLAY_PAUSE: 10252,
        STOP: 413,
        FF: 417,
        RW: 412,
        RED: 403,
        GREEN: 404,
        YELLOW: 405,
        BLUE: 406
    };

    function init() {
        document.addEventListener('keydown', handleKeyDown);

        try {
            if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
                var keys = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
                    'MediaFastForward', 'MediaRewind', 'ColorF0Red', 'ColorF1Green',
                    'ColorF2Yellow', 'ColorF3Blue'];
                for (var i = 0; i < keys.length; i++) {
                    tizen.tvinputdevice.registerKey(keys[i]);
                }
            }
        } catch (e) {  }
    }

    function handleKeyDown(e) {
        var code = e.keyCode;
        var handler = handlers[code] || handlers['default'];
        if (handler) {
            var handled = handler(e);
            if (handled !== false) {
                e.preventDefault();
                e.stopPropagation();
            }
        }
    }

    function on(keyCode, handler) {
        if (typeof keyCode === 'string') {
            handlers[keyCode] = handler;
        } else {
            handlers[keyCode] = handler;
        }
    }

    function off(keyCode) {
        delete handlers[keyCode];
    }

    function clear() {
        handlers = {};
    }

    function setupFocusNavigation() {
        focusables = Array.prototype.slice.call(
            document.querySelectorAll('.screen.active .focusable:not([disabled])')
        );
        focusIndex = 0;
        updateFocus();
    }

    function updateFocus() {
        for (var i = 0; i < focusables.length; i++) {
            focusables[i].classList.remove('focused');
        }
        if (focusables[focusIndex]) {
            focusables[focusIndex].classList.add('focused');
            focusables[focusIndex].focus();
        }
    }

    function focusNext() {
        if (focusables.length === 0) return;
        focusIndex = (focusIndex + 1) % focusables.length;
        updateFocus();
    }

    function focusPrev() {
        if (focusables.length === 0) return;
        focusIndex = (focusIndex - 1 + focusables.length) % focusables.length;
        updateFocus();
    }

    function activateFocused() {
        if (focusables[focusIndex]) {
            focusables[focusIndex].click();
        }
    }

    return {
        KEY: KEY,
        init: init,
        on: on,
        off: off,
        clear: clear,
        setupFocusNavigation: setupFocusNavigation,
        focusNext: focusNext,
        focusPrev: focusPrev,
        activateFocused: activateFocused
    };
})();
