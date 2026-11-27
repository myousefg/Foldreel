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
  - **Block pop-ups and hidden links** - stops pop-up and pop-under windows,
    and hides invisible layers and links that sit over a page to catch your
    clicks (a see-through full-window layer, or a see-through link laid over a
    video). On a page that has already tried a pop-up it also hides floating ad
    boxes pinned to a corner, and ads a script writes into a bare frame above
    the page (a whole-window "offer" wall, a corner offer). A page that has
    done this and then opens another site in a new tab (a redirect) has that tab
    closed, and you stay where you were; the settings page has a switch for it.
    Sign-in, payment and share windows opened by a
    button you press still work. If a site breaks, switch it off for that site
    here; it can also be turned off everywhere, and allowed sites managed, from
    the extension's settings page. Hidden things are only hidden, never deleted,
    and come back when you switch it off.
- **Alt+Shift+F** sends the current page without opening the popup. Rebind it at
  `chrome://extensions/shortcuts`.

## Security notes

- When it starts, is installed, or its popup or settings page opens, the extension tells Foldreel on this
  computer that it exists, and sends its version number and nothing else. While you have pressed "Link the
  extension" in Foldreel (a ten minute window), Foldreel answers with the pairing code, so you do not have to
  copy it. Foldreel only answers from a browser-extension origin, never from a web page.

- The pop-up blocker runs inside every page and frame you open (`<all_urls>`,
  all frames, from document start). It only reads the page's own elements to
  decide what to hide, keeps nothing, and sends nothing anywhere; the only
  message it sends is a count of what it stopped, to this extension's own
  background script, so the popup can show it.
- The floating download button only reacts to a real click, never to a click
  made by the page's own script.

- The pairing code is a separate, persistent secret from the one the desktop
  app uses internally - it's scoped to the `/api/extension/` routes (queue a
  download, send this browser's cookies for a site, check whether cookies are
  already saved). It can't read settings, saved site credentials, or any
  cookies back out of Foldreel.
- Regenerating or disabling the extension from Foldreel's Settings immediately
  invalidates the old code.
- The unsupported-website fallback needs to watch network requests on any
  page (`webRequest` + `<all_urls>`) to spot a direct video link, or a stream
  playlist (`.m3u8` or `.mpd`), the moment the page itself requests it. It
  keeps only plain `<video>`/`<audio>` requests and playlists, ignores every
  other request, remembers the page that made it so the download can send the
  same Referer, and nothing leaves the browser until you actually click Send.
