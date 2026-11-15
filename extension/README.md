# Foldreel browser extension

Sends the current tab (or a right-clicked link) straight to Foldreel running on
this computer, instead of copy-pasting the URL into the app. Same-machine
only - it talks to `http://127.0.0.1:8767`, Foldreel's own loopback API, and
never leaves localhost.

## Install

From the [Chrome Web Store](https://chromewebstore.google.com/detail/ipmdcekleimdpcnokecigllimfcjaekn), or by hand:

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `extension/` folder.

Then connect it to Foldreel:

1. In Foldreel, go to **Advanced → Extension → Enable** and copy the pairing code.
2. Click the Foldreel toolbar icon, paste the code into the popup, and click **Connect**.

## Use

- Click the toolbar icon to open a small popup with the current tab's URL and
  a **Send to Foldreel** button. On a YouTube page it also shows the quality
  and format picker, same as the Dashboard's.
- Right-click a link (or the page) → **Send to Foldreel** sends it immediately,
  no popup - a green check flashes on success; a red `!` means Foldreel isn't
  running; an amber `?` means the pairing code was revoked or rotated -
  reconnect from the popup.
- On an unsupported website whose player points straight at a file Foldreel
  can't otherwise reach, the popup shows a **Link to send** picker when it
  spots one. Choose the detected direct file link to send the real file
  together with the page it came from, which most such sites need to allow
  the download at all.
- The **This site** panel in the popup has two per-site controls:
  - **Floating download button** - the small button that appears when you
    hover an image or video. Switch it off for sites where it gets in the way.
    It can also be turned off everywhere, and hidden sites managed, from the
    extension's settings page (the **Settings** link in the popup). Changes apply
    to open tabs immediately.
  - **Login cookies** - sends this browser's cookies for the site to Foldreel so
    downloads work the way you're logged in. If Foldreel already has cookies for
    the site the button says **Replace**, and sending overwrites the saved
    copy (refresh them after you log in again). Cookies are only ever sent when
    you press it.
- **Alt+Shift+F** sends the current page without opening the popup. Rebind it at
  `chrome://extensions/shortcuts`.

## Security notes

- The pairing code is a separate, persistent secret from the one the desktop
  app uses internally - it's scoped to the `/api/extension/` routes (queue a
  download, send this browser's cookies for a site, check whether cookies are
  already saved). It can't read settings, saved site credentials, or any
  cookies back out of Foldreel.
- Regenerating or disabling the extension from Foldreel's Settings immediately
  invalidates the old code.
- The unsupported-website fallback needs to watch network requests on any
  page (`webRequest` + `<all_urls>`) to spot a direct video link the moment
  the page itself requests it. It only ever looks at plain `<video>`/`<audio>`
  element requests, ignores everything else, and nothing leaves the browser
  until you actually click Send.
