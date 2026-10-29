// TeacherSync for the desktop: the same app as the web build (dist/), in its own window.
// Electron runs it sandboxed with no Node.js access; files come from inside the app (app://teachersync),
// web links open in the browser, and permission requests (camera, location, …) are refused.
// Data is saved where Electron keeps it: ~/Library/Application Support/TeacherSync on a Mac,
// %APPDATA%\TeacherSync on Windows.
const { app, BrowserWindow, Menu, nativeTheme, protocol, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { SCHEME, ORIGIN, fileFor, contentType, csp, isAppUrl, isExternal } = require('./lib.cjs');

const ROOT = path.join(__dirname, '..', 'dist');
// Chromium writes saved data (localStorage) to disk a few seconds after each change, and a normal quit writes the
// rest. A crash or forced restart in between would lose those last seconds, so pending data is written out every
// second, and whenever the window loses focus or is hidden.
const FLUSH_MS = 1000;
const flush = () => { try { session.defaultSession.flushStorageData(); } catch (_) {} };
protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 360, minHeight: 560,
    title: 'TeacherSync',
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b1017' : '#edf0f4',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true },
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });
  for (const event of ['blur', 'hide', 'minimize']) win.on(event, flush);
  // No pop-up windows; web links go to the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternal(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    if (isExternal(url)) shell.openExternal(url);
  });
  win.loadURL(`${ORIGIN}/index.html#/today`);
}

function serveFiles() {
  protocol.handle(SCHEME, async request => {
    const file = fileFor(request.url, ROOT);
    let body;
    try { body = file && await fs.promises.readFile(file); } catch (_) { body = null; }
    if (!body) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    const headers = { 'content-type': contentType(file), 'x-content-type-options': 'nosniff' };
    if (file.endsWith('.html')) headers['content-security-policy'] = csp(body.toString('utf8'));
    return new Response(body, { headers });
  });
}

// Edit (copy, paste, undo), zoom and the window list. On a Mac the app menu holds Quit; on Windows a File menu does.
function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    process.platform === 'darwin' ? { role: 'appMenu' } : { role: 'fileMenu' },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
  ]));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return createWindow();
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(() => {
    serveFiles();
    buildMenu();
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    // Backups and calendar files: ask where to save, starting in Downloads.
    session.defaultSession.on('will-download', (_event, item) => {
      item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('downloads'), item.getFilename()) });
    });
    createWindow();
    setInterval(flush, FLUSH_MS);
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
  app.on('before-quit', flush);
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
