<div align="center">

# Foldreel

### Paste a link. Foldreel grabs it.

A native Windows desktop app for downloading photos, videos, and galleries from your favorite
sites. No command line, no config files, no browser extensions to babysit.

[![Version](https://img.shields.io/badge/version-3.0.0-blue?style=flat-square)](https://github.com/myousefg/Foldreel/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D6?style=flat-square&logo=windows&logoColor=white)](https://github.com/myousefg/Foldreel/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Downloads](https://img.shields.io/github/downloads/myousefg/Foldreel/total?style=flat-square&label=downloads)](https://github.com/myousefg/Foldreel/releases)

[Download](#download) &nbsp;&middot;&nbsp;
[Features](#features) &nbsp;&middot;&nbsp;
[Supported sites](#supported-sites) &nbsp;&middot;&nbsp;
[FAQ](#frequently-asked-questions) &nbsp;&middot;&nbsp;
[Contributing](#contributing)

</div>

---

## Features

- **Paste and go.** Drop in one link or a whole list, one per line. Each becomes its own job in
  the queue.
- **Full albums, not just previews.** Foldreel pulls the original files at full resolution, not the
  compressed thumbnails a site shows in its feed.
- **Live queue.** Watch progress per download, with a streaming log, in real time.
- **Preview before you commit.** See exactly what a link will download before it downloads
  anything.
- **Searchable history.** Every finished download, with one click to open the folder or grab it
  again.
- **Built-in logins.** Cookies, username and password, or OAuth, all saved per site so you only
  set it up once.
- **YouTube support.** Paste a YouTube link and pick a quality and format, audio-only included.
- **Automatic GIF conversion.** A Twitter/X "GIF" is secretly a video file. Foldreel notices and
  turns it into a real, shareable `.gif`.
- **Skip what you already have.** Re-run the same link later and only new files download.
- **Watch a page.** Turn any URL into a recurring check (15 minutes up to 24 hours) instead of a
  one-off download - only whatever's new since last time actually downloads.
- **Convert or compress.** Drop any photo or video, not just something Foldreel downloaded - HEIC and
  MOV from an iPhone convert straight to JPG and MP4, with a quality control for shrinking file size,
  plus a manual GIF converter with its own FPS/size/time-range controls. Settings can also do this
  automatically for every future download.
- **Bulk rename.** Pick specific files or folders - anywhere on disk, not just Foldreel downloads -
  drag them into the order you want, and rename them all at once with a shared name and sequence.
  Every rename is undoable.
- **A browser extension** to send the current tab straight to Foldreel without switching windows,
  including a hover button over any image or video on a page, a one-click cookies.txt export for
  the site you're on, and a fallback for unsupported websites with no visible download link at all.
- **45 languages**, with automatic detection of your system language and full right-to-left
  support.
- **Light, dark, or system theme**, keyboard and screen-reader friendly throughout.
- **Runs in the background.** Minimizes to the tray and keeps downloading while you do other
  things.

Foldreel never touches gallery-dl configuration or caches you may already have on your machine. It
keeps everything in its own folder, completely separate.

---

## Download

**Requires Windows 10 or 11, 64-bit.**

1. Grab the installer from the [latest release](https://github.com/myousefg/Foldreel/releases/latest).
2. Run `Foldreel-Setup-x.x.x.exe`. Since the app isn't code-signed yet, Windows SmartScreen may show
   a warning the first time. Click **More info**, then **Run anyway**.
3. That's it. No administrator permissions needed, and Foldreel launches automatically once
   installed.

Everything else is built in - gallery-dl, yt-dlp, FFmpeg, and aria2c all ship inside the
installer, so nothing downloads after install.

**Updating:** Foldreel checks for new releases automatically and lets you know from Settings. You
can also just download and run the latest installer at any time; it upgrades your existing
install in place.

**Uninstalling:** remove it the normal way, from *Apps* in Windows Settings. Your downloaded
files are never touched, they live wherever you told Foldreel to save them.

---

## Supported sites

Foldreel supports every site [gallery-dl](https://github.com/mikf/gallery-dl) does, well over 300
in total. Most work instantly with no setup. A few need you to be logged in first, which you set
up once from the **Sites** page:

| What's needed | Examples |
| --- | --- |
| Nothing | Danbooru, e621, most boorus, public Reddit posts, direct image links |
| Login (cookies) | Instagram, Twitter/X, Patreon, Pixiv FANBOX, Fantia |
| Account (optional, raises limits) | DeviantArt, Flickr, Tumblr, Reddit, Mastodon, Pixiv |

Logging in takes one of three forms depending on the site, all handled from the same page:

- **Pick your browser.** Foldreel reads the cookies straight from a browser you're already logged
  into. No exporting anything.
- **Drop in a cookies file.** If you'd rather export a `cookies.txt`, Foldreel picks it up
  automatically.
- **Sign in through the site.** For sites that support it, a one-click **Authorize** button opens
  the site's own login page and stores the result for you.

---

## Frequently asked questions

### Downloads from Chrome, Edge, or Brave aren't working

Chromium-based browsers lock their cookie file while they're running, so Foldreel can't read it.
Firefox doesn't have this problem. Your options, easiest first:

1. **Switch to Firefox** for the sites you need to be logged into. Log in once, point Foldreel at
   Firefox, and it works whether Firefox is open or closed.
2. **Fully close your Chromium browser** (including its tray icon) before downloading.
3. **Export a `cookies.txt` file** using a browser extension like "Get cookies.txt", and upload it
   on the Sites page. This works even while the browser stays open.

Foldreel shows a warning on the Sites page when this is likely to be the problem.

### Instagram downloads suddenly stop working

If you retry the same profile too many times in a short window, Instagram temporarily blocks your
IP address, even with valid cookies. Wait 30 to 60 minutes, and consider turning on **Sleep
between requests** in Settings to space out future downloads.

### Do I need to keep my browser open?

No, as long as you've logged into the site at least once so the cookie exists (Firefox users can
close it entirely; Chromium users just need it closed while downloading, see above).

### Does Foldreel need to stay open?

While something is downloading, yes. Closing the window sends Foldreel to the system tray and your
downloads keep going in the background. Choose **Exit** from the tray icon to stop everything.

### Where are my downloaded files?

Wherever you set your download folder to, in Settings. That's completely separate from Foldreel's
own data (your saved logins, history, and settings), which lives in your Windows user profile and
never mixes with your media.

---

## Tools

Foldreel is built on top of a few excellent open-source projects, all bundled inside the
installer - nothing to install separately:

| Tool | What it's for |
| --- | --- |
| [gallery-dl](https://github.com/mikf/gallery-dl) | The engine behind almost every download |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Powers YouTube and other video-site downloads |
| [FFmpeg](https://github.com/FFmpeg/FFmpeg) | Converts files, including the automatic GIF conversion |
| [aria2](https://github.com/aria2/aria2) | Splits large video downloads into parallel connections |

---

## Contributing

Issues and pull requests are welcome. For anything beyond a small fix, please open an issue first
to talk through the approach.

### Running it locally

You'll need [Node.js](https://nodejs.org) 18+, [Python](https://python.org) 3.10+, and Yarn
(`npm install -g yarn`).

```bash
scripts\dev.bat
```

This installs everything needed and opens Foldreel in development mode. React changes hot-reload;
changes to `backend/server.py` or the Electron files need a restart.

Building an installer additionally needs `bin/gallery-dl.exe`, `bin/yt-dlp.exe`, `bin/ffmpeg.exe`,
`bin/ffprobe.exe`, and `bin/aria2c.exe` (bundled into the app itself, so not checked into git):

```bash
scripts\fetch-bin-tools.ps1
scripts\build-exe.bat
```

### Project layout

```
foldreel/
├── electron/       Desktop shell: window, tray, backend process management
├── frontend/       React UI (pages, components, state)
├── backend/        Python/FastAPI download engine
├── extension/      The companion browser extension
└── scripts/        Dev and build scripts
```

To build an installer yourself, run `scripts\build-exe.bat`.

---

## License

Foldreel is released under the [MIT License](LICENSE). The tools it uses under the hood
(gallery-dl, yt-dlp, FFmpeg) keep their own separate licenses.
