/**
 * `src/lib/service-identity.ts` — the file a service writes about itself at boot.
 *
 * Both services in this checkout publish through this module, and `.zscripts/lib-stack.sh`
 * (`published_pid`) checks what they wrote, so these cases are the contract between the two
 * sides: where the file goes when a service runs from a subdirectory, which ports may be
 * claimed at all, that nothing is written in production, that a reader can never catch half
 * a document, and that a clean exit takes the claim with it while leaving someone else's
 * alone.
 *
 * Pure unit tests: no server, no database, and the real process's env is never touched —
 * every case passes its own `env`/`cwd`, and the two exit cases run in a child process so
 * the parent's exit handler is not the thing under test.
 */
import { afterAll, describe, expect, it } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkoutRoot, identityFilePath, publishServiceIdentity } from '@/lib/service-identity'

const dirs: string[] = []
function scratch(prefix = 'service-identity-'): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

/** A checkout (a directory holding `.zscripts/`) with a service running in a subdirectory. */
function checkoutWithServiceIn(...segments: string[]): { root: string; cwd: string } {
  const root = scratch()
  mkdirSync(path.join(root, '.zscripts'), { recursive: true })
  const cwd = path.join(root, ...segments)
  mkdirSync(cwd, { recursive: true })
  return { root, cwd }
}

const MODULE_URL = pathToFileURL(path.join(import.meta.dir, 'service-identity.ts')).href

/**
 * Publish through the real module in a child process that then exits, which is the only way
 * to exercise the clean-exit cleanup — the file has to outlive (or not outlive) a process
 * that is really gone. `after` runs between the publication and the exit.
 */
function publishInChild(
  file: string,
  after = '',
): { status: number | null; stdout: string; stderr: string } {
  const script = `
    const { pathToFileURL } = require('node:url');
    import(${JSON.stringify(MODULE_URL)}).then((m) => {
      const written = m.publishServiceIdentity({
        service: 'probe',
        envVar: 'PROBE_PID_FILE',
        defaultPath: '.zscripts/probe.json',
        port: 4321,
      });
      console.log('child published pid ' + (written ? written.pid : 'nothing') + ' to ' + ${JSON.stringify(file)});
      ${after}
    });
  `
  const result = spawnSync(process.execPath, ['-e', script], {
    env: { ...process.env, NODE_ENV: 'test', PROBE_PID_FILE: file },
    encoding: 'utf8',
    timeout: 60_000,
  })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

describe('service identity', () => {
  describe('where a service publishes', () => {
    const target = { envVar: 'SOCKET_PID_FILE', defaultPath: path.join('.zscripts', 'attendance-socket.json') }

    it('honours the env var whatever the environment otherwise says', () => {
      const relocated = path.join(scratch(), 'elsewhere.json')
      expect(identityFilePath(target, { SOCKET_PID_FILE: relocated, NODE_ENV: 'production' }, '/anywhere')).toBe(
        path.resolve(relocated),
      )
    })

    it('finds the checkout from a service running in a subdirectory', () => {
      // The socket mini-service starts from its own package directory while the app starts
      // from the repository root; both have to land on the same `.zscripts/`.
      const { root, cwd } = checkoutWithServiceIn('mini-services', 'attendance-socket')
      expect(checkoutRoot(cwd)).toBe(root)
      expect(identityFilePath(target, { NODE_ENV: 'development' }, cwd)).toBe(
        path.join(root, target.defaultPath),
      )
    })

    it('falls back to the directory itself when there is no checkout above it', () => {
      const orphan = scratch()
      expect(checkoutRoot(orphan)).toBe(orphan)
      expect(identityFilePath(target, { NODE_ENV: 'development' }, orphan)).toBe(
        path.join(orphan, target.defaultPath),
      )
    })

    it('publishes nothing in production unless it was asked to', () => {
      const { cwd } = checkoutWithServiceIn('mini-services', 'attendance-socket')
      expect(identityFilePath(target, { NODE_ENV: 'production' }, cwd)).toBeNull()
      expect(
        publishServiceIdentity({ ...target, service: 'probe', port: 4321, env: { NODE_ENV: 'production' }, cwd }),
      ).toBeNull()
    })
  })

  describe('which claims it refuses to make', () => {
    const options = (cwd: string, port: number | null) => ({
      service: 'probe',
      envVar: 'PROBE_PID_FILE',
      defaultPath: path.join('.zscripts', 'probe.json'),
      port,
      env: { NODE_ENV: 'development' } as NodeJS.ProcessEnv,
      cwd,
    })

    it('writes nothing when no port could be established, rather than guessing one', () => {
      const cwd = scratch()
      expect(publishServiceIdentity(options(cwd, null))).toBeNull()
      expect(existsSync(path.join(cwd, '.zscripts'))).toBe(false)
    })

    it('refuses a port that is not a real TCP port', () => {
      const cwd = scratch()
      for (const port of [0, -1, 70_000, 12.5]) {
        expect(publishServiceIdentity(options(cwd, port))).toBeNull()
      }
      expect(existsSync(path.join(cwd, '.zscripts'))).toBe(false)
    })
  })

  describe('what it writes', () => {
    it('names the service, this process, the port and the directory — and leaves no temp file', () => {
      const { root, cwd } = checkoutWithServiceIn('mini-services', 'attendance-socket')
      const written = publishServiceIdentity({
        service: 'attendance-socket',
        envVar: 'PROBE_PID_FILE',
        defaultPath: path.join('.zscripts', 'probe.json'),
        port: 3457,
        env: { NODE_ENV: 'development' },
        cwd,
      })

      expect(written).not.toBeNull()
      const file = path.join(root, '.zscripts', 'probe.json')
      const onDisk = JSON.parse(readFileSync(file, 'utf8'))
      expect(onDisk).toEqual(written as object)
      expect(onDisk.service).toBe('attendance-socket')
      expect(onDisk.pid).toBe(process.pid)
      expect(onDisk.port).toBe(3457)
      expect(onDisk.cwd).toBe(cwd)
      expect(Number.isNaN(Date.parse(onDisk.startedAt))).toBe(false)
      // A reader can never catch a partial document: the temp file is renamed over it.
      expect(readdirSync(path.dirname(file)).filter((name) => name.endsWith('.tmp'))).toEqual([])
    })

    it('answers a second boot in the same directory with the newer document', () => {
      const cwd = scratch()
      const options = {
        service: 'probe',
        envVar: 'PROBE_PID_FILE',
        defaultPath: path.join('.zscripts', 'probe.json'),
        port: 3458,
        env: { NODE_ENV: 'development' } as NodeJS.ProcessEnv,
        cwd,
      }
      const first = publishServiceIdentity(options)
      const second = publishServiceIdentity(options)
      const onDisk = JSON.parse(readFileSync(path.join(cwd, '.zscripts', 'probe.json'), 'utf8'))
      expect(onDisk.startedAt).toBe(second?.startedAt as string)
      expect(Date.parse(onDisk.startedAt)).toBeGreaterThanOrEqual(Date.parse(first!.startedAt))
    })
  })

  describe('a clean exit', () => {
    it('takes its own claim with it', () => {
      const file = path.join(scratch(), 'claim.json')
      const published = publishInChild(file)
      expect(published.stderr).toBe('')
      expect(published.stdout).toContain('published pid ')
      // The child wrote it as its own pid, then exited — the handler unlinked it.
      expect(existsSync(file)).toBe(false)
    })

    it('leaves a claim that is no longer its own', () => {
      const file = path.join(scratch(), 'claim.json')
      const published = publishInChild(
        file,
        `require('node:fs').writeFileSync(${JSON.stringify(file)}, JSON.stringify({ pid: 999999 }));`,
      )
      expect(published.stderr).toBe('')
      // Another process's claim: deleting it would delete that process's answer, and a
      // since-recycled pid is the one way the file route can be wrong — so leave it for the
      // next `dev:up` to check and the next boot to overwrite.
      expect(existsSync(file)).toBe(true)
      expect((JSON.parse(readFileSync(file, 'utf8')) as { pid: number }).pid).toBe(999999)
    })
  })
})
