// Test-only helper: a small in-memory stand-in for the Supabase query builder.
export type Row = Record<string, any>

/** A small in-memory stand-in for the Supabase query builder calls these helpers make. */
export function fakeSupabase(tables: Record<string, Row[]>) {
  const rpcCalls: Array<{ name: string; args: unknown }> = []
  let nextId = 1
  const from = (table: string) => {
    const filters: Array<(row: Row) => boolean> = []
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let payload: any
    let countOnly = false
    let single = false
    const rows = () => (tables[table] ??= [])
    const builder: any = {
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) countOnly = true
        return builder
      },
      eq: (col: string, value: unknown) => { filters.push((r) => r[col] === value); return builder },
      is: (col: string, value: unknown) => { filters.push((r) => (r[col] ?? null) === value); return builder },
      in: (col: string, values: unknown[]) => { filters.push((r) => values.includes(r[col])); return builder },
      // Case-insensitive equality; patterns with % or _ are not needed by the tests.
      ilike: (col: string, value: string) => { filters.push((r) => String(r[col] ?? '').toLowerCase() === value.toLowerCase()); return builder },
      order: () => builder,
      limit: () => builder,
      neq: (col: string, value: unknown) => { filters.push((r) => r[col] !== value); return builder },
      maybeSingle: () => { single = true; return builder },
      single: () => { single = true; return builder },
      insert: (value: Row | Row[]) => { op = 'insert'; payload = value; return builder },
      update: (value: Row) => { op = 'update'; payload = value; return builder },
      delete: () => { op = 'delete'; return builder },
      then: (resolve: (result: unknown) => void, reject: (error: unknown) => void) => {
        try {
          if (op === 'insert') {
            const added = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ id: `row-${nextId++}`, ...r }))
            rows().push(...added)
            return resolve({ data: single ? added[0] : added, error: null })
          }
          const matched = rows().filter((r) => filters.every((f) => f(r)))
          if (op === 'update') {
            matched.forEach((r) => Object.assign(r, payload))
            return resolve({ data: single ? matched[0] ?? null : matched, error: null })
          }
          if (op === 'delete') {
            tables[table] = rows().filter((r) => !matched.includes(r))
            return resolve({ data: matched, error: null })
          }
          if (countOnly) return resolve({ count: matched.length, error: null })
          return resolve({ data: single ? matched[0] ?? null : matched, error: null })
        } catch (error) {
          reject(error)
        }
      },
    }
    return builder
  }
  return {
    client: { from, rpc: async (name: string, args: unknown) => { rpcCalls.push({ name, args }); return { error: null } } } as any,
    tables,
    rpcCalls,
  }
}
