import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

/**
 * Camadas (CONVENCOES.md · Camadas). Cada pasta só importa das que estão abaixo dela:
 *
 *   components/work, registry, audit   telas
 *   components/shell, signal           peças comuns (não conhecem as telas)
 *   components/ui                      shadcn (não conhece o app)
 *   data, sim, audit, permit, registry lojas e acesso à API (não conhecem componentes)
 *   core                               regras puras (sem React, sem lojas, sem API)
 *   lib                                utilitários (não conhecem mais nada)
 *
 * `banned(...)` devolve a regra que recusa os imports dados, com a frase que diz o que fazer.
 */
const banned = (patterns) => ({
  'no-restricted-imports': ['error', { patterns: patterns.map(([group, message]) => ({ group, message })) }],
})
/** Um assunto grande de core é uma pasta com um arquivo de entrada (core/form.ts → core/form/*). Fora de core, só a entrada. */
const INSIDE = [['@/core/*/*'], 'importe pela entrada do assunto (ex.: @/core/form), nunca de dentro da pasta.']
const COMPONENTS = ['@/components/**', '**/components/**']
const STORES = ['@/data/**', '@/sim/**', '@/audit/store', '@/permit/store', '@/registry/store']
const SCREENS = ['@/components/work/**', '@/components/registry/**', '@/components/audit/**', '../work/**', '../registry/**', '../audit/**']
const TESTS = ['**/*.test.ts', '**/*.test.tsx', 'src/demo/**', 'src/data/memory/**', 'src/data/api/testkit.ts']

export default defineConfig([
  globalIgnores(['dist', 'src/data/api/schema.d.ts']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },

  /* ---- camadas ---- */
  { files: ['src/**/*.{ts,tsx}'], ignores: ['src/core/**'], rules: banned([INSIDE]) },
  {
    files: ['src/lib/**'], ignores: TESTS,
    rules: banned([[['@/core/**', '@/registry/**', '@/permit/**', '@/audit/**', ...STORES, ...COMPONENTS, 'react'], 'lib não conhece o resto do app: mova o que precisa para core/ ou para o componente.']]),
  },
  {
    files: ['src/core/**'], ignores: TESTS,
    rules: banned([
      [['react', 'react-dom', 'lucide-react', 'sonner'], 'core é regra pura: sem React nem interface. Devolva dados; o componente desenha.'],
      [[...STORES, ...COMPONENTS], 'core não conhece lojas, API nem componentes: receba os dados por parâmetro.'],
    ]),
  },
  {
    files: ['src/data/**', 'src/sim/**', 'src/audit/**', 'src/permit/**', 'src/registry/**'], ignores: TESTS,
    rules: banned([[COMPONENTS, 'lojas e acesso a dados não importam componentes.'], INSIDE]),
  },
  {
    files: ['src/components/**'], ignores: TESTS,
    rules: banned([[['@/data/api/**', '@/data/memory/**'], 'componentes falam com os dados só por @/data/port, @/data/hooks e @/data/context.'], INSIDE]),
  },
  {
    files: ['src/components/ui/**'],
    rules: banned([[['@/core/**', '@/registry/**', '@/permit/**', '@/audit/**', ...STORES, '@/components/shell/**', '@/components/signal/**', ...SCREENS], 'components/ui é shadcn: não conhece o app. Componha fora daqui.']]),
  },
  {
    files: ['src/components/shell/**', 'src/components/signal/**'], ignores: TESTS,
    rules: banned([
      [SCREENS, 'shell e signal são peças comuns: não importam telas. O que as duas precisam vai para core/ (regra, formato) ou shell/ (peça).'],
      [['@/data/api/**', '@/data/memory/**'], 'componentes falam com os dados só por @/data/port, @/data/hooks e @/data/context.'],
      INSIDE,
    ]),
  },

  /* ---- tamanho ---- */
  {
    files: ['src/**/*.{ts,tsx}'], ignores: [...TESTS, 'src/components/ui/**', 'src/registry/seed*.ts', 'src/permit/seed.ts', 'src/audit/seed.ts'],
    rules: { 'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }] },
  },
])
