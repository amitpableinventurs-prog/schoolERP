// Smart Campus ERP - Windows desktop app.
// Starts a private MongoDB and the same Express server as the website (SC_MODE=desktop)
// on 127.0.0.1, so the app keeps working without internet. The server syncs with the
// central server every minute using this computer's licence.
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { execSync, spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const appConfig = JSON.parse(fs.readFileSync(path.join(here, 'app-config.json'), 'utf8'))
const dataDir = app.getPath('userData')
const licenseFile = path.join(dataDir, 'license.json')
const KEY_RX = /SC-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/i

let mongod = null
let serverPort = null
let mainWindow = null
let startWindow = null

if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => {
  const win = mainWindow || startWindow
  if (win) { if (win.isMinimized()) win.restore(); win.focus() }
})

/* ── Licence ── */

function machineId() {
  let raw = ''
  try {
    raw = execSync('reg query HKLM\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid', { encoding: 'utf8', windowsHide: true }).match(/MachineGuid\s+REG_SZ\s+(\S+)/)?.[1] || ''
  } catch { /* not Windows or no access */ }
  if (!raw) raw = `${os.hostname()}|${Object.values(os.networkInterfaces()).flat().map((n) => n?.mac).filter((m) => m && m !== '00:00:00:00:00:00').sort().join(',')}`
  return crypto.createHash('sha256').update(`smart-campus:${raw}`).digest('hex').slice(0, 40)
}

const readLicense = () => { try { return JSON.parse(fs.readFileSync(licenseFile, 'utf8')) } catch { return null } }

// The download link names the installer SmartCampus-Setup-<KEY>.exe; the installer
// writes its own file name next to the app (build/installer.nsh).
const installerNameFile = path.join(path.dirname(process.execPath), 'installer-name.txt')
function keyFromInstaller() {
  try {
    return fs.readFileSync(installerNameFile, 'utf8').match(KEY_RX)?.[0].toUpperCase() || null
  } catch {
    return process.env.SC_ACTIVATION_KEY || null
  }
}

async function activate(key, centralUrl) {
  const url = String(centralUrl || appConfig.centralUrl).trim().replace(/\/$/, '')
  const id = machineId()
  let res
  try {
    res = await fetch(`${url}/api/platform/license/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: String(key).trim().toUpperCase(), machineId: id, deviceName: os.hostname(), appVersion: app.getVersion() }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new Error(`Cannot reach ${url}. Check the internet connection - activation needs it once.`)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Activation failed (${res.status}).`)
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(licenseFile, JSON.stringify({ token: data.license, machineId: id, centralUrl: url, key: String(key).toUpperCase(), institute: data.tenant.name, activatedAt: new Date() }, null, 2))
  return data
}

/* ── Windows ── */

function openStart(mode, info = {}) {
  if (!startWindow) {
    startWindow = new BrowserWindow({
      width: 520, height: 600, resizable: false, autoHideMenuBar: true, show: false, title: 'Smart Campus ERP',
      webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, sandbox: true },
    })
    startWindow.once('ready-to-show', () => startWindow.show())
    startWindow.on('closed', () => { startWindow = null; if (!mainWindow) app.quit() })
  }
  startWindow.loadFile(path.join(here, 'pages', 'start.html'), { query: { mode, info: JSON.stringify(info) } })
}

const sendStatus = (status) => startWindow?.webContents.send('status', status)

function openMain() {
  mainWindow = new BrowserWindow({
    width: 1366, height: 860, minWidth: 1000, minHeight: 640, show: false, autoHideMenuBar: true, title: 'Smart Campus ERP',
    // The preload only adds "Use a different key" for the lock screen.
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, sandbox: true },
  })
  // maximize() on a hidden window shows it early, after which 'ready-to-show' may never
  // come - so reveal on whichever happens first, and replace the start window then.
  let shown = false
  const reveal = () => {
    if (shown || !mainWindow) return
    shown = true
    mainWindow.maximize()
    mainWindow.show()
    mainWindow.focus()
    startWindow?.destroy()
  }
  mainWindow.once('ready-to-show', reveal)
  mainWindow.webContents.once('did-finish-load', reveal)
  setTimeout(reveal, 15_000)
  const home = `http://127.0.0.1:${serverPort}/`
  // A crashed or failed page loads again instead of leaving a blank window.
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    if (details.reason !== 'clean-exit') setTimeout(() => mainWindow?.reload(), 1000)
  })
  mainWindow.webContents.on('did-fail-load', (event, code, description, url, isMainFrame) => {
    if (isMainFrame && code !== -3) setTimeout(() => mainWindow?.loadURL(home), 2000)
  })
  // Links meant for a browser (WhatsApp, verify pages, downloads) open outside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://127.0.0.1:${serverPort}/`)) return { action: 'allow' }
    shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.loadURL(home)
}

// Forgets the licence and restarts at the activation screen. The local data stays.
async function changeKey() {
  const { response } = await dialog.showMessageBox(startWindow || mainWindow, { type: 'warning', buttons: ['Cancel', 'Change key'], defaultId: 0, message: 'Enter a different activation key?', detail: 'Unsynced changes stay on this computer and are sent with the new key if it is for the same institute.' })
  if (response !== 1) return
  fs.rmSync(licenseFile, { force: true })
  app.relaunch()
  app.exit(0)
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'App', submenu: [
      { label: 'Reload', accelerator: 'F5', click: () => mainWindow?.reload() },
      { label: 'Open data folder', click: () => shell.openPath(dataDir) },
      { type: 'separator' },
      { label: 'Change activation key…', click: changeKey },
      { type: 'separator' },
      { role: 'quit' },
    ] },
    { label: 'View', submenu: [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { role: 'togglefullscreen' }, { role: 'toggleDevTools' }] },
  ]))
}

/* ── Local database + server ── */

function freePort(preferred) {
  const tryPort = (port) => new Promise((resolve) => {
    const srv = net.createServer().once('error', () => resolve(null)).once('listening', () => srv.close(() => resolve(srv.address()?.port || port)))
    srv.listen(port, '127.0.0.1')
  })
  return tryPort(preferred).then((p) => p || tryPort(0))
}

const canConnect = (port) => new Promise((resolve) => {
  const socket = net.connect(port, '127.0.0.1').once('connect', () => { socket.destroy(); resolve(true) }).once('error', () => resolve(false))
})

async function startMongo() {
  const exe = app.isPackaged
    ? path.join(process.resourcesPath, 'mongodb', 'mongod.exe')
    : process.env.SC_MONGOD || path.join(here, '..', 'vendor', 'mongodb', 'mongod.exe')
  if (!fs.existsSync(exe)) throw new Error(`The local database engine is missing (${exe}). Please reinstall the app.`)
  const dbPath = path.join(dataDir, 'db')
  fs.mkdirSync(dbPath, { recursive: true })
  const port = await freePort(47117)
  mongod = spawn(exe, ['--dbpath', dbPath, '--port', String(port), '--bind_ip', '127.0.0.1', '--logpath', path.join(dataDir, 'mongod.log'), '--logappend'], { windowsHide: true, stdio: 'ignore' })
  let exited = null
  mongod.once('exit', (code) => { exited = code; mongod = null })
  for (let i = 0; i < 120; i++) {
    if (await canConnect(port)) return port
    if (exited !== null) break
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`The local database did not start (see ${path.join(dataDir, 'mongod.log')}).`)
}

function jwtSecret() {
  const file = path.join(dataDir, 'secret.key')
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(48).toString('hex'))
  return fs.readFileSync(file, 'utf8').trim()
}

async function startServer(mongoPort, license) {
  serverPort = await freePort(47188)
  Object.assign(process.env, {
    SC_MODE: 'desktop',
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: String(serverPort),
    MONGODB_URI: `mongodb://127.0.0.1:${mongoPort}/smart_campus_local`,
    CENTRAL_URL: license.centralUrl || appConfig.centralUrl,
    SC_DATA_DIR: dataDir,
    LICENSE_PUBLIC_KEY_FILE: path.join(here, 'license-public.pem'),
    JWT_SECRET: jwtSecret(),
    SC_APP_VERSION: app.getVersion(),
    SEED_DEMO: 'false',
  })
  await import(pathToFileURL(path.join(here, 'server', 'index.js')).href)
  for (let i = 0; i < 80 && !(await canConnect(serverPort)); i++) await new Promise((r) => setTimeout(r, 250))
}

// Shows progress until the first download from the central server has finished.
async function waitUntilReady() {
  for (;;) {
    try {
      const status = await (await fetch(`http://127.0.0.1:${serverPort}/api/desktop/status`)).json()
      if (status.initialized) return
      sendStatus(status.locked
        ? { error: status.locked }
        : status.lastError ? { error: `First-time setup needs the internet. ${status.lastError} Retrying…` } : { text: 'Downloading your institute’s data…' })
    } catch { /* server still starting */ }
    await new Promise((r) => setTimeout(r, 1500))
  }
}

async function launch() {
  openStart('loading')
  try {
    sendStatus({ text: 'Starting the local database…' })
    const mongoPort = await startMongo()
    sendStatus({ text: 'Starting Smart Campus…' })
    await startServer(mongoPort, readLicense())
    await waitUntilReady()
    openMain()
  } catch (error) {
    dialog.showErrorBox('Smart Campus ERP could not start', error.message)
    app.quit()
  }
}

ipcMain.handle('change-key', () => changeKey())

ipcMain.handle('activate', async (event, { key, centralUrl }) => {
  try {
    const data = await activate(key, centralUrl)
    setTimeout(launch, 600)
    return { ok: true, institute: data.tenant.name, label: data.installation.label }
  } catch (error) {
    return { ok: false, error: error.message }
  }
})

app.whenReady().then(async () => {
  buildMenu()
  // A setup file named with a different key (SmartCampus-Setup-<KEY>.exe) switches to that key.
  const key = keyFromInstaller()
  const saved = readLicense()
  if (saved?.token && (!key || key === saved.key)) return launch()
  // First start (or new key): activate with the key from the installer's name, or ask for it.
  if (key) {
    openStart('loading', { text: 'Activating this computer…' })
    try {
      await activate(key)
      // Used once: a key changed later from the menu must not be switched back.
      fs.rmSync(installerNameFile, { force: true })
      return launch()
    } catch (error) {
      return openStart('activate', { key, centralUrl: appConfig.centralUrl, error: error.message })
    }
  }
  openStart('activate', { centralUrl: appConfig.centralUrl })
})

// Stop MongoDB cleanly so its files stay consistent.
let quitting = false
app.on('before-quit', async (event) => {
  if (quitting || !mongod) return
  event.preventDefault()
  quitting = true
  try {
    const { default: mongoose } = await import('mongoose')
    await mongoose.connection.db?.admin().command({ shutdown: 1 }).catch(() => {})
  } catch { /* server not loaded */ }
  const child = mongod
  await new Promise((resolve) => {
    if (!child) return resolve()
    const timer = setTimeout(() => { child.kill(); resolve() }, 8000)
    child.once('exit', () => { clearTimeout(timer); resolve() })
  })
  app.quit()
})

app.on('window-all-closed', () => app.quit())
