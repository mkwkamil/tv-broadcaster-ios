var Channel = (function () {
    'use strict';

    var eventSource = null;
    var phoneSource = null;
    var roomCode = null;
    var lastQueueKey = null;
    var onMessageCallback = null;
    var pollTimer = null;

    function getBaseUrl() {
        return CONFIG.FIREBASE_DB_URL.replace(/\/$/, '');
    }

    function roomPath(sub) {
        return getBaseUrl() + '/tvs/' + roomCode + (sub ? '/' + sub : '');
    }

    function connect(code, onMessage) {
        roomCode = code;
        onMessageCallback = onMessage;
        lastQueueKey = null;

        disconnect();
        startListening();
        watchTrusted();
    }

    function watchTrusted() {
        openPhoneStream();
    }

    function openPhoneStream() {
        if (typeof EventSource === 'undefined') return;
        try {
            if (phoneSource) {
                phoneSource.close();
                phoneSource = null;
            }
            phoneSource = new EventSource(roomPath('trusted') + '.json');
            phoneSource.addEventListener('put', function () {
                refreshTrusted();
            });
            phoneSource.addEventListener('patch', function () {
                refreshTrusted();
            });
            refreshTrusted();
        } catch (e) {  }
    }

    function refreshTrusted() {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', roomPath('trusted') + '.json?t=' + Date.now(), true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4 || xhr.status !== 200) return;
            var data = null;
            try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
            var connected = !!(data && typeof data === 'object' && Object.keys(data).length > 0);
            if (typeof Pairing !== 'undefined' && Pairing.setConnected) {
                Pairing.setConnected(connected);
            }
        };
        xhr.send();
    }

    function startListening() {
        if (typeof EventSource !== 'undefined') {
            startSSE();
        } else {
            startPolling();
        }
    }

    function startSSE() {
        var url = roomPath('queue') + '.json';
        try {
            eventSource = new EventSource(url);
            eventSource.addEventListener('put', handleSSEEvent);
            eventSource.addEventListener('patch', handleSSEEvent);
            eventSource.onerror = function () {

                if (eventSource && eventSource.readyState !== 2) return;

                if (eventSource) {
                    eventSource.close();
                    eventSource = null;
                }
                startPolling();
            };
        } catch (e) {
            startPolling();
        }
    }

    function handleSSEEvent(event) {
        try {
            var payload = JSON.parse(event.data);
            if (!payload || typeof payload.path !== 'string') return;

            if (payload.path === '/') {
                processQueueData(payload.data);
                return;
            }

            var segments = payload.path.split('/').filter(function (s) {
                return s.length > 0;
            });

            if (segments.length !== 1 || !payload.data) return;

            var single = {};
            single[segments[0]] = payload.data;
            processQueueData(single);
        } catch (e) {  }
    }

    function startPolling() {
        stopPolling();
        pollTimer = setInterval(fetchQueue, 2000);
        fetchQueue();
    }

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    function fetchQueue() {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', roomPath('queue') + '.json?t=' + Date.now(), true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4 && xhr.status === 200) {
                try {
                    var data = JSON.parse(xhr.responseText);
                    processQueueData(data);
                } catch (e) {  }
            }
        };
        xhr.send();
    }

    function processQueueData(data) {
        if (!data || typeof data !== 'object') return;

        var keys = Object.keys(data).sort();
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (lastQueueKey && key <= lastQueueKey) continue;

            var item = data[key];
            if (item && item.url && item.status !== 'consumed') {
                lastQueueKey = key;
                if (onMessageCallback) {
                    onMessageCallback({
                        key: key,
                        url: item.url,
                        title: item.title || '',
                        referer: item.referer || '',
                        timestamp: item.timestamp || Date.now()
                    });
                }
            }
        }
    }

    function setStatus(status, extra) {
        if (!roomCode) return Promise.resolve();

        var payload = {
            state: status,
            timestamp: Date.now()
        };
        if (extra) {
            for (var k in extra) {
                if (extra.hasOwnProperty(k)) payload[k] = extra[k];
            }
        }

        return restPut(roomPath('status'), payload);
    }

    function markConsumed(key) {
        if (!roomCode || !key) return Promise.resolve();
        return restPatch(roomPath('queue/' + key), { status: 'consumed' });
    }

    function restPut(url, data) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('PUT', url + '.json', true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    if (xhr.status >= 200 && xhr.status < 300) resolve();
                    else reject(new Error('PUT failed: ' + xhr.status));
                }
            };
            xhr.send(JSON.stringify(data));
        });
    }

    function restPatch(url, data) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('PATCH', url + '.json', true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    if (xhr.status >= 200 && xhr.status < 300) resolve();
                    else reject(new Error('PATCH failed: ' + xhr.status));
                }
            };
            xhr.send(JSON.stringify(data));
        });
    }

    function disconnect() {
        stopPolling();
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }
        if (phoneSource) {
            phoneSource.close();
            phoneSource = null;
        }
    }

    function getRoomCode() {
        return roomCode;
    }

    return {
        connect: connect,
        disconnect: disconnect,
        setStatus: setStatus,
        markConsumed: markConsumed,
        getRoomCode: getRoomCode
    };
})();
