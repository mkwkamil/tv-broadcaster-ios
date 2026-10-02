# Broadcaster

Send a video from an iPhone browser to a Samsung TV. The phone finds a playable file on the page. The TV plays it with AVPlay, without the page’s ads.

Three pieces share one Firebase room:

| Piece | Path | Role |
| --- | --- | --- |
| iOS app | `Broadcaster/` | Browser, favorites, and the Play button |
| TV app | `tv-app/` | Tizen package that waits for a URL and plays it |
| Proxy | `proxy/` | Cloudflare Worker that turns long HLS links into a short ticket the TV can open |

The default room code is `CAST01`. Change it in both `Broadcaster/AppConfig.swift` and `tv-app/js/config.js`. The Firebase and proxy URLs live in those same files, and the worker URL is also in `proxy/wrangler.toml`.

## How it fits together

1. Open the TV app. It shows the room code and stays red until the phone connects.
2. On the iPhone, enter the same code and tap Connect. The TV turns green.
3. Browse to a page. Detected video files appear at the bottom. Scan searches the open page again.
4. Tap Play. The phone downloads the HLS playlist in its own browser session and uploads it to the worker. The TV receives a short `/t/…/master.m3u8` URL and plays it.

Popups that look like ad trackers are dropped. Player links such as `/e/` and `/embed/` still ask before opening.

## iOS

Open `Broadcaster.xcodeproj`, set your signing team, and run it on a phone. The app needs the network permission already declared for arbitrary loads, because file host pages are plain HTTP as often as HTTPS.

## TV

The installable package is a Tizen `.wgt` built from `tv-app/`. Package and install it with Tizen Studio against your TV, using your own certificate profile. The TV must be on the same network as the computer that runs `sdb`.

Do not commit the built `.wgt` or the signature files Tizen writes into `tv-app/` during packaging.

## Proxy

From `proxy/`:

```bash
npx wrangler deploy --config wrangler.toml
```

The worker must be deployed before Play can hand the TV a ticket. Firebase rules are in `database.rules.json`.
