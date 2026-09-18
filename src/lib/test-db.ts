/**
 * A Prisma client of the test's own, for the suites that verify an effect landed
 * in the database directly (rather than through the endpoint under test).
 *
 * It deliberately does **not** import `@/lib/db`. The unit suites replace that
 * module with `mock.module('@/lib/db', () => ({ db: fakeDb }))` and bun's module
 * mocks are **process-wide**, so in a full `bun test` run one of those stubs can
 * be in place by the time another file's cleanup runs — which then queries a fake
 * with none of the models it needs. That is not hypothetical: `api-smoke.test.ts`
 * passed locally and failed on CI purely because the file order differed, every
 * failure pointing at its `directFind`. Building the client from the generated
 * module binds nothing a test can mock.
 *
 * `DATABASE_URL` comes from the environment. CI exports it from the job env; a
 * local `bun test` does not read `.env.local`, so a caller that needs it must
 * call `loadDevEnv()` first.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

let client: any

/**
 * Put `.env.local` into the environment, for the suites that read or restore the
 * database directly (`bun test` does not read it, and this is a no-op in CI,
 * where the job env already exports `DATABASE_URL`). Done here rather than with a
 * dotenv dependency: the file's shape is a handful of `KEY=value` lines, and the
 * three suites that need it should not each carry their own copy of the parser.
 */
export function loadDevEnv(): void {
  if (process.env.DATABASE_URL) return
  // `import.meta.dir` is the terser way to say this, but it is a Bun extension that
  // `tsc` (which does typecheck this file, unlike the `*.test.ts` callers) rejects.
  const here = path.dirname(fileURLToPath(import.meta.url))
  const envFile = path.resolve(here, '../../.env.local')
  if (!existsSync(envFile)) return
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?(.*?)"?\s*$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

export async function testDb(): Promise<any> {
  if (!client) {
    const { PrismaClient } = await import('@/generated/prisma/client')
    client = new PrismaClient({ log: [] })
  }
  return client
}

/**
 * Close the shared client (from a suite's `afterAll`) and forget it, so a suite
 * that runs later in the same process gets a live one rather than a closed pool.
 */
export async function closeTestDb(): Promise<void> {
  const current = client
  client = undefined
  try {
    await current?.$disconnect?.()
  } catch {
    /* already closed, or never connected */
  }
}
