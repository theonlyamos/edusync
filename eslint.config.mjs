import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'agents/**',
      'packages/**',
      'public/**',
      'next-env.d.ts',
      'supabase/**',
      // IDE metadata / reference docs (gitignored), not application source.
      '.cursor/**',
      '.agent/**',
      '.agents/**',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // ── Error tier: the debt this config exists to keep paid down ──
      // Empty catches hide real failures; a comment inside the block is the
      // explicit opt-in for genuinely best-effort cleanup paths.
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-console': ['error', { allow: ['warn', 'error'] }],

      // ── Backlog tier: visible as warnings, not gating ──
      // Pre-existing debt surfaced by first-time ESLint adoption; out of
      // Milestone 3 scope. Tracked as warnings so CI stays green while the
      // counts remain reviewable. Tighten to 'error' in a later pass.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'react/no-unescaped-entities': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@next/next/no-html-link-for-pages': 'warn',
      'prefer-const': 'warn',
      // React Compiler lint family (eslint-plugin-react-hooks v6) — high-value
      // but a large pre-existing backlog; warn for now.
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/static-components': 'warn',
    },
  },
  {
    files: ['scripts/**', 'src/**/__tests__/**'],
    rules: {
      'no-console': 'off',
    },
  },
]
