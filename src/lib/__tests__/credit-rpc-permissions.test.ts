import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrations = join(process.cwd(), 'supabase/migrations')
const signatures = [
  'deduct_user_credits(uuid, integer, text, uuid)',
  'add_user_credits(uuid, integer, text, text, text)',
]

async function permissionMigration() {
  const files = (await readdir(migrations)).filter((file) =>
    file.endsWith('_restrict_credit_rpc_execution.sql'),
  )
  expect(files).toHaveLength(1)
  return (await readFile(join(migrations, files[0]), 'utf8'))
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

describe('credit mutation RPC permissions', () => {
  it('revokes both browser roles and inherited PUBLIC execution on both exact signatures', async () => {
    const sql = await permissionMigration()
    for (const signature of signatures) {
      expect(sql).toContain(`revoke execute on function public.${signature} from public, anon, authenticated;`)
    }
  })

  it('preserves explicit server service-role execution', async () => {
    const sql = await permissionMigration()
    for (const signature of signatures) {
      expect(sql).toContain(`grant execute on function public.${signature} to service_role;`)
    }
  })

  it('changes only these permissions, atomically, without replacing functions or changing balances', async () => {
    const sql = await permissionMigration()
    const statements = sql.split(';').map((statement) => statement.trim()).filter(Boolean)
    expect(statements[0]).toBe('begin')
    expect(statements.at(-1)).toBe('commit')
    expect(statements.slice(1, -1).sort()).toEqual(signatures.flatMap((signature) => [
      `revoke execute on function public.${signature} from public, anon, authenticated`,
      `grant execute on function public.${signature} to service_role`,
    ]).sort())
  })
})
