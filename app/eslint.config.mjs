// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs';

export default withNuxt(
  {
    files: ['**/*.ts', '**/*.vue'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // Prettier sempre fecha elementos void (<input />) — sem isso, format (Prettier) e
      // lint (ESLint) discordam e ficam desfazendo a formatação um do outro.
      'vue/html-self-closing': ['error', { html: { void: 'always' } }],
    },
  },
  {
    // As seções do wizard recebem o rascunho do fechamento inteiro como prop e mutam seus
    // campos diretamente (padrão intencional: um objeto grande e compartilhado, não 40+ props
    // e emits por seção) — não é o padrão geral do projeto, só desta pasta.
    files: ['components/fechamento/**/*.vue'],
    rules: {
      'vue/no-mutating-props': 'off',
    },
  },
  {
    ignores: ['dist/**', '.output/**', '.nuxt/**'],
  },
);
