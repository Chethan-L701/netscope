const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const getConfigDir = () => path.join(os.homedir(), '.config', 'netscope')
const getSettingsPath = () => path.join(getConfigDir(), 'settings.json')

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'netscope.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs')
    }
  })

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile('dist/index.html');
  }
}

const net = require('net')
const http = require('http')
const { spawn } = require('child_process')

let backendProcess = null;

function isPortFree(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
    server.on('error', () => resolve(false));
  });
}

function isOurBackend(port) {
  return new Promise(resolve => {
    const req = http.get(`http://127.0.0.1:${port}/api/networks`, res => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function startBackend() {
  const binPath = process.env.NETSCOPE_BACKEND_BIN || path.join(__dirname, '..', '..', '..', 'bin', 'netscope-backend');
  try {
    backendProcess = spawn(binPath, [], { detached: true, stdio: 'ignore' });
    backendProcess.unref();
  } catch (e) {
    console.error("Failed to start backend", e);
  }
}

app.whenReady().then(async () => {
  ipcMain.handle('get-settings', () => {
    try {
      const data = fs.readFileSync(getSettingsPath(), 'utf8')
      return JSON.parse(data)
    } catch (e) {
      return { port: "8080", topChartType: "combined", bottomChartType: "straight_pie", theme: "dark", customColors: {}, keepBackground: true }
    }
  })

  ipcMain.handle('save-settings', (event, settings) => {
    try {
      const configDir = getConfigDir()
      if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true })
      fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2))
      return true
    } catch (e) {
      return false
    }
  })

  ipcMain.on('quit-app', () => app.quit())

  ipcMain.on('restart-backend', async () => {
    try {
      const req = http.request(`http://127.0.0.1:${port}/api/shutdown`, { method: 'POST' });
      req.on('error', () => {}); // ignore
      req.end();
      
      // Wait for it to die (500ms sleep in backend)
      await new Promise(r => setTimeout(r, 1000));
      
      const isOurs = await isOurBackend(port);
      if (!isOurs) {
        startBackend();
      }
    } catch (e) {
      console.error("Failed to restart backend", e);
    }
  })

  ipcMain.handle('show-save-dialog', async (event, { defaultPath, data }) => {
    const win = BrowserWindow.getFocusedWindow()
    const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath })
    if (!canceled && filePath) {
      fs.writeFileSync(filePath, data)
      return true
    }
    return false
  })

  ipcMain.handle('show-open-dialog', async (event, { filters }) => {
    const win = BrowserWindow.getFocusedWindow()
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openFile'], filters })
    if (!canceled && filePaths.length > 0) return fs.readFileSync(filePaths[0], 'utf8')
    return null
  })

  // Backend Initialization Logic
  let settings = { port: "8080", keepBackground: true };
  try { settings = JSON.parse(fs.readFileSync(getSettingsPath(), 'utf8')); } catch (e) { }
  let port = parseInt(settings.port) || 8080;

  const saveSettings = (s) => {
    const configDir = getConfigDir();
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(getSettingsPath(), JSON.stringify(s, null, 2));
  };

  const free = await isPortFree(port);
  if (!free) {
    const isOurs = await isOurBackend(port);
    if (!isOurs) {
      await new Promise(resolve => {
        const promptWin = new BrowserWindow({
          width: 450, height: 260, resizable: false, center: true, autoHideMenuBar: true,
          webPreferences: { nodeIntegration: true, contextIsolation: false }
        });

        ipcMain.once('port-conflict-result', (event, result) => {
          promptWin.close();
          if (result.cancel) {
            process.exit(0);
          }
          if (result.random) {
            const srv = net.createServer();
            srv.listen(0, '127.0.0.1', () => {
              port = srv.address().port;
              srv.close(() => {
                settings.port = port.toString();
                saveSettings(settings);
                startBackend();
                resolve();
              });
            });
          } else {
            port = result.port;
            settings.port = port.toString();
            saveSettings(settings);
            startBackend();
            resolve();
          }
        });

        const htmlPath = path.join(__dirname, 'port_conflict.html');
        if (fs.existsSync(htmlPath)) {
          promptWin.loadFile(htmlPath, { query: { port: port.toString() } });
        } else {
          // Dev fallback
          promptWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html><html><body><script>const {ipcRenderer}=require('electron');ipcRenderer.send('port-conflict-result',{cancel:false,random:true});</script></body></html>`)}`);
        }
      });
    }
  } else {
    startBackend();
  }

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  let settings = { keepBackground: true };
  try { settings = JSON.parse(fs.readFileSync(getSettingsPath(), 'utf8')); } catch (e) { }

  if (settings.keepBackground === false && backendProcess) {
    backendProcess.kill();
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
