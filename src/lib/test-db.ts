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
 * load it (see the top of `api-smoke.test.ts`).
 */
let client: any

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
