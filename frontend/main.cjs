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

app.whenReady().then(() => {
  ipcMain.handle('get-settings', () => {
    try {
      const data = fs.readFileSync(getSettingsPath(), 'utf8')
      return JSON.parse(data)
    } catch (e) {
      return {
        port: "8080",
        topChartType: "combined",
        bottomChartType: "straight_pie",
        theme: "dark",
        customColors: {}
      }
    }
  })

  ipcMain.handle('save-settings', (event, settings) => {
    try {
      const configDir = getConfigDir()
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }
      fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2))
      return true
    } catch (e) {
      console.error("Failed to save settings:", e)
      return false
    }
  })

  ipcMain.on('quit-app', () => {
    app.quit()
  })

  ipcMain.handle('show-save-dialog', async (event, { defaultPath, data }) => {
    const win = BrowserWindow.getFocusedWindow()
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: defaultPath
    })
    if (!canceled && filePath) {
      fs.writeFileSync(filePath, data)
      return true
    }
    return false
  })

  ipcMain.handle('show-open-dialog', async (event, { filters }) => {
    const win = BrowserWindow.getFocusedWindow()
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: filters
    })
    if (!canceled && filePaths.length > 0) {
      const content = fs.readFileSync(filePaths[0], 'utf8')
      return content
    }
    return null
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
