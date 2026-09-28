const {
  app, BrowserWindow, Tray, Menu,
  ipcMain, dialog, shell, nativeImage, Notification,
} = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs   = require('fs');
const http = require('http');

// Per-run secret shared with the backend so pages in the user's other browsers
// can't reach the loopback API (which exposes saved passwords / tokens).
const API_TOKEN = crypto.randomBytes(24).toString('hex');
process.env.FOLDREEL_TOKEN = API_TOKEN; // inherited by the renderer + backend

// Without this, Windows toasts show as "electron.app.Foldreel" (Electron's
// synthesized fallback ID) instead of the app name.
app.setAppUserModelId('Foldreel');

// ── Single instance lock ─────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.on('ready', () => Menu.setApplicationMenu(null));

// ── Dev / prod detection ────────────────────────────────────────────────────
const BUILD_INDEX = path.join(__dirname, '..', 'frontend', 'build', 'index.html');
const DEV = !fs.existsSync(BUILD_INDEX);

const BACKEND_PORT = 8767;
const BACKEND_URL  = `http://127.0.0.1:${BACKEND_PORT}`;

// ── Bundled resources (bin/ tools, extension/ source) ───────────────────────
// Both ship as plain directories under package.json's win.extraResources, so
// a fresh install can run its first job with nothing downloaded and "load
// unpacked" works straight from the install with no separate zip needed.
function resolveBundledDir(name) {
  const candidates = DEV
    ? [path.join(__dirname, '..', name)]
    : [
        path.join(process.resourcesPath, name),
        path.join(process.resourcesPath, 'app.asar.unpacked', name),
      ];
  return candidates.find(p => fs.existsSync(p)) || '';
}

console.log(`[foldreel] mode=${DEV ? 'DEV' : 'PROD'}`);

// ── App auto-update (GitHub releases) ───────────────────────────────────────
// Checking is automatic on startup; downloading and installing stay a
// deliberate user action, same as the gallery-dl/ffmpeg/yt-dlp tools in
// Settings, rather than silently restarting the app on them.
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

// electron-updater hardcodes its download cache to %LOCALAPPDATA%, a
// different folder than Foldreel's own data (%APPDATA%\Foldreel). Foldreel keeps
// everything in one folder so uninstall / "delete my data" is a single,
// obvious step, so redirect the cache there too. baseCachePath has no
// setter (it's a getter on the adapter's prototype), so it's overridden
// per-instance instead of reassigned.
Object.defineProperty(autoUpdater.app, 'baseCachePath', {
  value: app.getPath('userData'),
  configurable: true,
});

// Foldreel isn't code-signed (no Authenticode certificate), so after
// downloading an update electron-updater's default NSIS verify step checks
// the new installer's signature against app-update.yml's publisherName and
// always fails with "is not signed by the application owner" - there's
// never a valid signature to check in the first place. This only bit once
// someone actually used the in-app Download button instead of grabbing the
// installer from GitHub by hand, which is why it went unnoticed through
// several releases. There's no signature to spoof if there's none at all,
// and the download itself already comes over HTTPS from the GitHub release
// electron-updater resolved, so the check is simply skipped.
autoUpdater.verifyUpdateCodeSignature = () => Promise.resolve(null);

// electron-updater has no logger wired up by default, so a failed check has
// never had anywhere to leave a trace beyond the one-line error message
// already shown in Settings - no way to see the actual HTTP request/response
// electron-updater made. This writes its own debug log (which is fairly
// verbose - request URLs, resolved versions, HTTP status) to a plain file
// instead of pulling in a dependency just for this.
const UPDATER_LOG_PATH = path.join(app.getPath('userData'), 'updater.log');
function logUpdater(level, args) {
  try {
    const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    fs.appendFileSync(UPDATER_LOG_PATH, `[${new Date().toISOString()}] [${level}] ${msg}\n`);
  } catch { /* best-effort */ }
}
autoUpdater.logger = {
  info:  (...a) => logUpdater('info', a),
  warn:  (...a) => logUpdater('warn', a),
  error: (...a) => logUpdater('error', a),
  debug: (...a) => logUpdater('debug', a),
};

function sendUpdateStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app-update-status', payload);
}

autoUpdater.on('checking-for-update', () => sendUpdateStatus({ status: 'checking' }));
autoUpdater.on('update-available', (info) => sendUpdateStatus({ status: 'available', version: info.version }));
autoUpdater.on('update-not-available', () => sendUpdateStatus({ status: 'current' }));
autoUpdater.on('error', (err) => sendUpdateStatus({ status: 'error', error: err?.message || String(err) }));
autoUpdater.on('download-progress', (p) => sendUpdateStatus({ status: 'downloading', pct: Math.round(p.percent) }));
autoUpdater.on('update-downloaded', (info) => sendUpdateStatus({ status: 'downloaded', version: info.version }));

let mainWindow  = null;
let tray        = null;
let backendProc = null;
let isQuitting  = false;
let queuePaused = false;
let savedConcurrency = 2;

const TRAY_ICON_PATH   = path.join(__dirname, 'assets', 'icon.ico');
const WINDOW_ICON_PATH = path.join(__dirname, 'assets', 'icon.png');

// ── Backend crash watchdog ──────────────────────────────────────────────────
// The renderer's own WebSocket reconnect loop only helps once the backend is
// actually listening again; nothing brought the process itself back if it
// died mid-session, so the UI was stuck showing Offline until a full app
// relaunch. Restart it automatically, with a circuit breaker so a backend
// that's crash-looping (e.g. a corrupted config) doesn't spin forever.
const MAX_RESTARTS_PER_WINDOW = 3;
const RESTART_WINDOW_MS = 60_000;
const RESTART_RETRY_DELAY_MS = 2000;
const STABLE_AFTER_MS = 30_000; // running this long clears the crash count
let restartAttempts = 0;
let restartWindowStart = 0;
let stableTimer = null;

// The packaged backend is a PyInstaller onefile exe; on a fresh/not-yet-cached
// build it can occasionally double-launch, and the losing attempt exits with a
// port-bind conflict that looks exactly like a crash even though a healthy
// server is already up under a PID we're no longer tracking. A quick health
// check tells the two apart before we burn the restart budget on nothing.
function checkBackendAlive(timeoutMs = 1500) {
  return new Promise(resolve => {
    const req = http.get(`${BACKEND_URL}/api/`, res => {
      resolve(res.statusCode === 200);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
  });
}

async function handleBackendExit(code, signal) {
  backendProc = null;
  clearTimeout(stableTimer);
  if (isQuitting) return; // expected: quitting the app, or a deliberate restart

  console.warn(`[foldreel] Backend exited unexpectedly (code=${code}, signal=${signal})`);

  if (await checkBackendAlive()) {
    console.warn('[foldreel] Backend exited, but something is already answering on the port; not restarting.');
    return;
  }

  const now = Date.now();
  if (now - restartWindowStart > RESTART_WINDOW_MS) {
    restartWindowStart = now;
    restartAttempts = 0;
  }
  restartAttempts += 1;

  if (restartAttempts > MAX_RESTARTS_PER_WINDOW) {
    console.error('[foldreel] Backend keeps crashing; giving up on auto-restart.');
    if (Notification.isSupported()) {
      new Notification({
        title: 'Foldreel',
        body: "The background service stopped and couldn't be restarted automatically. Please restart Foldreel.",
      }).show();
    }
    return;
  }

  console.warn(`[foldreel] Restarting backend in ${RESTART_RETRY_DELAY_MS}ms (attempt ${restartAttempts}/${MAX_RESTARTS_PER_WINDOW})`);
  setTimeout(() => {
    if (isQuitting) return;
    startBackend().catch(err => console.error('[foldreel] Backend auto-restart failed:', err.message));
  }, RESTART_RETRY_DELAY_MS);
}

// FOLDREEL_TOKEN is randomized fresh on every launch (it's the per-run secret
// that keeps other browser tabs off the loopback API), so a backend left over
// from a prior session - e.g. the app was killed via Task Manager instead of
// quit normally, orphaning the PyInstaller child that holds the port - can
// never be a match for this session's renderer. Our own spawn would just fail
// to bind and, correctly seeing the old one answering fine, never retry;
// meanwhile the UI stays stuck unable to authenticate against it forever.
// Clear anything already on our port before spawning so every launch starts
// from a clean, correctly-tokened backend.
// Only ever kill a PID whose own image name is actually one of ours - a
// stale backend from a prior Foldreel run, or (in dev) the bare python/py
// interpreter running server.py directly. Without this check, any other
// app that happened to be listening on the same port (a real incident:
// this used to double as Grabbr's port too, and launching one silently
// killed the other's already-running backend) would get force-killed
// along with it.
// Base names only (no .exe) - isOurProcess() below handles the Windows
// suffix and Linux's 15-char /proc/<pid>/comm truncation.
const OUR_IMAGE_NAMES = ['foldreel-backend', 'python', 'python3', 'py'];

function isOurProcess(name) {
  const base = name.replace(/\.exe$/, '');
  return OUR_IMAGE_NAMES.some(n => n === base || n.startsWith(base));
}

// One shared "is this PID ours, and if so kill it" step per platform - the
// two callers below differ only in how they list candidate PIDs and how
// they look up + kill one.
function killIfOurs(pid, getImageName, kill) {
  const name = (getImageName(pid) || '').trim().toLowerCase();
  if (!isOurProcess(name)) {
    console.warn(`[foldreel] Port ${BACKEND_PORT} is held by "${name || 'unknown'}" (PID ${pid}) - not ours, leaving it alone.`);
    return;
  }
  console.warn(`[foldreel] Clearing stale process on port ${BACKEND_PORT} (PID ${pid})`);
  kill(pid);
}

function killStaleBackend() {
  try {
    if (process.platform === 'win32') {
      const out = spawnSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true }).stdout || '';
      const portPattern = new RegExp(`:${BACKEND_PORT}\\s`);
      const pids = new Set();
      for (const line of out.split('\n')) {
        if (!portPattern.test(line) || !line.includes('LISTENING')) continue;
        const m = line.trim().match(/(\d+)\s*$/);
        if (m) pids.add(m[1]);
      }
      const getImageName = pid => {
        const info = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true }).stdout || '';
        return (info.split(',')[0] || '').replace(/"/g, '');
      };
      const kill = pid => spawnSync('taskkill', ['/F', '/T', '/PID', pid], { windowsHide: true });
      for (const pid of pids) killIfOurs(pid, getImageName, kill);
    } else {
      // lsof ships with macOS and most Linux desktops; if it's missing this
      // is just a no-op like the Windows branch's own catch-all - startBackend's
      // own timeout still catches a genuinely stuck bind either way.
      //
      // Kills just this PID, not its process group: unlike stopBackend()
      // below, this PID isn't known to be something Foldreel itself spawned
      // (this runs before that association can even exist) - whatever else
      // is bound to the port could be a shell job leader or anything else
      // whose group killpg would reach far past a single stale process.
      const out = spawnSync('lsof', ['-t', '-i', `:${BACKEND_PORT}`, '-sTCP:LISTEN']).stdout?.toString() || '';
      const getImageName = pid => {
        const raw = spawnSync('ps', ['-p', pid, '-o', 'comm=']).stdout?.toString() || '';
        return raw.trim().split('/').pop() || '';
      };
      const kill = pid => { try { process.kill(Number(pid), 'SIGKILL'); } catch { /* already gone */ } };
      for (const line of out.split('\n')) {
        const pid = line.trim();
        if (pid) killIfOurs(pid, getImageName, kill);
      }
    }
  } catch { /* best-effort; startBackend's own timeout still catches a stuck bind */ }
}

// ── Backend process ─────────────────────────────────────────────────────────
function startBackend() {
  killStaleBackend();
  return new Promise((resolve, reject) => {
    const bundledBin = resolveBundledDir('bin');
    const env = {
      ...process.env,
      FOLDREEL_PORT: String(BACKEND_PORT),
      // Default download folder for a first run, before the user picks one.
      FOLDREEL_DEFAULT_OUTPUT: path.join(app.getPath('downloads'), 'Foldreel'),
      // Task Manager doesn't group this windowless process under the "Foldreel"
      // app entry (that grouping is by AppUserModelID/window ownership, not
      // process tree), so "End Task" on Foldreel never reaches it and it's left
      // running as an orphan holding the port. Have the backend watch this PID
      // itself and exit the moment it's gone, however that happens.
      FOLDREEL_PARENT_PID: String(process.pid),
    };
    if (bundledBin) env.FOLDREEL_BUNDLED_BIN = bundledBin;
    console.log('[foldreel] bundled tools dir:', bundledBin || '(none - falling back to PATH)');

    if (DEV) {
      const script = path.join(__dirname, '..', 'backend', 'server.py');
      const py = process.platform === 'win32' ? 'py' : 'python3';
      backendProc = spawn(py, [script], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    } else {
      const ext = process.platform === 'win32' ? '.exe' : '';
      const exe = path.join(process.resourcesPath, 'backend', `foldreel-backend${ext}`);
      // detached on POSIX makes this the leader of its own process group, so
      // stopBackend() below can reap the PyInstaller onefile bootloader's
      // real child (and anything it spawned) by killing the group - a plain
      // kill() only ever hits the bootloader itself, the same orphaned-child
      // problem the Windows taskkill /T branch there exists to avoid.
      backendProc = spawn(exe, [], {
        env, stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      });
    }

    backendProc.stdout?.on('data', d => console.log('[py]', d.toString().trim()));
    backendProc.stderr?.on('data', d => console.warn('[py]', d.toString().trim()));
    backendProc.on('error', reject);
    backendProc.on('exit', handleBackendExit);

    const deadline = Date.now() + 25_000;
    const poll = setInterval(() => {
      if (Date.now() > deadline) {
        clearInterval(poll);
        return reject(new Error('Backend startup timeout'));
      }
      http.get(`${BACKEND_URL}/api/`, res => {
        if (res.statusCode === 200) {
          clearInterval(poll);
          console.log('[foldreel] Backend ready');
          // Only clear the crash count once it's proven stable, so a backend
          // that crashes right after each restart still trips the breaker.
          clearTimeout(stableTimer);
          stableTimer = setTimeout(() => { restartAttempts = 0; }, STABLE_AFTER_MS);
          resolve();
        }
      }).on('error', () => {});
    }, 500);
  });
}

function stopBackend() {
  if (!backendProc) return;
  const pid = backendProc.pid;
  backendProc.removeListener('exit', handleBackendExit);
  // The frozen backend is a PyInstaller one-file exe: killing the bootloader
  // leaves the real Python child (and any gallery-dl it spawned) holding the
  // port, which breaks the next launch. Reap the whole tree.
  if (process.platform === 'win32' && pid) {
    try { spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { windowsHide: true }); }
    catch { /* fall through to kill() */ }
  } else if (pid) {
    // Negative pid targets the whole process group spawn() made this the
    // leader of (see the `detached` comment above).
    try { process.kill(-pid, 'SIGKILL'); }
    catch { /* fall through to kill() */ }
  }
  try { backendProc.kill(); } catch { /* already gone */ }
  backendProc = null;
}

function patchConcurrency(value) {
  const body = JSON.stringify({ max_concurrent: value });
  const req = http.request(
    { hostname: '127.0.0.1', port: BACKEND_PORT, path: '/api/settings', method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Foldreel-Token': API_TOKEN,
      } },
    () => {},
  );
  req.on('error', () => {});
  req.write(body);
  req.end();
}

// ── Window ──────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1160, height: 760,
    minWidth: 960, minHeight: 640,
    title: 'Foldreel',
    icon: WINDOW_ICON_PATH,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // process.env set in main does NOT reach the renderer's process, so hand
      // the API token to the preload through argv instead.
      additionalArguments: [`--foldreel-token=${API_TOKEN}`],
    },
  });

  mainWindow.loadURL(DEV ? 'http://localhost:3000' : `file://${BUILD_INDEX}`);
  if (DEV) mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.on('close', e => {
    if (!isQuitting) { e.preventDefault(); mainWindow.hide(); }
  });
}

// ── Tray ────────────────────────────────────────────────────────────────────
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Open Foldreel', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    {
      label: queuePaused ? 'Resume Queue' : 'Pause Queue',
      click: () => {
        queuePaused = !queuePaused;
        patchConcurrency(queuePaused ? 0 : savedConcurrency);
        tray.setContextMenu(buildTrayMenu());
        tray.setToolTip(queuePaused ? 'Foldreel (queue paused)' : 'Foldreel');
      },
    },
    { type: 'separator' },
    { label: 'Exit', click: () => { isQuitting = true; app.quit(); } },
  ]);
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(TRAY_ICON_PATH));
  tray.setToolTip('Foldreel');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ── IPC ─────────────────────────────────────────────────────────────────────
ipcMain.handle('select-folder', async (_, opts = {}) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: opts.title || 'Select Folder',
    defaultPath: opts.defaultPath || app.getPath('home'),
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('select-file', async (_, opts = {}) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: opts.title || 'Select File',
    filters: opts.filters || [{ name: 'All Files', extensions: ['*'] }],
    defaultPath: opts.defaultPath || app.getPath('home'),
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('select-files', async (_, opts = {}) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    // Bulk rename picks either files or whole subfolders to reorder and
    // rename, so it passes ['openFile', 'openDirectory', 'multiSelections']
    // here - every other caller keeps the plain files-only default.
    properties: opts.properties || ['openFile', 'multiSelections'],
    title: opts.title || 'Select Files',
    filters: opts.filters || [{ name: 'All Files', extensions: ['*'] }],
    defaultPath: opts.defaultPath || app.getPath('home'),
  });
  return res.canceled ? [] : res.filePaths;
});

ipcMain.handle('open-path', async (_, p) => {
  if (p && fs.existsSync(p)) { await shell.openPath(p); return true; }
  return false;
});

ipcMain.handle('get-extension-dir', () => resolveBundledDir('extension'));

ipcMain.handle('show-in-folder', (_, p) => {
  if (p && fs.existsSync(p)) { shell.showItemInFolder(p); return true; }
  return false;
});

ipcMain.handle('open-external', async (_, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) { await shell.openExternal(url); return true; }
  return false;
});

ipcMain.handle('get-paths', async () => ({
  home:      app.getPath('home'),
  downloads: app.getPath('downloads'),
  documents: app.getPath('documents'),
  desktop:   app.getPath('desktop'),
  foldreel:    path.join(app.getPath('downloads'), 'Foldreel'),
}));

ipcMain.handle('show-notification', (_, { title, body }) => {
  if (Notification.isSupported()) {
    const n = new Notification({ title, body, silent: false });
    n.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
    n.show();
  }
});

ipcMain.handle('set-tray-badge', (_, count) => {
  if (!tray) return;
  tray.setToolTip(
    count > 0 ? `Foldreel (${count} download${count !== 1 ? 's' : ''} active)`
              : queuePaused ? 'Foldreel (queue paused)' : 'Foldreel',
  );
});

ipcMain.handle('set-auto-start', (_, enable) => {
  app.setLoginItemSettings({ openAtLogin: enable, openAsHidden: true });
  return app.getLoginItemSettings().openAtLogin;
});
ipcMain.handle('get-auto-start', () => app.getLoginItemSettings().openAtLogin);

ipcMain.handle('check-for-app-update', async () => {
  if (DEV) { sendUpdateStatus({ status: 'current' }); return; }
  try { await autoUpdater.checkForUpdates(); }
  catch (err) { sendUpdateStatus({ status: 'error', error: err?.message || String(err) }); }
});
ipcMain.handle('download-app-update', async () => {
  try { await autoUpdater.downloadUpdate(); }
  catch (err) { sendUpdateStatus({ status: 'error', error: err?.message || String(err) }); }
});
ipcMain.handle('install-app-update', () => {
  isQuitting = true;
  stopBackend();
  autoUpdater.quitAndInstall();
});

// ── Lifecycle ───────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createWindow();
  createTray();
  try {
    await startBackend();
    // Learn current concurrency so tray pause/resume can restore it.
    http.get(`${BACKEND_URL}/api/settings`, { headers: { 'X-Foldreel-Token': API_TOKEN } }, res => {
      let buf = '';
      res.on('data', d => (buf += d));
      res.on('end', () => { try { savedConcurrency = JSON.parse(buf).max_concurrent || 2; } catch {} });
    }).on('error', () => {});
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(DEV ? 'http://localhost:3000' : `file://${BUILD_INDEX}`);
    }
  } catch (err) {
    console.error('[foldreel] Backend failed:', err.message);
  }

  // Silent startup check; downloading and installing stay opt-in from Settings.
  if (!DEV) setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });
});

app.on('window-all-closed', () => { /* stay in tray */ });
app.on('before-quit', () => { isQuitting = true; stopBackend(); });
