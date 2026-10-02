var I18n = (function () {
    'use strict';

    var order = ['pl', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'tr'];
    var names = {
        pl: 'Polski', en: 'English', de: 'Deutsch', fr: 'Français', es: 'Español',
        it: 'Italiano', pt: 'Português', ru: 'Русский', tr: 'Türkçe'
    };
    var pack = {
        codeTitle: {
            pl: 'Kod telewizora', en: 'TV code', de: 'TV-Code', fr: 'Code de la télé', es: 'Código del televisor',
            it: 'Codice della TV', pt: 'Código da TV', ru: 'Код телевизора', tr: 'Televizyon kodu'
        },
        connected: {
            pl: 'Połączono', en: 'Connected', de: 'Verbunden', fr: 'Connecté', es: 'Conectado',
            it: 'Connesso', pt: 'Ligado', ru: 'Подключено', tr: 'Bağlandı'
        },
        disconnected: {
            pl: 'Niepołączono', en: 'Not connected', de: 'Nicht verbunden', fr: 'Non connecté', es: 'Sin conexión',
            it: 'Non connesso', pt: 'Sem ligação', ru: 'Нет подключения', tr: 'Bağlı değil'
        },
        refresh: {
            pl: 'Odśwież', en: 'Refresh', de: 'Aktualisieren', fr: 'Actualiser', es: 'Actualizar',
            it: 'Aggiorna', pt: 'Atualizar', ru: 'Обновить', tr: 'Yenile'
        },
        footer: {
            pl: 'Wpisz kod w aplikacji na iPhonie. Odśwież kasuje zapamiętane telefony.',
            en: 'Enter the code in the iPhone app. Refresh forgets the saved phones.',
            de: 'Gib den Code in der iPhone-App ein. Aktualisieren vergisst die gespeicherten Telefone.',
            fr: 'Saisis le code dans l’app iPhone. Actualiser oublie les téléphones enregistrés.',
            es: 'Escribe el código en la app del iPhone. Actualizar olvida los teléfonos guardados.',
            it: 'Inserisci il codice nell’app iPhone. Aggiorna dimentica i telefoni salvati.',
            pt: 'Escreve o código na app do iPhone. Atualizar esquece os telefones guardados.',
            ru: 'Введи код в приложении на iPhone. Обновить забывает сохранённые телефоны.',
            tr: 'Kodu iPhone uygulamasına yaz. Yenile, kayıtlı telefonları unutur.'
        },
        queue: {
            pl: 'W kolejce', en: 'In queue', de: 'In der Warteschlange', fr: 'En file', es: 'En cola',
            it: 'In coda', pt: 'Na fila', ru: 'В очереди', tr: 'Sırada'
        },
        hint: {
            pl: 'OK: play/pauza  |  ◀ ▶: przewijanie  |  Return: wyjście',
            en: 'OK: play/pause  |  ◀ ▶: seek  |  Return: exit',
            de: 'OK: Play/Pause  |  ◀ ▶: Spulen  |  Return: Beenden',
            fr: 'OK : lecture/pause  |  ◀ ▶ : avance  |  Return : quitter',
            es: 'OK: play/pausa  |  ◀ ▶: salto  |  Return: salir',
            it: 'OK: play/pausa  |  ◀ ▶: avanti  |  Return: esci',
            pt: 'OK: play/pausa  |  ◀ ▶: saltar  |  Return: sair',
            ru: 'OK: пуск/пауза  |  ◀ ▶: перемотка  |  Return: выход',
            tr: 'OK: oynat/duraklat  |  ◀ ▶: sarma  |  Return: çık'
        },
        language: {
            pl: 'Język', en: 'Language', de: 'Sprache', fr: 'Langue', es: 'Idioma',
            it: 'Lingua', pt: 'Idioma', ru: 'Язык', tr: 'Dil'
        },
        errorTitle: {
            pl: 'Wystąpił błąd', en: 'Something went wrong', de: 'Ein Fehler ist aufgetreten', fr: 'Une erreur est survenue', es: 'Ha ocurrido un error',
            it: 'Si è verificato un errore', pt: 'Ocorreu um erro', ru: 'Произошла ошибка', tr: 'Bir hata oluştu'
        },
        playFailed: {
            pl: 'Nie udało się odtworzyć strumienia', en: 'The stream could not be played', de: 'Der Stream konnte nicht abgespielt werden', fr: 'Le flux n’a pas pu être lu', es: 'No se pudo reproducir el stream',
            it: 'Impossibile riprodurre lo stream', pt: 'Não foi possível reproduzir o stream', ru: 'Не удалось воспроизвести поток', tr: 'Akış oynatılamadı'
        },
        notVideo: {
            pl: 'To nie jest plik wideo. Uruchom go z aplikacji na iPhonie.',
            en: 'This is not a video file. Start it from the iPhone app.',
            de: 'Das ist keine Videodatei. Starte sie in der iPhone-App.',
            fr: 'Ce n’est pas un fichier vidéo. Lance-le depuis l’app iPhone.',
            es: 'Esto no es un archivo de vídeo. Ábrelo desde la app del iPhone.',
            it: 'Questo non è un file video. Avvialo dall’app iPhone.',
            pt: 'Isto não é um ficheiro de vídeo. Abre-o na app do iPhone.',
            ru: 'Это не видеофайл. Запусти его из приложения на iPhone.',
            tr: 'Bu bir video dosyası değil. iPhone uygulamasından başlat.'
        },
        badUrl: {
            pl: 'Nieprawidłowy URL', en: 'Invalid URL', de: 'Ungültige URL', fr: 'URL invalide', es: 'URL no válida',
            it: 'URL non valido', pt: 'URL inválido', ru: 'Неверный URL', tr: 'Geçersiz URL'
        },
        connectFailed: {
            pl: 'Nie udało się połączyć ze źródłem wideo', en: 'Could not connect to the video source', de: 'Keine Verbindung zur Videoquelle', fr: 'Connexion à la source vidéo impossible', es: 'No se pudo conectar con la fuente de vídeo',
            it: 'Connessione alla sorgente video non riuscita', pt: 'Não foi possível ligar à fonte de vídeo', ru: 'Не удалось подключиться к источнику видео', tr: 'Video kaynağına bağlanılamadı'
        },
        connectFailedBoth: {
            pl: 'Nie udało się połączyć – próbowano bezpośrednio i przez proxy',
            en: 'Could not connect, neither directly nor through the proxy',
            de: 'Keine Verbindung, weder direkt noch über den Proxy',
            fr: 'Connexion impossible, ni directe ni via le proxy',
            es: 'No hubo conexión, ni directa ni por el proxy',
            it: 'Connessione non riuscita, né diretta né tramite proxy',
            pt: 'Sem ligação, nem direta nem pelo proxy',
            ru: 'Нет соединения ни напрямую, ни через прокси',
            tr: 'Bağlantı kurulamadı, ne doğrudan ne de proxy ile'
        },
        connecting: {
            pl: 'Łączenie...', en: 'Connecting...', de: 'Verbinden...', fr: 'Connexion...', es: 'Conectando...',
            it: 'Connessione...', pt: 'A ligar...', ru: 'Подключение...', tr: 'Bağlanıyor...'
        },
        viaProxy: {
            pl: 'Próbuję przez proxy...', en: 'Trying through the proxy...', de: 'Versuch über den Proxy...', fr: 'Essai via le proxy...', es: 'Probando por el proxy...',
            it: 'Provo tramite proxy...', pt: 'A tentar pelo proxy...', ru: 'Пробую через прокси...', tr: 'Proxy ile deneniyor...'
        },
        streamCut: {
            pl: 'Odtwarzanie przerwane przez błąd strumienia', en: 'Playback stopped because the stream failed', de: 'Wiedergabe wegen eines Streamfehlers gestoppt', fr: 'Lecture interrompue par une erreur de flux', es: 'La reproducción se cortó por un error del stream',
            it: 'Riproduzione interrotta da un errore dello stream', pt: 'A reprodução parou por um erro do stream', ru: 'Воспроизведение прервано из-за ошибки потока', tr: 'Oynatma akış hatasıyla kesildi'
        },
        hlsFailed: {
            pl: 'AVPlay nie odtworzył tego strumienia HLS', en: 'AVPlay could not play this HLS stream', de: 'AVPlay konnte diesen HLS-Stream nicht abspielen', fr: 'AVPlay n’a pas lu ce flux HLS', es: 'AVPlay no reprodujo este stream HLS',
            it: 'AVPlay non ha riprodotto questo stream HLS', pt: 'O AVPlay não reproduziu este stream HLS', ru: 'AVPlay не воспроизвёл этот HLS-поток', tr: 'AVPlay bu HLS akışını oynatamadı'
        },
        buffering: {
            pl: 'Buforowanie...', en: 'Buffering...', de: 'Puffern...', fr: 'Mise en mémoire...', es: 'Cargando...',
            it: 'Buffer...', pt: 'A bufferizar...', ru: 'Буферизация...', tr: 'Arabelleğe alınıyor...'
        },
        pause: {
            pl: 'Pauza', en: 'Paused', de: 'Pause', fr: 'Pause', es: 'Pausa',
            it: 'Pausa', pt: 'Pausa', ru: 'Пауза', tr: 'Duraklatıldı'
        },
        notFound: {
            pl: 'Nie znaleziono strumienia wideo na tej stronie', en: 'No video stream was found on this page', de: 'Auf dieser Seite wurde kein Videostream gefunden', fr: 'Aucun flux vidéo trouvé sur cette page', es: 'No se encontró un stream de vídeo en esta página',
            it: 'Nessuno stream video trovato in questa pagina', pt: 'Não foi encontrado um stream de vídeo nesta página', ru: 'На этой странице не найден видеопоток', tr: 'Bu sayfada video akışı bulunamadı'
        }
    };

    var code = localStorage.getItem('broadcaster.language') || detect();

    function detect() {
        var lang = (navigator.language || 'en').slice(0, 2).toLowerCase();
        return names[lang] ? lang : 'en';
    }

    function t(key) {
        var row = pack[key];
        if (!row) return key;
        return row[code] || row.en || key;
    }

    function nativeName() {
        return names[code] || names.en;
    }

    function apply() {
        document.documentElement.lang = code;
        var nodes = document.querySelectorAll('[data-i18n]');
        for (var i = 0; i < nodes.length; i++) {
            nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
        }
        var button = document.getElementById('language-button');
        if (button) button.textContent = nativeName();
        var pill = document.getElementById('status-pill');
        if (pill && typeof Pairing !== 'undefined' && Pairing.setConnected) {
            Pairing.setConnected(!pill.classList.contains('is-off'));
        }
    }

    function set(next) {
        if (!names[next]) return;
        code = next;
        localStorage.setItem('broadcaster.language', code);
        apply();
    }

    function open() {
        var list = document.getElementById('language-list');
        if (!list) return;
        list.innerHTML = '';
        for (var i = 0; i < order.length; i++) {
            var item = order[i];
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'language-option focusable' + (item === code ? ' is-current' : '');
            button.textContent = names[item];
            button.onclick = (function (chosen) {
                return function () {
                    set(chosen);
                    close();
                };
            })(item);
            list.appendChild(button);
        }
        Utils.showScreen('screen-language');
        if (typeof Pairing !== 'undefined') Pairing.setAccepting(false);
        Keys.clear();
        Keys.on(Keys.KEY.UP, function () { Keys.focusPrev(); return true; });
        Keys.on(Keys.KEY.DOWN, function () { Keys.focusNext(); return true; });
        Keys.on(Keys.KEY.ENTER, function () { Keys.activateFocused(); return true; });
        Keys.on(Keys.KEY.RETURN, function () { close(); return true; });
        Keys.on(Keys.KEY.BACK, function () { close(); return true; });
        Keys.setupFocusNavigation();
    }

    function close() {
        Utils.showScreen('screen-pairing');
        if (typeof Pairing !== 'undefined') Pairing.setAccepting(true);
        if (typeof App !== 'undefined' && App.restorePairingKeys) App.restorePairingKeys();
    }

    return { t: t, set: set, apply: apply, open: open, nativeName: nativeName };
})();
