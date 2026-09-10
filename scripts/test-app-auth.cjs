const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

function load(file, mocks = {}, globals = {}) {
  const context = { exports: {}, URL, URLSearchParams, console, process, ...globals, require: name => {
    if (name in mocks) return mocks[name]
    throw new Error(`Unexpected import: ${name}`)
  } }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, context)
  return context.exports
}

test('redirects use the app role and only safe, role-compatible return paths', () => {
  const { getAppRedirect } = load('src/lib/app-user.ts')
  assert.equal(getAppRedirect('student'), '/students/dashboard')
  assert.equal(getAppRedirect('teacher'), '/teachers/dashboard')
  assert.equal(getAppRedirect('admin'), '/admin/dashboard')
  assert.equal(getAppRedirect('learner'), '/learn')
  assert.equal(getAppRedirect(null), '/learn')
  assert.equal(getAppRedirect('student', '/learn?topic=space'), '/learn?topic=space')
  assert.equal(getAppRedirect('learner', '/students/dashboard'), '/learn')
  for (const target of ['https://evil.test', '//evil.test', '/\\evil.test', 'javascript:alert(1)', '/login', '/login/', '/signup', '/admin/dashboard']) {
    assert.equal(getAppRedirect('student', target), '/students/dashboard')
  }
})

test('new accounts receive student profiles; concurrent provisioning preserves existing roles and credits', async () => {
  for (const concurrent of [false, true]) {
    const profile = { id: 'user-1', role: concurrent ? 'teacher' : 'student' }
    let creditCalls = 0
    const db = { from: () => ({
      select: () => ({ eq: () => ({
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: profile, error: null }),
      }) }),
      upsert: (values, options) => {
        assert.equal(values.role, 'student')
        assert.equal(options.ignoreDuplicates, true)
        return { select: () => ({ maybeSingle: async () => ({ data: concurrent ? null : profile, error: null }) }) }
      },
    }) }
    const response = { cookies: { set() {}, getAll: () => [] } }
    const { POST } = load('src/app/api/auth/provision/route.ts', {
      'next/server': { NextResponse: { next: () => response, json: body => ({ body, cookies: response.cookies }) } },
      '@/lib/auth': { getServerSession: async () => ({ user: { id: profile.id } }) },
      '@/lib/supabase.server': { createServerSupabase: () => db },
      '@/lib/credits': { initializeUserCredits: async () => { creditCalls++ } },
      '@/middleware/security': { addSecurityHeaders: r => r, configureCORS: (_, r) => r },
    })
    const result = await POST({ headers: {}, cookies: { getAll: () => [] }, json: async () => ({ id: profile.id }) })
    assert.equal(result.body.user.role, profile.role)
    assert.equal(creditCalls, concurrent ? 0 : 1)
  }
})

test('provision returns the database profile without replacing an existing role', async () => {
  const profile = { id: 'user-1', email: 'student@example.test', name: 'Student', image: null, role: 'learner' }
  let updated
  const db = { from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: profile.id }, error: null }) }) }),
    update: values => { updated = values; return { eq: () => ({ select: () => ({ single: async () => ({ data: profile, error: null }) }) }) } },
  }) }
  const response = { cookies: { set() {}, getAll: () => [] } }
  const { POST } = load('src/app/api/auth/provision/route.ts', {
    'next/server': { NextResponse: { next: () => response, json: (body) => ({ body, cookies: response.cookies }) } },
    '@/lib/auth': { getServerSession: async () => ({ user: { id: profile.id } }) },
    '@/lib/supabase.server': { createServerSupabase: () => db },
    '@/lib/credits': { initializeUserCredits: async () => assert.fail('Existing user credits must not reset') },
    '@/middleware/security': { addSecurityHeaders: r => r, configureCORS: (_, r) => r },
  })
  const result = await POST({ headers: {}, cookies: { getAll: () => [] }, json: async () => ({ ...profile, role: 'admin' }) })
  assert.equal(result.body.user.role, 'learner')
  assert.equal('role' in updated, false)
})

test('server roles never fall back to user-editable metadata', async () => {
  const { getServerSession } = load('src/lib/auth.ts', {
    'next/headers': { cookies: async () => ({ getAll: () => [] }) },
    '@/lib/env': { env: () => ({}) },
    '@supabase/ssr': { createServerClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1', user_metadata: { role: 'admin' } } } }) },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
    }) },
  })
  assert.equal((await getServerSession()).user.role, null)
})

test('browser profile waits, rejects stale account responses, clears on signout, and surfaces errors', async () => {
  const slots = [], pending = []
  let cursor = 0, onAuth, tree
  const requests = []
  const react = {
    createContext: () => ({ Provider: Symbol() }),
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value }] },
    useRef: initial => { const i = cursor++; return slots[i] ??= { current: initial } },
    useMemo: fn => { const i = cursor++; return slots[i] ??= fn() },
    useEffect: (fn, deps) => {
      const i = cursor++, previous = slots[i]
      if (!previous || deps.some((dep, j) => !Object.is(dep, previous.deps[j]))) {
        pending.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: fn() } })
      }
    },
  }
  let provisions = 0
  const client = { from: () => ({ select: () => ({ eq: () => ({
    maybeSingle: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
  }) }) }), auth: {
    getSession: async () => ({ data: { session: null } }),
    onAuthStateChange: callback => { onAuth = callback; return { data: { subscription: { unsubscribe() {} } } } },
  } }
  const mod = load('src/components/providers/SupabaseAuthProvider.tsx', {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    '@supabase/ssr': { createBrowserClient: () => client },
    axios: { post: async () => { provisions++; return { data: { user: { id: 'd', role: 'student' } } } } },
    '@tanstack/react-query': { QueryClient: class {}, QueryClientProvider: Symbol() },
    '@/lib/auth-session': { shouldClearInvalidRefreshSession: () => false },
  }, { window: { location: { href: 'http://localhost/login' } } })
  function render() {
    cursor = 0
    tree = mod.SupabaseAuthProvider({ children: null })
    while (pending.length) pending.shift()()
    return tree.props.children.props.children.props.value
  }
  const flush = () => new Promise(resolve => setImmediate(resolve))
  assert.equal(render().loading, true)
  await flush(); assert.equal(render().loading, false)
  const signIn = id => onAuth('SIGNED_IN', { user: { id, user_metadata: { role: 'admin' } } })
  await signIn('a'); assert.equal(render().loading, true)
  await signIn('b'); assert.equal(render().user, null)
  requests[0].resolve({ data: { id: 'a', role: 'admin' } }); await flush()
  assert.equal(render().user, null)
  requests[1].resolve({ data: { id: 'b', role: 'learner' } }); await flush()
  assert.equal(render().user.role, 'learner')
  await onAuth('SIGNED_OUT', null); assert.equal(render().user, null)
  await signIn('c'); render(); requests[2].reject(new Error('Offline')); await flush()
  assert.equal(render().loading, false)
  assert.match(render().error, /Unable to load/)
  assert.equal(provisions, 0)
  await signIn('d'); render(); requests[3].resolve({ data: null }); await flush()
  assert.equal(render().user.role, 'student')
  assert.equal(provisions, 1)
})
