// Builds the Windows installer: desktop/release/SmartCampus-Setup-<version>.exe
//   npm run desktop:build                 (central URL from PLATFORM_URL in .env)
//   npm run desktop:build -- --url=https://app.myerp.in
//   npm run desktop:stage                 (prepare desktop/.stage only, for `npm run desktop:dev`)
// The app embeds the licence public key from keys/ - build with the same keys/ folder
// your live server uses.
import { execSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const stage = path.join(here, '.stage')
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]))
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, NODE_ENV: undefined } })

function readEnv() {
  try {
    return Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]))
  } catch {
    return {}
  }
}

const env = readEnv()
const centralUrl = String(args.url || process.env.PLATFORM_URL || env.PLATFORM_URL || 'http://localhost:5188').replace(/\/$/, '')
const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

// 1. Licence key pair (same files the central server uses).
const keyDir = path.resolve(root, process.env.LICENSE_KEY_DIR || env.LICENSE_KEY_DIR || 'keys')
const pubFile = path.join(keyDir, 'license-public.pem')
if (!fs.existsSync(pubFile)) {
  const privFile = path.join(keyDir, 'license-private.pem')
  if (fs.existsSync(privFile)) {
    fs.writeFileSync(pubFile, crypto.createPublicKey(fs.readFileSync(privFile)).export({ type: 'spki', format: 'pem' }))
  } else {
    fs.mkdirSync(keyDir, { recursive: true })
    const pair = crypto.generateKeyPairSync('ed25519')
    fs.writeFileSync(privFile, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
    fs.writeFileSync(pubFile, pair.publicKey.export({ type: 'spki', format: 'pem' }))
    console.log(`[build] Created a licence key pair in ${keyDir} - copy this folder to your live server.`)
  }
}

// 2. React app.
if (!args['skip-web']) run('npm run build')

// 3. Stage folder = the app's files.
console.log('[build] Preparing desktop/.stage …')
fs.rmSync(stage, { recursive: true, force: true })
fs.mkdirSync(stage, { recursive: true })
const copy = (from, to = from) => fs.cpSync(path.join(root, from), path.join(stage, to), { recursive: true, filter: (src) => !/[\\/](uploads|node_modules)([\\/]|$)/.test(src) })
copy('server')
copy('shared')
copy('dist')
for (const f of ['main.js', 'preload.cjs', 'pages']) fs.cpSync(path.join(here, f), path.join(stage, f), { recursive: true })
fs.copyFileSync(pubFile, path.join(stage, 'license-public.pem'))
fs.writeFileSync(path.join(stage, 'app-config.json'), JSON.stringify({ centralUrl }, null, 2))
const browserOnly = ['react', 'react-dom', 'react-router-dom', 'lucide-react', 'leaflet']
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({
  name: 'smart-campus-erp',
  productName: 'Smart Campus ERP',
  version: rootPkg.version,
  description: 'Smart Campus ERP - school, college and coaching management (works offline)',
  author: 'Smart Campus',
  main: 'main.js',
  type: 'module',
  dependencies: Object.fromEntries(Object.entries(rootPkg.dependencies).filter(([name]) => !browserOnly.includes(name))),
}, null, 2))
run('npm install --omit=dev --no-audit --no-fund --loglevel=error', stage)

// 4. Local database engine: mongod.exe from this machine's MongoDB install (or SC_MONGOD).
const vendor = path.join(here, 'vendor', 'mongodb')
function findMongod() {
  if (process.env.SC_MONGOD) return process.env.SC_MONGOD
  const base = 'C:\\Program Files\\MongoDB\\Server'
  const versions = fs.existsSync(base) ? fs.readdirSync(base).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })) : []
  for (const v of versions) {
    const exe = path.join(base, v, 'bin', 'mongod.exe')
    if (fs.existsSync(exe)) return exe
  }
  return null
}
if (!fs.existsSync(path.join(vendor, 'mongod.exe'))) {
  const mongod = findMongod()
  if (!mongod) throw new Error('mongod.exe not found. Install MongoDB Community Server or set SC_MONGOD to its path.')
  fs.mkdirSync(vendor, { recursive: true })
  fs.copyFileSync(mongod, path.join(vendor, 'mongod.exe'))
  console.log(`[build] Bundling ${mongod}`)
}

console.log(`[build] Stage ready (central server: ${centralUrl})`)
if (args['stage-only']) process.exit(0)

// 5. Installer.
const { build, Platform, Arch } = await import('electron-builder')
const electronVersion = JSON.parse(fs.readFileSync(path.join(here, 'node_modules', 'electron', 'package.json'), 'utf8')).version
await build({
  targets: Platform.WINDOWS.createTarget('nsis', Arch.x64),
  projectDir: here,
  config: {
    appId: 'in.smartcampus.erp',
    productName: 'Smart Campus ERP',
    electronVersion,
    // Copy the Electron already installed in desktop/node_modules (no download / unpack).
    electronDist: path.join(here, 'node_modules', 'electron', 'dist'),
    asar: false, // the bundled server reads its files from disk
    npmRebuild: false,
    directories: { app: stage, output: path.join(here, 'release'), buildResources: path.join(here, 'build') },
    extraResources: [{ from: vendor, to: 'mongodb' }],
    win: { target: 'nsis', ...(fs.existsSync(path.join(here, 'build', 'icon.ico')) ? { icon: path.join(here, 'build', 'icon.ico') } : {}) },
    nsis: {
      oneClick: true,
      perMachine: false,
      createDesktopShortcut: 'always',
      createStartMenuShortcut: true,
      shortcutName: 'Smart Campus ERP',
      include: path.join(here, 'build', 'installer.nsh'),
      artifactName: 'SmartCampus-Setup-${version}.${ext}',
      deleteAppDataOnUninstall: false,
    },
  },
})
console.log(`[build] Installer ready in ${path.join(here, 'release')}`)
