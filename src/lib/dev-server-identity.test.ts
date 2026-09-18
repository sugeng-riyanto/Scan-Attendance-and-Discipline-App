/**
 * `src/lib/dev-server-identity.ts` — the file the dev server writes about itself.
 *
 * These are the guarantees `.zscripts/dev-up.sh` relies on when it reads that file
 * instead of probing the OS, so each case here is a rule the shell side is allowed to
 * assume: the port it picks, the checkout it names, that nothing is written in
 * production or when no port can be established, that a reader never sees a half-written
 * document, and that a clean exit takes the file with it.
 *
 * Pure unit tests: no server, no database, no env of the real process touched — every
 * case passes its own `env`/`cwd` into a temp directory.
 */
import { afterAll, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  DEFAULT_PID_FILE,
  pidFilePath,
  publishablePort,
  publishDevServerIdentity,
} from '@/lib/dev-server-identity'

const dirs: string[] = []
function scratch(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dev-server-identity-'))
  dirs.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

describe('dev server identity', () => {
  describe('where it publishes, and when it does not', () => {
    it('honours DEV_SERVER_PID_FILE whatever the environment otherwise says', () => {
      const env = { DEV_SERVER_PID_FILE: path.join(scratch(), 'relocated.json'), NODE_ENV: 'production' }
      expect(pidFilePath(env, '/some/checkout')).toBe(path.resolve(env.DEV_SERVER_PID_FILE))
    })

    it('publishes to the checkout by default in development', () => {
      // A scratch directory that *is* a checkout — the `.zscripts/` marker is what makes it
      // one, since `checkoutRoot` walks up looking for exactly that. Built from `os.tmpdir()`
      // rather than spelled out: `C:/checkout` is absolute on Windows and *relative* on
      // Linux, where it resolved inside this repository, whose own `.zscripts/` the walk-up
      // then found. The assertion held locally and failed in CI, on a fixture the platform
      // decided the meaning of.
      const cwd = scratch()
      mkdirSync(path.join(cwd, '.zscripts'), { recursive: true })
      expect(pidFilePath({ NODE_ENV: 'development' }, cwd)).toBe(path.join(cwd, DEFAULT_PID_FILE))
    })

    it('falls back to publishing beside itself when nothing above it is a checkout', () => {
      const cwd = scratch()
      expect(pidFilePath({ NODE_ENV: 'development' }, cwd)).toBe(path.join(cwd, DEFAULT_PID_FILE))
    })

    it('publishes nothing in production unless it was asked to', () => {
      expect(pidFilePath({ NODE_ENV: 'production' }, '/checkout')).toBeNull()
      expect(publishDevServerIdentity({ env: { NODE_ENV: 'production' }, cwd: scratch() })).toBeNull()
    })
  })

  describe('which port it claims', () => {
    it('takes what dev-up told it, over the conventional override', () => {
      expect(publishablePort({ DEV_SERVER_PORT: '3210', PORT: '4000' })).toBe(3210)
    })

    it('takes PORT when dev-up said nothing', () => {
      expect(publishablePort({ PORT: '4100' }, scratch())).toBe(4100)
    })

    it('falls back to the port the dev script pins, so a hand-started server agrees with dev-up', () => {
      const cwd = scratch()
      writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ scripts: { dev: 'next dev -p 3131' } }))
      expect(publishablePort({}, cwd)).toBe(3131)
    })

    it('claims nothing when no port can be established, rather than guessing one', () => {
      expect(publishablePort({}, scratch())).toBeNull()
      expect(publishablePort({ PORT: '0' }, scratch())).toBeNull()
      expect(publishablePort({ DEV_SERVER_PORT: 'not-a-port' }, scratch())).toBeNull()
    })
  })

  describe('what it writes', () => {
    it('names this process, the port, the checkout and when — and leaves no temp file', () => {
      const cwd = scratch()
      const env = { DEV_SERVER_PORT: '3457', NODE_ENV: 'test' }
      const written = publishDevServerIdentity({ env, cwd })
      const file = path.join(cwd, DEFAULT_PID_FILE)

      expect(written).not.toBeNull()
      expect(existsSync(file)).toBe(true)
      const onDisk = JSON.parse(readFileSync(file, 'utf8'))
      expect(onDisk).toEqual(written as object)
      expect(onDisk.pid).toBe(process.pid)
      expect(onDisk.port).toBe(3457)
      expect(onDisk.cwd).toBe(cwd)
      expect(Number.isNaN(Date.parse(onDisk.startedAt))).toBe(false)
      // A reader can never catch a partial document: the temp file is renamed over it.
      expect(readdirSync(path.dirname(file)).filter((name) => name.endsWith('.tmp'))).toEqual([])
    })

    it('answers a second boot with the newer pid, rather than appending', () => {
      const cwd = scratch()
      const env = { DEV_SERVER_PORT: '3458', NODE_ENV: 'test' }
      const first = publishDevServerIdentity({ env, cwd })
      const second = publishDevServerIdentity({ env, cwd })
      const onDisk = JSON.parse(readFileSync(path.join(cwd, DEFAULT_PID_FILE), 'utf8'))
      expect(onDisk.startedAt).toBe(second?.startedAt as string)
      expect(Date.parse(onDisk.startedAt)).toBeGreaterThanOrEqual(Date.parse(first!.startedAt))
      expect(onDisk.pid).toBe(second?.pid as number)
    })
  })
})
