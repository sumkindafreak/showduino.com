'use strict';
const { app, BrowserWindow, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 920,
    minHeight: 600,
    title: 'Showduino Studio',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });
  const start = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href;
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(start.split('#')[0] + '#') && url !== start) event.preventDefault();
  });
  win.loadURL(start);
}
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  createWindow();
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
