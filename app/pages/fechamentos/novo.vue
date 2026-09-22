<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useFechamentoForm } from '~/composables/useFechamentoForm';
import { usePerfil } from '~/composables/usePerfil';
import { useSessaoCaixa, type SessaoCaixa } from '~/composables/useSessaoCaixa';
import type { ContextoSessaoCaixa } from '~/types/fechamento';
import WizardFechamento from '~/components/fechamento/WizardFechamento.vue';

const router = useRouter();
const { novoFechamento } = useFechamentoForm();
const { isAdmin, carregar: carregarPerfil } = usePerfil();
const { sessaoAtual, carregarSessaoAtual } = useSessaoCaixa();

function contextoDe(sessao: SessaoCaixa): ContextoSessaoCaixa {
  return {
    id: sessao.id,
    caixa: sessao.caixa,
    turno: sessao.turno,
    businessDate: sessao.businessDate,
  };
}

// Reseta o draft já na primeira renderização (mesmo comportamento síncrono de sempre) usando o
// que já estiver em cache (`usePerfil`/`useSessaoCaixa` já rodaram no painel antes de chegar
// aqui) — evita mostrar, ainda que por um instante, o rascunho de uma edição anterior.
novoFechamento(sessaoAtual.value ? contextoDe(sessaoAtual.value) : undefined);

// Fluxo de Caixa (18/09/2026): uma conta CAIXA só chega aqui vinda do botão "Abrir Caixa"/
// "Continuar Fechamento" de `PainelCaixaOperacional.vue`, mas alguém pode digitar a URL direto
// sem sessão aberta (ou recarregar a página, perdendo o cache acima) — sem sessão, não tem
// caixa/turno/data pra travar na Seção 1, então volta pro painel. Admin continua podendo criar
// um fechamento direto, sem sessão (comportamento atual, sem mudança).
onMounted(async () => {
  await carregarPerfil();
  if (isAdmin.value) return;
  await carregarSessaoAtual();
  if (!sessaoAtual.value) {
    router.replace('/');
    return;
  }
  novoFechamento(contextoDe(sessaoAtual.value));
});
</script>

<template>
  <WizardFechamento titulo="Novo Fechamento" />
</template>
