/**
 * Ekran oczekiwania. Pokój jest stały i ten sam co w aplikacji iOS.
 */
var Pairing = (function () {
    'use strict';

    var currentCode = null;

    function init(onReady) {
        currentCode = CONFIG.DEFAULT_ROOM || 'CAST01';
        document.getElementById('room-code').textContent = currentCode;
        setConnected(false);
        Utils.saveRoomCode(currentCode);
        if (onReady) onReady(currentCode);
    }

    function getCode() {
        return currentCode;
    }

    function setConnected(connected) {
        var pill = document.getElementById('status-pill');
        var label = document.getElementById('qr-hint');
        if (!pill || !label) return;
        if (connected) {
            pill.classList.remove('is-off');
            label.textContent = 'Połączono';
        } else {
            pill.classList.add('is-off');
            label.textContent = 'Niepołączono';
        }
    }

    function updateQueuePreview(items) {
        var preview = document.getElementById('queue-preview');
        var list = document.getElementById('queue-list');

        if (!items || items.length === 0) {
            preview.classList.add('hidden');
            return;
        }

        preview.classList.remove('hidden');
        list.innerHTML = '';
        for (var i = 0; i < items.length; i++) {
            var li = document.createElement('li');
            li.textContent = Utils.truncate(items[i].url, 80);
            list.appendChild(li);
        }
    }

    return {
        init: init,
        getCode: getCode,
        setConnected: setConnected,
        updateQueuePreview: updateQueuePreview
    };
})();
