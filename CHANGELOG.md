# Changelog

All notable changes to Foldreel are recorded here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [1.2.0] - 2026-11-27

### Added
- **Edit**, a new page below Organize for basic photo, video and sound editing, laid out like a video editor:
  tools on the left, a live preview, and a timeline underneath. Nothing is changed in place; Save a copy writes
  a new file next to the original.
  - Trim a video or sound by dragging the two handles on the timeline (or I and O at the playhead), with the
    frames and the sound wave shown on the strip, a playhead you can scrub, and Space to play.
  - Crop with a draggable frame and shapes (Free, Original, 1:1, 4:5, 9:16, 16:9, 4:3, 3:2), turn left or right,
    and flip sideways or upside down.
  - **Looks** (Vivid, Warm, Cool, Faded, Sepia, Black and white, Noir) shown on your own picture, plus
    brightness, contrast and colour, speed from 0.25x to 4x, volume up to 200%, remove the sound, and fade the
    sound or the picture in and out.
  - **Text** on the picture: up to six lines with a size, colour and optional box, dragged into place.
  - **Save frame** writes the picture at the playhead of a video as a PNG.
  - Zoom the timeline, step one frame at a time, jump to the start or end, and loop the part you keep.
  - Save as MP4, WebM, GIF, MP3 (sound only), or JPG, PNG and WebP for photos, at High, Balanced or Smaller
    quality and at 2160p down to 480p, with progress and Cancel. Undo and redo, and Reset all.
  - Open a file from the Library with right-click, Edit.
- **Direct links on Downloads.** A pasted link to a file (a picture, video or sound) says "Direct file link
  detected", and a video stream link (`.m3u8`, `.mpd`) is downloaded with the video engine, joined into one video.
- **Watch** can save each watch to its own folder (a Save to menu on the add bar and on every row), shows the creator's own picture when the site gives one, a click on the link text copies it, and the
  list of files shows where they were saved, with each file's name (click to copy its path).
- **Extension linking.** Foldreel notices an installed extension by itself (it shows its version and when it last
  checked in), and Link the extension connects it in one click. Typing a pairing code is still there. The
  extension only works with the browser on the same computer.
- **Engine** (Advanced) is rebuilt: Downloads at once, Speed limit, Wait between requests and Retries are menus
  of the usual choices instead of typed codes, "Files per download" has Newest 10 to 200 or a custom range, and
  there is Reset to defaults.
- In the Library, a video now plays inside Foldreel when you double-click it. Hold Ctrl and drag to slide across
  many files and select them, even starting on a file.
- **Settings** is rebuilt like Advanced: Files has the download folder with a Change button, folder layout and
  file names, then conversion, deleting and storage, with the technical configuration tucked away. Theme is three
  buttons.
- **History**: the Clear button follows the filter. Under Done it clears only the done jobs, under Error only the
  failed ones, and its question says how many.
- **Browser mode for TikTok** (Advanced, Engine). TikTok sometimes answers the built-in downloader with HTTP 403.
  With this on, TikTok videos are downloaded by yt-dlp posing as a real browser, into tiktok/<user>/, while photo
  posts and the profile picture still come from gallery-dl. The progress bar counts posts (3 of 40) and never goes
  backwards, and the log lists each file as it downloads. It keeps its own record so a Watch fetches only new
  posts, and respects the proxy, speed limit, wait and retry settings. Off by default.
- Instagram is drawn in black and white instead of pink.
- The tour has steps for the Library and Edit, and its text is up to date.
- The Library has a **select mode**: press and hold a file, or drag a box over files, and every click then picks
  or drops a file. Cancel, or doing something with the selection (move, copy, delete, favorite, tags), ends it.
  A single click, Ctrl and Shift still work as before, and a double click still opens a file.
- The Library remembers the folder you were in when you leave and come back.

- **Library**, a new page that works like a file manager for your download folder.
  - Browse by folder with a folder tree on the left, or choose Everything and group by month, folder,
    creator, series, site or type. Search, sort, and filter photos or videos.
  - Five views: Details, Tiles, and Small, Medium and Large icons. Click a column heading in Details to sort.
  - Select with a click, Ctrl or Shift, Ctrl+A, arrow keys, or by dragging a box over the pictures.
  - Right-click for Open, Cut, Copy, Paste, Rename, Move to, Favorite, Tags, Convert, Organize, Copy path,
    Properties and Delete. F2 renames in place, and Ctrl+Z undoes a move or rename.
  - Drag pictures onto a folder to move them (hold Alt to copy), or onto Favorites or a tag.
  - New folder, favorites, tags, and a details panel with a preview, size and dimensions.
  - **Duplicates** finds identical files, and "Keep one of each" selects the extra copies.
  - It refreshes by itself when a download finishes or you change files in Explorer, and stays fast with
    tens of thousands of files.
- **Delete** in the Library. By default it moves files to the Recycle Bin without asking. In Settings, Files you
  can switch it to delete permanently, which asks first, like Windows. Shift+Delete always asks.
- **Pop-up and hidden-link blocker** in the browser extension (version 1.2.0). It stops pop-up and pop-under
  windows, and hides invisible layers and links that sit over a page to catch your clicks. On pages that already
  tried a pop-up it also hides floating ad boxes. It also hides ads that a script writes into a bare frame pinned
  above the page, such as a whole-window "offer" wall or a corner offer box, and closes a tab that such a page
  opens to another site (a redirect), unless it is a sign-in, payment or share page. Switch it off everywhere in
  the extension's settings, or for one site from the toolbar popup; closing tabs has its own switch.
- **Check all now** on the Watch page, and bigger Watch pictures that open at full size.
- Convert shows files as a list, medium, or large pictures, like Organize.
- A clear drop cue over the whole window while you drag files into Convert or Organize, and an
  **Add more files** row under the list.
- Stream links: the extension now spots HLS and DASH playlists (`.m3u8`, `.mpd`) that a page loads with script,
  and sends them with the page they came from as the Referer. Hosts that answer a request without it with a
  placeholder clip now return the real video.

### Changed
- The Library is translated into all 44 non-English languages: its views, columns, menus, dialogs, duplicate
  finder and tags, plus the new "When deleting files" setting. These are machine translations and should be
  reviewed by a native speaker. The newest strings (Edit, the Engine page, extension linking) show in English
  until they are translated.
- Organize: Choose files and Choose folders are separate buttons (Windows cannot show both in one picker, so
  choosing "files or folders" only ever listed folders). While you drag a row, the others shrink to one line so
  the whole list fits on screen; they return to the chosen size on drop.
- Downloads no longer shows a Recently finished section; History is the place for that.
- Less explaining text: obvious descriptions were removed from Edit, Settings and the Engine page.
- The old **Library** page is now **History**.
- Creator and series are remembered when a download finishes, even though the metadata files are deleted
  afterwards, so the Library can group by them.

### Fixed
- History: switching between All, Done and Error could leave rows behind or pile them up. Days are now ordered by
  when a download finished, so each day appears once.
- Convert and Organize: dragging files over the window no longer stutters (the blurred cover was slow), and
  dragging rows in Organize no longer jumps or overlaps when the page is scrolled.
- Library: the highlight on a selected file in the first row or column was clipped at the edge, and dragging a
  box over files was jerky in big folders. It now does its work once per frame and keeps scrolling while you
  hold the pointer near an edge.
- History showed pictures from other creators for a download that found everything already saved (for example a
  profile whose posts sit in more than one creator folder). A download now remembers the files it skipped and
  shows those. Older entries show nothing rather than someone else's pictures.
- TikTok pages that fail with HTTP 403 (TikTok's bot protection, not a login problem) now say so, instead of
  telling you to set up cookies, and point to the new Browser mode for TikTok.
- Pasted stream links named `index` no longer overwrite or get skipped as "already downloaded"; each link
  keeps its own file, and running a link again replaces it.
- The History panel shows pictures again when a download's recorded file name differs from the one on disk,
  and when a Watch re-check skipped everything. Its "+N" button counts what is really on disk, and a note says
  how many files are no longer in the folder.
- Extension: the floating download button now ignores clicks made by the page's own script, so a web page can no
  longer start a download by clicking it.

## [1.1.0] - 2026-11-14

### Changed
- **New interface.** Downloads is a workspace: a composer for the link and its options, a table-style
  queue with progress, and a grid of recently finished downloads underneath. The Library is grouped by day with
  thumbnails and a slide-over inspector. Settings has a category list on the left. Every page has a header
  with its own actions, a new palette taken from the app icon, native Windows fonts, and sentence-case labels.
- Lists sit directly on the page instead of in boxes, with less explanatory text throughout.
- Site logos (bundled with the app, nothing is fetched) in the queue, Library and Sites.
- The Library inspector shows pictures and video frames at their real proportions, and closes when you click anywhere outside it.
- Convert hides Quality for formats it does not apply to (PNG, GIF) and explains each level; Convert and Organize can clear every selected file.
- Organize can show the selected files as a list or as medium or large pictures, so you can see which is which before renaming.
- The app no longer loads fonts from Google's servers, which also removes the only request it made at
  startup apart from the update check.

### Added
- **Import from Grabbr** (Settings): brings across settings, history, watches, logins, cookies and the download
  record, and can reconnect an existing download folder in place. The old install is only ever read, and
  Foldreel's own data is backed up first.
- **Component updates** (Settings, About): check gallery-dl, yt-dlp, ffmpeg and aria2c for new versions and update
  them in the background. Downloads are verified against the checksum GitHub publishes, and a build that
  does not run is never installed. In the Microsoft Store build, components update with the app instead.
- Video to picture conversion: save a single frame of a video as JPG, PNG or WEBP.
- Browser extension: a floating-button switch (everywhere, or per site), a cookies button that says Replace when
  Foldreel already has the site's cookies, a settings page, and an Alt+Shift+F shortcut.
- Automated tests (backend and frontend) for the first time.

### Fixed
- Selecting files for bulk rename or conversion could arrive out of order (5-20, then 1-4), which numbered the
  wrong files. Each batch is now sorted by name.
- Settings changes and job start-up could race on the generated config file.
- Two copies of one file in a single conversion batch could overwrite each other's output.
- The tray's Resume Queue restored a stale concurrency value; a timed-out sign-in showed the wrong message;
  opening the log of a job that never ran caused a server error.
- Dark-mode error text and delete icons were nearly invisible (about 1.9:1 contrast); now about 5:1.
- The version check could fail at random on some Windows machines (a certificate verification hiccup).
- The Microsoft Store build no longer tries to update itself from GitHub.

### Updated
- gallery-dl 1.33.0-dev (2026.11.14) and yt-dlp 2026.10.26. FFmpeg 9.0.2 and aria2c 1.37.0 are already current.

## [1.0.0] - 2026-09-27

### Changed
- **Renamed from Grabbr to Foldreel.** The old name collided with an existing Mac/iOS app, a
  Chrome extension that had already renamed itself away from it, and a long-established
  open-source booru downloader - real enough trademark/confusion risk to rename before a wider
  release. Every user-visible string, the installer, the extension, and all 45 locale files now
  say Foldreel; environment variables (`FOLDREEL_DATA`, `FOLDREEL_PORT`, etc.) and the extension's
  API headers were renamed to match.
- **New app icon.** A friendlier, more distinct mark (folded photo card + a play/reel badge) to
  stand apart from generic download-arrow icons in the space.
- **gallery-dl, yt-dlp, FFmpeg, and aria2c now ship inside the installer itself** instead of
  downloading on first use. This fixes the permission-error class of failures some users hit on
  first launch (Windows Defender scanning a freshly-downloaded exe) by removing the download step
  entirely - nothing to fetch, nothing to fail. The installer is correspondingly larger; a tool
  update now ships with the next Foldreel release rather than being fetchable independently.
- Added a Microsoft Store (MSIX/appx) packaging target (`yarn dist:store`) alongside the existing
  NSIS installer.

## [2.1.0] - 2026-09-27

### Added
- **Organize page (Bulk rename)**: pick specific files or folders - anywhere on disk, not just
  Foldreel's own download folder - drag them into whatever order they should be numbered in, and
  rename all of them at once from a shared name and a template (`{name}`, `{n}`, `{sequence}`,
  `{originalname}`, `{originalname_stripped}`). Folders default to keeping their own name and just
  renumbering; files default to one shared name plus a sequence. Every rename is logged and
  individually undoable.
- **GIF converter**: the Convert page's video targets now include GIF, with its own FPS, width, and
  start/end time-range controls, separate from the quality control the other formats use.
- **"Video (yt-dlp)" mode** on Dashboard, for a video a site's own extractor can't grab. Foldreel also
  now retries automatically through its bundled yt-dlp whenever gallery-dl has no extractor at all
  for a URL, before giving up.
- **Extension: hover to send.** Hovering an image or video on any page now shows a small button to
  send it straight to Foldreel, no right-click needed.
- **Extension: cookies.txt export.** A new "Send cookies for this site" button hands Foldreel the
  active tab's cookies directly - the same result as the separate "Get cookies.txt LOCALLY"
  extension Foldreel's Sites page still links to, minus the export-then-upload round trip.
- **Real thumbnails** wherever files are listed (Convert, Organize), resized and cached on the
  backend instead of the browser decoding full-resolution originals at icon size - also fixes
  noticeable lag when a list had a lot of large photos in it.
- Extension popup now shows its own version number.

### Changed
- Sidebar: Sites moved below Advanced (it's account/auth configuration, not a core downloading
  feature); Organize sits after Convert.
- Convert's format/quality selectors are now always visible, not just after a file is staged, so you
  can set the target format before dropping anything.
- Button, switch, and dropdown press animations no longer overshoot into a "bigger" flash on
  release; a Select dropdown no longer plays two competing scale animations (its own trigger and its
  popover) at once when it opens.

### Fixed
- Convert's bulk format/quality selectors only applied to newly-dropped files, not ones already
  staged.
- Tool downloads (gallery-dl/ffmpeg/yt-dlp) could fail with a permission error right after
  downloading - most likely Windows Defender scanning the file the instant it lands - now retries
  automatically instead of surfacing a false failure.
- Extension's hover button didn't appear over video players (X/Twitter included) that render
  `<video>` behind an interactive overlay div; detection now checks the whole element stack at the
  cursor, not just the topmost hit-tested element.

### Security
- Pillow (processes every downloaded/converted image) bumped from 11.2.1 to 12.3.0, fixing several
  CVEs disclosed against the older version.

## [2.0.0] - 2026-09-18

A ground-up UI pass plus two new features - the biggest release since 1.0, hence the major version.

### Added
- **Convert page**: drop any photo or video (not just something Foldreel downloaded) and convert or
  compress it - HEIC/WEBP/PNG/BMP/AVIF/TIFF to JPG/PNG/WEBP, and MOV/MKV/AVI/WMV and friends to
  MP4/WEBM, with a High/Medium/Low quality control. Built specifically around the two most common
  cases: iPhone photos (HEIC) and screen recordings (MOV) that plenty of apps still can't open.
- **Default photo/video format** (Settings > Files): auto-normalizes every future download to a
  format of your choice - handy when the same site hands you jpg, JPEG, JPG, and webp
  interchangeably. Off by default; jpg/jpeg is a free rename, an actual format change re-encodes
  through the same engine Convert uses.
- **Media-type folder sorting**: a new `{type}` token in the "Insert field" menu on Dashboard's
  custom folder template, resolving to Photos, Videos, GIFs, or Audio based on the actual file.
- Watch rows now expand to show the files from their last successful check, and always run with
  incremental downloading on regardless of the global "Skip already-downloaded" setting - a watch
  that isn't strictly incremental would just re-download everything on every tick.
- Onboarding tour now covers Watch and Convert.

### Changed
- Sidebar's active-page highlight is now a tinted background with a left accent bar instead of a
  flat solid fill. Sidebar order is now Dashboard, History, Watch, Convert, Sites.
- Job cards get a status-colored left border for scanning a busy queue at a glance, not just the
  status pill's text.

### Fixed
- "Skip already-downloaded" turned off still silently skipped files that already existed on disk -
  the setting only ever disabled Foldreel's own download-archive, not gallery-dl's separate,
  always-on-by-default on-disk check. Turning it off now means what it says.

## [1.5.0] - 2026-09-17

### Added
- Watch a page: a new Watch page (sidebar) turns any URL into a recurring check (15 minutes up to
  24 hours), and Dashboard has a quick "Watch" button for the URL you've already pasted. Foldreel
  re-runs it on that schedule and only downloads anything new, the same skip-already-downloaded
  logic a normal re-run already relies on, so a check that finds nothing never clutters History.
  The Watch page lists what's being watched, when it last checked, and what it found, with
  pause/check-now/remove controls.
- A refreshed color direction for the desktop app and the browser extension popup: one accent
  color (previously plain grayscale) plus slightly softer corners, chosen after specifically
  avoiding the cyan/violet combination that reads as generic AI-tool branding.
- Extension popup: subtle motion (panels fade in instead of snapping open, a pulsing "Connected"
  indicator, button press feedback) instead of a static popup.

### Changed
- Extension: "Use detected video link instead" is now a dropdown that defaults to the page's own
  link, instead of an auto-checked checkbox. It showed up even on sites like Twitter/YouTube that
  don't need it (a stray direct-media network request can fire there too), so making it opt-in
  avoids silently downloading the wrong thing on the sites that already just work.

## [1.4.0] - 2026-09-16

### Added
- Browser extension: a fallback for unsupported websites that point their player straight at a
  file Foldreel can't otherwise reach. When the extension detects one, the popup offers a "Use
  detected video link instead" option that sends the real file together with the page it came
  from, which is often all a site needs to allow the download instead of blocking it. This needed
  a real increase in what the extension can see (it now watches network requests to spot this,
  instead of only the page you click on).
- A new Advanced page, split out of Settings: Browser extension, Engine, and Presets moved there,
  so Settings itself only holds what most people touch day to day (Files, Appearance, Tools,
  About, Legal).
- Presets now show a plain explanation of what they actually are, a link to gallery-dl's config
  reference, and two working "start from an example" buttons (Images only, Custom filename)
  instead of a blank JSON box with no hint of what belongs there.

### Fixed
- "Delete files" refused on every single YouTube download, unconditionally. yt-dlp has no
  folder-structure concept of its own, so its files always sit in the main download folder,
  which the old check always read as "shared with other downloads, too risky to touch." It now
  falls back to deleting the exact file a job is known to have written instead of refusing
  outright.
- A history entry could wrongly claim its files "can't be deleted individually because folder
  structure is set to One flat folder" even when it wasn't - a job that found everything already
  downloaded (a bookmarks re-import, a retried job) never narrowed down from the full download
  root in the first place, regardless of the actual folder-structure setting.

## [1.3.4] - 2026-09-16

### Fixed
- Pause and Cancel could silently do nothing on a YouTube download and let it run to completion
  anyway. yt-dlp runs its accelerated downloader (aria2c) in a way that's deliberately immune to
  the graceful stop signal Foldreel tried first, which could kill yt-dlp's own process while
  leaving the actual download running untouched underneath it. The graceful step is removed;
  stopping a job now force-kills the whole process tree directly, which reliably reaches
  everything, aria2c included.
- Windows' installed-apps list showed "Foldreel 1.3.3" as the name, duplicating the version shown
  right below it; it now just says "Foldreel".

## [1.3.3] - 2026-09-16

### Fixed
- Cancelling or pausing a download very late (right as it was about to finish anyway) could
  still report it as canceled/paused even though the file had actually completed and downloaded
  successfully. It now correctly shows as done whenever that happens.
- Settings > Browser extension showed "Connected" as soon as you clicked Enable, before the
  extension itself had ever actually used the pairing code. It now only shows Connected once a
  real connection has happened, and the Download button hides once it has.

## [1.3.2] - 2026-09-16

### Fixed
- In-app updates always failed right after downloading, with "is not signed by the application
  owner." Foldreel has never been code-signed, so a check meant to verify the downloaded
  installer's signature had nothing valid to check against and failed every single time. This
  has likely been broken since the very first release; it went unnoticed because it only
  triggers on an actual in-app download, not a check. Note: this version still needs to be
  installed manually from this release page once, since a version without this fix can never
  successfully auto-download the fix for itself. After installing 1.3.2, in-app updates work
  normally again.
- A download without a known file total (most downloads, since Preview isn't required first)
  sat on a sweeping "something is happening" bar for its whole run and jumped straight to done;
  it now climbs smoothly and continuously while the job is actually running
- The quality selector (1080p/720p/etc) did nothing when MP3 was selected; it's now hidden in
  that case instead of implying a choice with no effect

## [1.3.1] - 2026-09-16

### Added
- Settings > Browser extension now has a Download link, since the extension isn't bundled with
  the installer or published to a store yet
- Browser extension: connecting now happens right in the popup (paste the code, hit Connect)
  instead of a separate Options page

### Fixed
- A YouTube download's progress bar sat still for the whole download and only jumped to 100%
  at the very end; it now tracks the real download progress throughout
- The browser extension's quality/format picker could show up on non-YouTube pages
- Settings > Tools showed a bare date for gallery-dl's available update with no version number
  next to it, unlike the installed version shown right beside it

### Changed
- Trimmed a few redundant lines from Settings (Legal, Tools) and the extension popup

## [1.3.0] - 2026-09-15

### Added
- Accelerated YouTube downloads: install aria2c from Settings > Tools and yt-dlp picks it up
  automatically for faster, multi-connection downloads
- Pause and resume: pause a running download and pick it back up later from where it left off
- Named presets: save a set of options (Settings > Files) and pick one from a new dropdown on
  the Dashboard for any job, without changing your global settings
- One-click import of Twitter/X bookmarks
- Browser extension: the toolbar button now opens a small popup showing the link before it
  sends, with the same quality/format picker as the Dashboard for YouTube links
- The first steps toward macOS and Linux support (not yet available as a download)

### Changed
- Settings > Tools now links each tool (gallery-dl, yt-dlp, FFmpeg, aria2c) to its GitHub project
- README rewritten to be clearer for new users
- Auto-update now logs what it checked to a file, and keeps its cache inside Foldreel's own data
  folder instead of a separate one Windows manages

### Fixed
- Retrying or resuming a job twice in quick succession could start two overlapping runs of the
  same download
- Installing aria2c silently stopped your configured download-speed limit from applying to
  YouTube downloads
- Pausing a job and immediately stopping it right after could be misreported as paused instead
  of canceled
- The preview shown before downloading could disagree with what a selected preset actually
  downloads

## [1.2.0] - 2026-09-15

### Added
- Animation and visual-depth pass: route transitions, expandable panels (cookie/login rows,
  Advanced settings, job logs), and button/switch presses now animate with spring-based motion;
  cards and dialogs get a subtle elevation shadow instead of a flat 1px border
- Browser extension (Chrome/Edge, same machine only): send the current tab or a right-clicked
  link straight to Foldreel from the browser's toolbar button or context menu, paired to the app
  with a one-time code generated from Settings
- Custom gallery-dl config editor (Settings, Files): edit raw JSON overrides for anything
  Foldreel's own UI doesn't expose (per-site filters, postprocessors, custom headers); the
  overrides are layered on top of the generated config, so they survive normal settings changes
  instead of being overwritten

### Changed
- Settings section order: Files now comes right after Engine, ahead of Appearance
- Accessibility pass: keyboard focus now reaches every settings row (an info-tooltip button was
  previously unreachable by Tab), disclosure panels expose `aria-expanded`/`aria-controls`,
  icon-only buttons and bare inputs get proper labels, status changes are announced through ARIA
  live regions, and right-to-left locales (Arabic, Hebrew, Persian, Urdu) no longer mis-mirror
  icon spacing and floated elements

## [1.1.3] - 2026-09-15

### Added
- YouTube downloads: paste a YouTube link and it routes through yt-dlp instead of gallery-dl
  (which has no YouTube extractor), with a quality (1080p down to 360p, or best) and format
  (MP4 / MP3) picker next to the URL box
- GIF conversion: a Twitter/X "GIF" is really a looping MP4; Foldreel now detects that (via
  gallery-dl's own metadata, not a guess) and converts it to a real `.gif` with FFmpeg
  automatically, no setting required
- Full language support: 45 languages with a searchable picker (Settings, Appearance), automatic
  system-locale detection on first launch (falls back to English), lazy-loaded locale bundles so
  unused languages never hit the bundle, and right-to-left layout for Arabic, Hebrew, Persian, and
  Urdu

### Fixed
- Cancel could leave a yt-dlp process orphaned and still running: the watchdog killed the
  tracked process before running the tree-kill, so by the time it ran there was nothing left
  for it to find the child process through

## [1.1.2] - 2026-09-14

### Fixed
- The crash watchdog added in 1.1.1 could restart a backend that hadn't actually crashed (the
  packaged backend can briefly double-launch on a fresh build), eventually giving up and showing
  "couldn't be restarted" even though a working backend was still running; it now checks whether
  something is already answering on the port before acting
- A backend left over from a prior session (e.g. Foldreel closed via Task Manager instead of a
  normal quit) could keep holding its port with a stale security token no new session could ever
  match, leaving the sidebar stuck on "Offline" with no way to recover; every launch now clears
  anything already on the port first, and the backend now exits itself the instant Foldreel's own
  process is gone, by any means

### Changed
- Settings section order is Engine, Files, Appearance, Tools, About, Legal

## [1.1.1] - 2026-09-14

### Fixed
- Electron now watches the backend process and restarts it automatically (with a circuit breaker
  against crash-loops) if it dies mid-session, instead of leaving the sidebar stuck on "Offline"
  until you relaunch Foldreel
- A second, page-wide scrollbar could appear alongside the normal one (and scrolling it moved the
  whole app off-screen); caused by the row tooltips' hidden accessibility text escaping its
  scroll container

## [1.1.0] - 2026-09-13

### Added
- In-app auto-update: Settings, About checks GitHub for a newer Foldreel release (silent check on
  startup, manual "Check for updates" otherwise) and can download and install it without leaving
  the app, the same way the gallery-dl/FFmpeg/yt-dlp tools update
- Preview: pick exactly which files to download from the resolved list, not just all-or-nothing
- Settings: "Default limit" (moves the per-download range/limit out of the Dashboard into a
  persistent default), "Clear cache" (wipes generated thumbnails and gallery-dl's cache),
  "Update all" (installs/updates every outdated tool in one click), a Notifications on/off toggle
- Dashboard: rejects non-URL input before queueing instead of silently failing
- Queue & Active keeps a just-finished job visible for a few seconds (longer while its log is open)
  so a fast single-file download doesn't disappear before you can check it

### Changed
- Mode selector moved onto the Download/Preview row; output-folder settings and cookie config rows
  lost their permanently-visible explainer text in favor of a hover tooltip, and Settings' Engine
  section groups the rarely-used network options behind an "Advanced" disclosure
- "Skip already-downloaded" and the old separate "Ignore archive" default merged into one setting;
  they controlled the same underlying behavior
- Sidebar tagline is "Media Downloader" (Foldreel also handles video, not just images)
- Onboarding tour order now matches the sidebar's page order
- Preview dialog redesigned: per-file-type icons, a cleaner site header, whole-row click to
  select, and a retry button on failure

### Fixed
- Desktop notifications no longer fire a bogus extra "Queue finished" summary alongside almost
  every single completed download
- Windows notifications are labeled "Foldreel" instead of the fallback "electron.app.Foldreel"
- History thumbnails could come back empty for downloads that land directly in the download root
  (e.g. "One flat folder" structure) instead of a per-job subfolder
- "Delete files" in History could silently drop a history entry without deleting anything when its
  files shared the main download folder with other jobs; it's now disabled with an explanation in
  that case instead

## [Unreleased]

### Added
- Paste-and-go download queue with live progress over WebSocket
- Preview (gallery-dl `--simulate` dry run) before committing
- Download modes: Auto, Whole page (`generic:`), Scan page for galleries (`r:`)
- Range field (grab the newest N, or a slice like `8-20`)
- "Ignore archive" per-run toggle (re-download files removed from disk)
- Proxy setting (Engine)
- History: compact rows, thumbnail grid on expand, search + status filter
- Sites page: per-site cookies / username+password / OAuth, with a `--simulate` verify
- Cookie drop-in folder: put any number of `cookies.txt` exports in one place,
  Foldreel merges them and routes each to the right site by domain
- Tools installer for gallery-dl, FFmpeg, yt-dlp with install / update / up-to-date states
- Folder-structure control (site/uploader, site only, flat, custom)
- Auto-detect installed browsers; warn when a Chromium browser is running (locked cookies)
- Rate-limit detection with an advisory cooldown
- Desktop notifications on job finish / failure / queue drained
- Drag-and-drop URLs or a `.txt` file onto the URL box
- Autosave settings (no Save button)
- Bilingual UI (English, Bahasa Indonesia); light / dark / system theme
- Tray, single-instance lock, start-with-Windows

### Notes
- gallery-dl's Instagram / TikTok profile scraping is inherently fragile and rate-limited;
  single post/video URLs are more reliable
- OAuth token write after a real browser sign-in is coded but not yet verified end to end

## [1.0.0] - unreleased

Initial build.
