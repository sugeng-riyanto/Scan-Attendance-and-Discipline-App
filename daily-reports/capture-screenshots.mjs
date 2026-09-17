/**
 * Capture the app's screens for a daily report.
 *
 *   node daily-reports/capture-screenshots.mjs 17_09_2026
 *
 * Writes `daily-reports/screenshots/<date>-<name>.png`. Needs the dev server up
 * (`npm run dev:up`) and Chrome installed; no browser-automation dependency, since
 * the only three things required — navigate, set a cookie, screenshot — are all
 * DevTools Protocol calls this script makes itself over Node's built-in WebSocket.
 *
 * The app authenticates with a JWT in a `token` cookie, so the script logs in
 * through the API and injects that cookie: without it every screenshot would be
 * the login form, which documents nothing about the work.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const BASE = process.env.SCREENSHOT_BASE ?? 'http://localhost:3000'
const PORT = Number(process.env.SCREENSHOT_CDP_PORT ?? 9333)
const USER = process.env.SCREENSHOT_USER ?? 'admin'
const PASS = process.env.SCREENSHOT_PASS ?? 'admin123'
const VIEWPORT = { width: 1440, height: 1000 }

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

/** date argument is dd_mm_yyyy; the folder and the report share it. */
const date = process.argv[2]
if (!date || !/^\d{2}_\d{2}_\d{4}$/.test(date)) {
  console.error('usage: node daily-reports/capture-screenshots.mjs dd_mm_yyyy')
  process.exit(2)
}

const PAGES = [
  {
    name: 'dashboard',
    url: '/',
    note: 'signed in as a school admin',
    // See seedSchoolStore(): the cookie alone lands an admin on the school
    // picker, so this screen needs the persisted school chosen first.
    seedStore: true,
  },
  { name: 'terms', url: '/terms', note: 'Terms & Conditions' },
  { name: 'scan', url: '/scan', note: 'attendance scan' },
]

const outDir = path.join('daily-reports', 'screenshots')
mkdirSync(outDir, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!chrome) {
  console.error('no Chrome/Edge found; install one or set one of the candidates in this script')
  process.exit(2)
}

/** Log in the way the UI does, and hand back the token cookie. */
async function attempt(body) {
  const res = await fetch(`${BASE}/api/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  const setCookie = res.headers.getSetCookie?.() ?? []
  const raw = setCookie.find((c) => c.startsWith('token=')) ?? res.headers.get('set-cookie') ?? ''
  return { res, text, token: /(?:^|;\s*)token=([^;]+)/.exec(raw)?.[1] }
}

async function login() {
  let { res, text, token } = await attempt({ username: USER, password: PASS })
  // A user who has not accepted the current T&C version is refused, and the UI's
  // answer is the acceptance checkbox — so this script sends what it sends. On the
  // seeded dev database that is exactly what a human admin does on first login.
  if (!res.ok && /Terms & Conditions have been updated/i.test(text)) {
    console.log(`  ${USER} has not accepted T&C v${JSON.parse(text).currentVersion} yet; accepting as the UI does`)
    ;({ res, text, token } = await attempt({ username: USER, password: PASS, acceptedTerms: true }))
  }
  if (!res.ok || !token) {
    throw new Error(`login as ${USER} failed: HTTP ${res.status} ${text.slice(0, 200)}`)
  }
  return { token, user: JSON.parse(text).user }
}

async function waitForCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (r.ok) return (await r.json()).webSocketDebuggerUrl
    } catch {
      // not listening yet
    }
    await sleep(250)
  }
  throw new Error(`Chrome did not open its debugging port ${PORT}`)
}

/** Minimal CDP client: id-keyed request/response plus awaited events. */
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  const pending = new Map()
  const waiters = new Map()
  let nextId = 0
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString())
    if (msg.id !== undefined) {
      const p = pending.get(msg.id)
      if (!p) return
      pending.delete(msg.id)
      msg.error ? p.reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? '')})`)) : p.resolve(msg.result)
      return
    }
    const list = waiters.get(msg.method)
    if (list?.length) list.shift()(msg.params)
  })
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', () => reject(new Error('CDP websocket failed')))
  })
  return {
    ready,
    send(method, params = {}) {
      const id = ++nextId
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
      })
    },
    once(method, timeoutMs = 30_000) {
      return new Promise((resolve, reject) => {
        const list = waiters.get(method) ?? []
        const timer = setTimeout(() => reject(new Error(`timed out waiting for ${method}`)), timeoutMs)
        list.push((params) => {
          clearTimeout(timer)
          resolve(params)
        })
        waiters.set(method, list)
      })
    },
    close: () => ws.close(),
  }
}

async function newTarget() {
  // Chrome wants PUT for /json/new since v111; older builds accept GET.
  for (const method of ['PUT', 'GET']) {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method })
    if (r.ok) return r.json()
  }
  throw new Error('could not open a CDP target')
}

/**
 * Write the school the login flow writes. `school-auth-storage` is what makes the
 * app show that school's dashboard instead of the picker: the cookie authenticates,
 * but a fresh browser is signed in and still asks which school to enter, so a
 * screenshot taken with only the cookie documents the picker. The shape is the
 * store's own (see src/lib/stores/auth-store.ts) and `user` is the object the login
 * API just returned, so this reproduces the app's own state rather than a copied one.
 */
async function seedSchoolStore(cdp, user) {
  const store = JSON.stringify({ state: { user, isAuthenticated: true, token: null }, version: 0 })
  await cdp.send('Page.navigate', { url: `${BASE}/` })
  await sleep(1500)
  await cdp.send('Runtime.evaluate', {
    expression: `localStorage.setItem('school-auth-storage', ${JSON.stringify(store)})`,
    returnByValue: true,
  })
  return user.school ? `${user.school.code} — ${user.school.name}` : 'no school on this account'
}

const { token, user } = await login()
console.log(`logged in as ${USER} (${user.role})`)

const proc = spawn(
  chrome,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(process.env.TEMP ?? '/tmp', `report-shots-${PORT}`)}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--hide-scrollbars',
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    'about:blank',
  ],
  { stdio: 'ignore', detached: false },
)

let cdp
try {
  await waitForCdp()
  const target = await newTarget()
  cdp = connect(target.webSocketDebuggerUrl)
  await cdp.ready
  await cdp.send('Page.enable')
  await cdp.send('Network.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 1, mobile: false })
  await cdp.send('Network.setCookie', { name: 'token', value: token, url: `${BASE}/`, path: '/' })

  if (PAGES.some((p) => p.seedStore)) {
    console.log(`  school store seeded with ${await seedSchoolStore(cdp, user)}`)
  }

  for (const page of PAGES) {
    const loaded = cdp.once('Page.loadEventFired')
    await cdp.send('Page.navigate', { url: `${BASE}${page.url}` })
    await loaded.catch(() => {})
    // The UI fetches its data after the document loads; the socket relay and the
    // first API round trips need a beat before the screen is worth photographing.
    await sleep(4000)
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
    const file = path.join(outDir, `${date}-${page.name}.png`)
    writeFileSync(file, Buffer.from(data, 'base64'))
    // A file existing is not evidence that it shows the right thing, so read the
    // screen back too: path, title, and the first line of visible text.
    const probe = await cdp.send('Runtime.evaluate', {
      expression:
        'JSON.stringify({path: location.pathname, title: document.title, ' +
        'text: (document.body.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 120)})',
      returnByValue: true,
    })
    const seen = JSON.parse(probe.result.value)
    console.log(`  ${file}`)
    console.log(`      url ${page.url} -> ${seen.path} | title ${JSON.stringify(seen.title)}`)
    console.log(`      screen: ${JSON.stringify(seen.text)}`)
  }
} finally {
  try {
    cdp?.close()
  } catch {
    // closing a socket that already went away is not an error worth reporting
  }
  proc.kill()
}
