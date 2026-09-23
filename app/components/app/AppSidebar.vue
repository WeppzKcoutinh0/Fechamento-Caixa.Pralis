<script setup lang="ts">
// Menu lateral do app — visual portado da identidade Cicluz (mesma marca do Sistema Inteligente
// Pralís, ver assets/main.css). Todo o conteúdo deste menu (grupos de navegação) é admin-only —
// ver `grupos` abaixo — porque cada um desses destinos olha o histórico de TODOS os fechamentos,
// não o do caixa de quem está logado:
//   - ENTRADAS/TRANSFERENCIAS/SAIDAS abrem as telas de consulta por data/horário
//     (pages/entradas.vue, transferencias.vue, saidas.vue).
//   - HISTÓRICO é a lista de sessões/fechamentos de todo mundo (pages/historico.vue).
//   - Sem "RESULTADOS" (removido a pedido do usuário, 18/09/2026) — apontava pro painel
//     (`/`), redundante com simplesmente ir pra home.
//   - Sem "+ NOVO FECHAMENTO" (removido a pedido do usuário, 18/09/2026) — a única forma de
//     criar um fechamento agora é pelo fluxo de Abrir Caixa (`PainelCaixaOperacional.vue`).
//   - Sem grupo "Configuração"/"Geral": não têm destino real ainda, e o usuário pediu pra tirar
//     o estado desabilitado "Em breve" em vez de manter como placeholder.
import { computed, onMounted, ref } from 'vue';
import { useModoEscuro } from '~/composables/useModoEscuro';
import { useSidebarMobile } from '~/composables/useSidebarMobile';
import { usePerfil } from '~/composables/usePerfil';
import { usePendenciasFundoCaixa } from '~/composables/usePendenciasFundoCaixa';

const recolhida = ref(false);

// Logo cheia tem o texto "CICLUZ / Gestão Profissional" num cinza escuro sólido — ilegível em
// cima do surface escuro do tema `fechamentoDark` (#191f26). `logo-cicluz-dark.png` é a mesma
// arte com só o texto repintado de branco (ícone colorido intacto), gerada uma vez (script
// descartável, não faz parte do build) a partir do original.
const { escuro } = useModoEscuro();
const logoSrc = computed(() =>
  escuro.value ? '/marca/logo-cicluz-dark.png' : '/marca/logo-cicluz.png',
);

// Abaixo de 900px o menu não fica mais fixo empurrando o conteúdo (era o que acontecia antes —
// numa tela de celular ele sozinho ocupava mais da metade da largura) — vira um painel
// sobreposto (temporary), fechado por padrão, aberto pelo hambúrguer do CabecalhoPainel.vue.
const { aberto, mobile } = useSidebarMobile();
const drawerAberto = computed<boolean>({
  get: () => (mobile.value ? aberto.value : true),
  set: (v) => {
    if (mobile.value) aberto.value = v;
  },
});
function aoNavegar(): void {
  if (mobile.value) aberto.value = false;
}

interface GrupoNav {
  id: string;
  label: string;
  to: string;
  icone: string;
  cor: string;
}

// Mesmo ícone usado no cabeçalho de cada tela de consulta (ConsultaPorPeriodo) — o menu recolhido
// (rail) só mostra o ícone, então ele precisa já dizer sozinho do que se trata.
//
// Fluxo de Caixa (18/09/2026, atualizado por pedido do usuário): uma conta CAIXA só faz uma
// coisa neste app — abrir o próprio caixa e preencher o fechamento dele (fluxo todo dentro de
// `PainelCaixaOperacional`/`WizardFechamento`). Nenhum item de navegação por período
// (Entradas/Transferências/Saídas) ou visão geral (Histórico) faz sentido pra ela — são todas
// telas que olham o histórico de TODOS os fechamentos, não o caixa dela. RLS já
// bloqueia o acesso aos dados de qualquer forma; isto é só a navegação não oferecer um link que
// levaria a uma tela vazia/redirecionada. Só admin vê o menu (e o botão "+ NOVO FECHAMENTO",
// abaixo) por completo.
const { isAdmin } = usePerfil();
// Contador real de pendências de fundo de caixa (23/09/2026) — nunca fictício, mesmo espírito da
// decisão já registrada acima de não ter pílula/badge sem dado de verdade por trás.
const { total: totalPendencias, atualizarContagem } = usePendenciasFundoCaixa();
onMounted(() => {
  if (isAdmin.value) atualizarContagem();
});
const grupos = computed<GrupoNav[]>(() => {
  if (!isAdmin.value) return [];
  return [
    {
      id: 'entradas',
      label: 'Entradas',
      to: '/entradas',
      icone: 'mdi-arrow-bottom-left-thick',
      cor: 'var(--cat-venda-base)',
    },
    {
      id: 'transferencias',
      label: 'Transferências',
      to: '/transferencias',
      icone: 'mdi-swap-horizontal-bold',
      cor: 'var(--cat-transferencias-base)',
    },
    {
      // Caixa Principal/Troco/Fluxo (23/09/2026) — não são uma das 6 categorias reais do
      // Pralís, mesmo caso de Maquininhas/Crediário/Pendências: roxo neutro da marca.
      id: 'cofres',
      label: 'Cofres',
      to: '/cofres',
      icone: 'mdi-safe-square-outline',
      cor: 'var(--cx-brand)',
    },
    {
      id: 'saidas',
      label: 'Saídas',
      to: '/saidas',
      icone: 'mdi-arrow-top-right-thick',
      cor: 'var(--cat-despesas-base)',
    },
    {
      id: 'historico',
      label: 'Histórico',
      to: '/historico',
      icone: 'mdi-archive-clock-outline',
      cor: 'var(--cat-resultado-base)',
    },
    {
      // Não é uma das 6 categorias reais do Pralís (mesmo caso de Maquininhas/Crediário em
      // SecaoRelatorios.vue) — fica no roxo neutro da marca em vez de inventar uma cor de
      // "warning" sem correspondência real no design system.
      id: 'pendencias',
      label: 'Pendências',
      to: '/pendencias',
      icone: 'mdi-alert-circle-outline',
      cor: 'var(--cx-brand)',
    },
  ];
});
</script>

<template>
  <v-navigation-drawer
    v-model="drawerAberto"
    :permanent="!mobile"
    :temporary="mobile"
    :rail="!mobile && recolhida"
    :width="248"
    rail-width="76"
    class="app-sidebar"
  >
    <div class="sidebar-topo" :class="{ 'sidebar-topo--rail': recolhida && !mobile }">
      <img
        v-if="!recolhida || mobile"
        :src="logoSrc"
        alt="Cicluz Gestão Profissional"
        class="sidebar-logo"
      />
      <img v-else src="/marca/cicluz-simbolo.png" alt="Cicluz" class="sidebar-simbolo" />
      <v-btn
        v-if="!mobile"
        :icon="recolhida ? 'mdi-chevron-right' : 'mdi-chevron-left'"
        variant="text"
        size="small"
        :aria-label="recolhida ? 'Expandir menu' : 'Recolher menu'"
        @click="recolhida = !recolhida"
      />
      <v-btn
        v-else
        icon="mdi-close"
        variant="text"
        size="small"
        aria-label="Fechar menu"
        @click="aberto = false"
      />
    </div>

    <v-list
      nav
      density="comfortable"
      class="sidebar-grupos"
      :class="{ 'sidebar-grupos--rail': recolhida && !mobile }"
    >
      <v-list-item
        v-for="grupo in grupos"
        :key="grupo.id"
        :to="grupo.to"
        class="sidebar-grupo-item"
        :style="{ '--grupo-cor': grupo.cor }"
        @click="aoNavegar"
      >
        <template #prepend>
          <v-badge
            v-if="grupo.id === 'pendencias' && totalPendencias > 0"
            :content="totalPendencias"
            color="error"
            floating
          >
            <v-icon :icon="grupo.icone" size="20" class="grupo-icone" />
          </v-badge>
          <v-icon v-else :icon="grupo.icone" size="20" class="grupo-icone" />
        </template>
        <v-list-item-title v-if="!recolhida || mobile" class="grupo-label">{{
          grupo.label
        }}</v-list-item-title>
        <template v-if="!recolhida || mobile" #append>
          <v-icon icon="mdi-chevron-right" size="16" class="grupo-chevron" />
        </template>
      </v-list-item>
    </v-list>
  </v-navigation-drawer>
</template>

<style scoped>
.sidebar-topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-4) var(--cx-sp-3);
}

/* Símbolo (28px) + botão de recolher (~32px) lado a lado não cabem nos 76px do rail sem
   estourar/desalinhar (76 - 2*12 de padding = 52px úteis) — empilha e centraliza os dois em vez
   de forçar `space-between` numa largura que não comporta ambos numa linha só. */
.sidebar-topo--rail {
  flex-direction: column;
  justify-content: center;
  gap: var(--cx-sp-2);
}

.sidebar-logo {
  height: 30px;
  width: auto;
}

.sidebar-simbolo {
  height: 32px;
  width: 32px;
  object-fit: contain;
}

.sidebar-grupos {
  padding: 0 var(--cx-sp-2);
}

.sidebar-grupo-item {
  margin-bottom: var(--cx-sp-1);
  border-radius: var(--cx-r-md);
}

/* `v-list-item` renderiza como `display:grid` com colunas em px fixo (prepend/content/append) —
   o item encolhe pro tamanho do conteúdo em vez de ocupar a linha toda, então `justify-content`
   sozinho não tem espaço sobrando pra centralizar nada. E dentro do prepend (52px) o ícone fica
   colado à esquerda porque o `.v-list-item__spacer` do Vuetify (reservado pra separar ícone de
   texto) continua ocupando o resto da coluna mesmo sem rótulo nenhum. Solução: troca pra flex,
   esconde o conteúdo/spacer vazios (só sobra o ícone) e força o item a ocupar a largura toda do
   rail pra centralizar de verdade — mesmo eixo do botão "+" acima. */
.sidebar-grupos--rail :deep(.v-list-item) {
  display: flex !important;
  width: 100%;
  justify-content: center;
  padding-inline: 0;
}

.sidebar-grupos--rail :deep(.v-list-item__content),
.sidebar-grupos--rail :deep(.v-list-item__spacer) {
  display: none;
}

.sidebar-grupos--rail :deep(.v-list-item__prepend) {
  margin-inline-end: 0;
  width: auto;
}

.grupo-icone {
  color: var(--grupo-cor);
}

.grupo-label {
  font-size: var(--cx-fs-caption);
  font-weight: 700;
  letter-spacing: var(--cx-tracking-wide);
  text-transform: uppercase;
}

.grupo-chevron {
  opacity: 0.5;
}
</style>
