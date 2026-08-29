# SST on TV clients

## Why the Saturn menu does not appear on a TV

SST adds its menu by rewriting `jellyfin-web`'s `index.html` as the server sends it
(`SstHtmlInjectorMiddleware`). That only works for clients that actually fetch that
page from your server.

| Client | Fetches `/web/index.html` from your server? | Why |
| :--- | :---: | :--- |
| Jellyfin Web on a browser (desktop, phone, TV browser) | Yes | SST works normally |
| Jellyfin for Android (mobile app) | Yes | WebView wrapper around your server's web client |
| Jellyfin for Android TV / Google TV | **No** | Fully native app, no `jellyfin-web` anywhere |
| Fire TV | **No** | Same native Android TV app |
| Apple TV (Swiftfin), Roku | **No** | Native apps |
| Samsung Tizen | **No** | `jellyfin-web` is packaged inside the `.wgt` |
| LG webOS | **No** | `jellyfin-web` is packaged inside the `.ipk` |

The smart-TV apps still call your server for the API, but they load their HTML and
JavaScript from inside the app package. Your server never gets a chance to patch it.
Server Custom CSS does reach them, but CSS cannot start JavaScript, so it cannot be
used to load SST.

## What to do instead

### 1. Drive the TV from your phone or PC (works everywhere)

This is the default and needs no setup. While the TV is playing, open Jellyfin on
your phone or computer. SST shows a banner:

> 🪐 Find subtitles for *Living Room TV*

Tap it, pick a subtitle, and SST downloads it and switches the TV to it. If the TV
will not accept the change mid-stream, SST replays the same item from the same
position with the new track already selected, which every native client honours.

You can also cast to the TV first — SST then points at the cast target
automatically.

Turn either behaviour off in **Dashboard → Plugins → Saturn's Subtitle Tweaks**.

### 2. Let the server fetch subtitles by itself

Enable **Download a subtitle automatically when playback starts**. The server
searches your providers whenever something starts playing without a subtitle and
downloads the best match. No UI is involved, so it works on every client.

It is off by default because it runs unattended and calls out to your providers.
It has a per-item timeout, only runs once per item, and never blocks playback.

Note that the client picked up its track list before the download finished, so the
new subtitle may not show until the video is restarted.

### 3. Sideload a Samsung / LG app with SST built in

This is the only way to get the real Saturn menu inside the TV app's own subtitle
list. It means building and sideloading your own app package.

```powershell
.\scripts\patch-tv-web.ps1 -WebDist "C:\src\jellyfin-web\dist"
```

That copies `sst.js` and `sst.css` into the build and adds the tags to its
`index.html`. It is safe to re-run, and `-Revert` undoes it exactly.

Then package as usual:

**Samsung (Tizen)**

```bash
JELLYFIN_WEB_DIR=/path/to/jellyfin-web/dist yarn install
```

Run that in a `jellyfin-tizen` checkout, then `tizen build-web` and `tizen package`
to produce the `.wgt`.

**LG (webOS)**

Copy the patched dist into a `jellyfin-webos` checkout, then build the `.ipk` with
its own packaging script.

Before you commit to this route, be aware:

- It does nothing for Android TV, Google TV, Fire TV, Apple TV or Roku.
- Both platforms require developer mode to sideload, and both expire and need
  periodic renewal.
- Samsung additionally needs a developer certificate.
- You are shipping a patched copy of `jellyfin-web`, so you must re-run the patch
  script after every Jellyfin Web upgrade.

For most setups, option 1 is less work and covers more devices.
