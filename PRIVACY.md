# Foldreel Privacy Policy

_Last updated September 27, 2026 — applies to the Foldreel desktop app and the Foldreel browser extension._

Foldreel runs entirely on your own computer. There are no accounts, no analytics, and no server
operated by us. Nothing you download, convert, rename, or send through the extension is seen by
anyone but you.

## What Foldreel does not do

- It does not collect, transmit, or store your data anywhere but your own device.
- It does not use analytics, telemetry, crash reporting, or advertising of any kind.
- It does not require or create an account.
- It does not sell or share data, because it never leaves your machine to begin with.

## The desktop app

Foldreel is a local program built on [gallery-dl](https://github.com/mikf/gallery-dl),
[yt-dlp](https://github.com/yt-dlp/yt-dlp), FFmpeg, and aria2c. When you paste a URL, Foldreel
runs these tools on your computer, which connect directly to the site you gave them — the same
as if you'd visited that site yourself in a browser. If you configure a login or cookies for a
site, that is used only to make that same direct request, never sent to us.

Your settings, download history, and saved logins are stored in a local data folder on your own
device (shown in Settings, and deletable at any time). None of it is uploaded anywhere.

## The browser extension

The extension's only job is to hand a link, a hover-selected image or video, or a page's cookies
to the copy of Foldreel already running on your own computer, over your machine's own loopback
address (`127.0.0.1`). It never talks to any server operated by us or by anyone else.

| Permission | What it's for |
| --- | --- |
| `activeTab` | Reads the current tab's URL only when you click the extension, to send that page to Foldreel. |
| `cookies` | Only when you click "Send cookies for this site" — reads that site's cookies and hands them straight to your local Foldreel instance, so it can log in the same way your browser does. Never read automatically, never sent anywhere else. |
| `storage` | Remembers the extension's own settings (like its pairing code) on your device. |
| `contextMenus` | Adds the right-click "Send to Foldreel" menu item. |
| `webRequest` | Identifies the real media URL behind a page's player, so the hover button and context menu know what to send. |
| Host permissions (`<all_urls>`) | The hover-to-send button and right-click menu need to work on any site you're browsing, not a fixed list. |

## Third-party tools

gallery-dl, yt-dlp, FFmpeg, and aria2c ship inside Foldreel as separate, unmodified programs
under their own open-source licenses. Foldreel invokes them as subprocesses; they follow the
same rule as the rest of the app — they talk to the sites you point them at, not to us.

## Changes to this policy

If this policy changes, the update date above will change with it. Continued use of Foldreel
after a change means you accept the revised policy.

---

Foldreel · MIT Licensed · [github.com/myousefg/Foldreel](https://github.com/myousefg/Foldreel)
