<script setup lang="ts">
// Menu lateral do app — visual portado da identidade Cicluz (mesma marca do Sistema Inteligente
// Pralís, ver assets/main.css). Diferente daquele projeto: aqui não existem páginas próprias de
// Resultados/Configuração — só o wizard de fechamento e as 3 telas de consulta por período. Por
// isso:
//   - "+ NOVO FECHAMENTO" vai direto pro formulário (pages/fechamentos/novo.vue).
//   - ENTRADAS/TRANSFERENCIAS/SAIDAS abrem as telas de consulta por data/horário
//     (pages/entradas.vue, transferencias.vue, saidas.vue).
//   - RESULTADOS aponta pro painel (é o mais perto que este app tem de "relatório geral").
//   - Sem grupo "Configuração"/"Geral": não têm destino real ainda, e o usuário pediu pra tirar
//     o estado desabilitado "Em breve" em vez de manter como placeholder.
import { computed, ref } from 'vue';
import { useSidebarMobile } from '~/composables/useSidebarMobile';

const recolhida = ref(false);

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
const grupos: GrupoNav[] = [
  { id: 'entradas', label: 'Entradas', to: '/entradas', icone: 'mdi-arrow-bottom-left-thick', cor: 'var(--cat-venda-base)' },
  {
    id: 'transferencias',
    label: 'Transferências',
    to: '/transferencias',
    icone: 'mdi-swap-horizontal-bold',
    cor: 'var(--cat-transferencias-base)',
  },
  { id: 'saidas', label: 'Saídas', to: '/saidas', icone: 'mdi-arrow-top-right-thick', cor: 'var(--cat-despesas-base)' },
  { id: 'resultados', label: 'Resultados', to: '/', icone: 'mdi-view-dashboard-outline', cor: 'var(--cat-resultado-base)' },
];
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
    <div class="sidebar-topo">
      <img
        v-if="!recolhida || mobile"
        src="/marca/logo-cicluz.png"
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

    <div class="sidebar-acao" :class="{ 'sidebar-acao--rail': recolhida && !mobile }">
      <v-btn
        v-if="!recolhida || mobile"
        to="/fechamentos/novo"
        color="primary"
        block
        class="sidebar-novo-btn"
        prepend-icon="mdi-plus"
        @click="aoNavegar"
      >
        NOVO FECHAMENTO
      </v-btn>
      <v-btn
        v-else
        to="/fechamentos/novo"
        color="primary"
        icon="mdi-plus"
        size="44"
        aria-label="Novo fechamento"
        @click="aoNavegar"
      />
    </div>

    <v-list nav density="comfortable" class="sidebar-grupos">
      <v-list-item
        v-for="grupo in grupos"
        :key="grupo.id"
        :to="grupo.to"
        class="sidebar-grupo-item"
        :style="{ '--grupo-cor': grupo.cor }"
        @click="aoNavegar"
      >
        <template #prepend>
          <v-icon :icon="grupo.icone" size="20" class="grupo-icone" />
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

.sidebar-logo {
  height: 30px;
  width: auto;
}

.sidebar-simbolo {
  height: 28px;
  width: 28px;
  object-fit: contain;
}

.sidebar-acao {
  padding: 0 var(--cx-sp-3) var(--cx-sp-3);
}

.sidebar-acao--rail {
  display: flex;
  justify-content: center;
}

.sidebar-novo-btn {
  font-weight: 700;
  letter-spacing: 0.02em;
}

.sidebar-grupos {
  padding: 0 var(--cx-sp-2);
}

.sidebar-grupo-item {
  margin-bottom: var(--cx-sp-1);
  border-radius: var(--cx-r-md);
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
