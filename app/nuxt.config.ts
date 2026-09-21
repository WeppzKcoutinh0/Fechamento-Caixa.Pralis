export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  ssr: false,
  devtools: { enabled: true },
  modules: ['vuetify-nuxt-module', '@nuxt/eslint'],
  css: ['@mdi/font/css/materialdesignicons.css', '~/assets/main.css'],
  typescript: {
    strict: true,
    typeCheck: false,
  },
  // maxDuration: as rotas de sync (cron/importar-planilha, vendas/sincronizar) relêem a planilha
  // inteira do bot — mesmo com VENDAS_PRODUTOS desligado (ver sincronizarPlanilha.ts), o teto
  // padrão de função da Vercel (10s) não é suficiente pra ler+gravar ~1700 linhas de fechamento
  // (medido: ~50s local). 60 é o máximo que o plano Hobby permite sem precisar do Pro.
  nitro: {
    vercel: {
      functions: { maxDuration: 60 },
    },
  },
  runtimeConfig: {
    // Server-only (nunca vai para o client): usados só pela rota de ingestão de vendas
    // (server/routes/vendas/importar.post.ts). Mapeiam para NUXT_SUPABASE_SERVICE_ROLE_KEY e
    // NUXT_INTEGRACAO_VENDAS_CHAVE.
    supabaseServiceRoleKey: '',
    integracaoVendasChave: '',
    // Usados só por server/routes/cron/importar-planilha.get.ts (sync automático diário da
    // planilha Google Sheets que o bot_padaria_v3 já preenche). Ver TASKS.md pro contexto.
    cronSecret: '',
    googleServiceAccountJson: '',
    googleSpreadsheetId: '',
    googleSpreadsheetIdSecundario: '',
    empresaPralis: 'TNP CENTRAL',
    planilhaColunaInicial: 'F',
    // Religado (21/09/2026) — o Relatório Final do wizard passa a usar `vendas_produto_dia`
    // (lista de produtos vendidos no dia). Seguro de novo porque `sincronizarPlanilha.ts` agora
    // filtra pela janela de 14 dias antes de processar (não lê mais a planilha inteira a cada
    // execução, que era o motivo original de ter desligado isto).
    sincronizarProdutos: true,
    public: {
      supabaseUrl: '',
      supabaseAnonKey: '',
    },
  },
  vuetify: {
    vuetifyOptions: {
      icons: { defaultSet: 'mdi' },
      defaults: {
        VBtn: { rounded: 'lg' },
        VCard: { rounded: 'lg' },
        VTextField: { density: 'comfortable', variant: 'outlined' },
        VTextarea: { density: 'comfortable', variant: 'outlined' },
        VSelect: { density: 'comfortable', variant: 'outlined' },
        VAlert: { rounded: 'lg' },
        VChip: { rounded: 'pill' },
      },
      theme: {
        // Mesma identidade Cicluz do Sistema Inteligente Pralís (valores idênticos aos
        // temas `padariaLight`/`padariaDark` daquele projeto — repositórios separados, sem
        // como reusar o objeto de config, só os hex).
        defaultTheme: 'fechamentoLight',
        themes: {
          fechamentoLight: {
            dark: false,
            colors: {
              background: '#f4f6fa',
              surface: '#ffffff',
              primary: '#6515dd',
              secondary: '#35128c',
              success: '#16a34a',
              warning: '#b7791f',
              error: '#dc2626',
              info: '#2196f3',
            },
          },
          fechamentoDark: {
            dark: true,
            colors: {
              background: '#0f1318',
              surface: '#191f26',
              // Rendição escura da marca, não troca de identidade: #6515dd sobre superfície
              // escura reprova como texto/link. Clareado, o Vuetify passa a escolher tinta
              // escura por cima quando ele vira preenchimento.
              primary: '#a97bff',
              secondary: '#c9b0ff',
              success: '#4ade80',
              warning: '#e0a23a',
              error: '#ff8a80',
              info: '#64b5f6',
            },
          },
        },
      },
    },
  },
});
