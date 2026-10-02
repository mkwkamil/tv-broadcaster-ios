# Broadcaster

Send a video from an iPhone to a Samsung TV. The phone finds a playable file on the page. The TV plays that file with AVPlay, without the page’s ads.

| Piece | Path | Role |
| --- | --- | --- |
| iOS app | `Broadcaster/` | Account, TV list, browser, and watch history |
| TV app | `tv-app/` | Tizen package that shows a pairing code and plays the URL the phone sends |
| Proxy | `proxy/` | Cloudflare Worker that turns a video link into a short ticket the TV can open |

The phone and the TV talk through Firebase Realtime Database. The phone signs in with email and password, or Google. The TV has no user account but signs in anonymously, so every write it makes carries an identity. The database URL, API key, and proxy URL live in `Broadcaster/AppConfig.swift` and `tv-app/js/config.js`. The worker name is in `proxy/wrangler.toml`.

The Firebase API key is public by design; access is decided by `database.rules.json`. A TV may only write its own `codes/{code}` entry and its own `tvs/{tvId}` subtree, where `tvId` is its anonymous uid. A phone may only read its own `users/{uid}` data and only queue a video on a TV it is paired with. The worker accepts `POST /ticket` only with a valid Firebase ID token, and serves media on `GET /t/{id}/…` where the id is random and unguessable.

## How it fits together

1. Sign in on the iPhone. A new account asks for a first name and acceptance of the terms.
2. Open the TV app. It shows a 6-digit code.
3. On the phone, add the TV with that code and give it a name. The TV remembers the account. Refresh on the TV forgets paired phones and issues a new code.
4. Pick the TV and browse. Detected video files appear at the bottom. Play uploads the playlist to the worker, gets a ticket, and sends that ticket URL to the TV.
5. History keeps the date and the URL that was sent. Tap an entry to play it again on the selected TV.

The phone and each TV choose a language separately: Polish, English, German, French, Spanish, Italian, Portuguese, Russian, or Turkish. An unknown system language falls back to English.

Popups that look like ad trackers are dropped. Player links such as `/e/` and `/embed/` still ask before opening.

## iOS

Open `Broadcaster.xcodeproj`, set your signing team, and run it on a phone or simulator. The app needs the network permission already declared for arbitrary loads, because file host pages are plain HTTP as often as HTTPS.

## TV

The installable package is a Tizen `.wgt` built from `tv-app/`. Package and install it with Tizen Studio against your TV, using your own certificate profile. The TV must be on the same network as the computer that runs `sdb`.

Do not commit the built `.wgt` or the signature files Tizen writes into `tv-app/` during packaging.

## Proxy

From `proxy/`:

```bash
npx wrangler deploy --config wrangler.toml
```

The worker must be deployed before Play can hand the TV a ticket. Firebase rules are in `database.rules.json`.
