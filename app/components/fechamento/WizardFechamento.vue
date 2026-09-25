<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useFechamentoForm } from '~/composables/useFechamentoForm';
import { useFechamentos } from '~/composables/useFechamentos';
import { useSessaoCaixa } from '~/composables/useSessaoCaixa';
import { useTransferenciasTesouraria } from '~/composables/useTransferenciasTesouraria';
import { useAnexos } from '~/composables/useAnexos';
import SecaoIdentificacao from '~/components/fechamento/SecaoIdentificacao.vue';
import SecaoTransferencias from '~/components/fechamento/SecaoTransferencias.vue';
import SecaoLancamentos from '~/components/fechamento/SecaoLancamentos.vue';
import SecaoRelatorios from '~/components/fechamento/SecaoRelatorios.vue';
import SecaoRelatorioFinal from '~/components/fechamento/SecaoRelatorioFinal.vue';
import AppCabecalhoTela from '~/components/app/AppCabecalhoTela.vue';
import EtapasWizard from '~/components/fechamento/EtapasWizard.vue';

defineProps<{ titulo: string }>();

const {
  draft,
  secaoAtual,
  totalSecoes,
  progressoPct,
  progressoLabel,
  mostrarVoltar,
  mostrarAvancar,
  mostrarSalvar,
  avancar,
  voltar,
  irPara,
} = useFechamentoForm();
const { salvar } = useFechamentos();
const { fecharSessao } = useSessaoCaixa();
const { criarRetornoAutomatico, criarSangriaAutomatica } = useTransferenciasTesouraria();
const { enviar: enviarAnexo } = useAnexos();
const router = useRouter();

const salvando = ref(false);
const erro = ref<string | null>(null);
const aviso = ref<string | null>(null);

const TITULOS_SECAO = [
  'Identificação',
  'Transferências',
  'Lançamentos',
  'Relatórios',
  'Relatório Final',
] as const;

const tituloSecao = computed(() => TITULOS_SECAO[secaoAtual.value - 1] ?? TITULOS_SECAO[0]);

async function onSalvar() {
  erro.value = null;
  aviso.value = null;
  salvando.value = true;
  try {
    const fechamentoId = await salvar(draft.value);
    const arquivosPendentes = draft.value.arquivosPendentes ?? {};
    const camposCaminho: Record<
      'img-manha' | 'img-tarde' | 'img-folha-fechamento' | 'img-pdv',
      'imgManhaPath' | 'imgTardePath' | 'imgFolhaFechamentoPath' | 'imgPdvPath'
    > = {
      'img-manha': 'imgManhaPath',
      'img-tarde': 'imgTardePath',
      'img-folha-fechamento': 'imgFolhaFechamentoPath',
      'img-pdv': 'imgPdvPath',
    };
    let houveUploadPendente = false;
    // 25/09/2026 (bug real em produção): um anexo pendente que falhe ao enviar (rede instável,
    // foto grande, etc.) NÃO PODE travar o fechamento — ele já foi salvo pelo `salvar()` acima.
    // Antes, um erro aqui pulava pro catch geral e o usuário via "não salvou" mesmo com os dados
    // já gravados, e a sessão nunca fechava (ficava ABERTA pra sempre, travando o caixa do dia).
    // Agora: cada anexo que falhar fica pendente pra uma nova tentativa (mensagem no aviso), mas o
    // fechamento inteiro segue seu fluxo normal — fechar a sessão nunca fica refém de uma foto.
    const falhasAnexos: string[] = [];
    for (const [chave, arquivo] of Object.entries(arquivosPendentes) as [string, File][]) {
      let path: string;
      try {
        path = await enviarAnexo(fechamentoId, chave, arquivo);
      } catch (e) {
        falhasAnexos.push(chave);
        console.error(`[fechamento] falha ao enviar anexo "${chave}":`, e);
        continue;
      }
      // Chaves fixas (maquininha) vão direto pro draft; chaves de lançamento
      // (`lancamento-foto[-nota]-{id}`, ver SecaoLancamentos.vue) precisam achar o lançamento certo
      // na lista, já que pode haver vários no mesmo fechamento.
      if (
        chave === 'img-manha' ||
        chave === 'img-tarde' ||
        chave === 'img-folha-fechamento' ||
        chave === 'img-pdv'
      ) {
        draft.value[camposCaminho[chave]] = path;
      } else {
        const semSufixoNota = chave.startsWith('lancamento-foto-nota-');
        const semSufixoFoto = !semSufixoNota && chave.startsWith('lancamento-foto-');
        if (semSufixoNota || semSufixoFoto) {
          const lancamentoId = chave.slice(
            semSufixoNota ? 'lancamento-foto-nota-'.length : 'lancamento-foto-'.length,
          );
          const lancamento = draft.value.lancamentos.find((l) => l.id === lancamentoId);
          if (lancamento) {
            if (semSufixoNota) lancamento.fotoNotaPath = path;
            else lancamento.fotoPath = path;
          }
        }
        const prefixoAudioLancamento = 'audio-lancamento-obs-';
        if (chave.startsWith(prefixoAudioLancamento)) {
          const lancamentoId = chave.slice(prefixoAudioLancamento.length);
          const lancamento = draft.value.lancamentos.find((l) => l.id === lancamentoId);
          if (lancamento) lancamento.obsAudioPath = path;
        }
        const prefixoAudioMotivo = 'audio-vendas-canceladas-motivo-';
        if (chave.startsWith(prefixoAudioMotivo)) {
          const itemId = chave.slice(prefixoAudioMotivo.length);
          const motivo = draft.value.vendasCanceladasMotivos[itemId];
          if (motivo) motivo.audioPath = path;
        }
        const prefixoCrediario = 'cred-cupom-';
        if (chave.startsWith(prefixoCrediario)) {
          const indice = Number(chave.slice(prefixoCrediario.length));
          const item = draft.value.crediario[indice];
          if (item) item.fotoPath = path;
        }
      }
      Reflect.deleteProperty(arquivosPendentes, chave);
      houveUploadPendente = true;
    }
    if (houveUploadPendente) await salvar(draft.value);
    // Fluxo de Caixa (18/09/2026): fechamento salvo com sucesso é o único gatilho que fecha a
    // sessão — se isto falhar depois do salvar_fechamento já ter comitado, o fechamento já está
    // gravado (não se perde), só a sessão fica ABERTA até uma nova tentativa/ação admin.
    if (draft.value.cashSessionId) {
      await fecharSessao(draft.value.cashSessionId, fechamentoId);
    }
    // Retorno automático pro cofre (18/09/2026, pedido do usuário — versão simplificada do que o
    // Sistema Inteligente Pralís faz): melhor esforço, depois do fechamento já salvo — uma falha
    // aqui não desfaz o salvamento, só deixa de gerar o retorno automático desta vez.
    const falhasPosFechamento: string[] = [];
    if (falhasAnexos.length === 1) falhasPosFechamento.push('1 anexo (foto/áudio)');
    else if (falhasAnexos.length > 1) falhasPosFechamento.push(`${falhasAnexos.length} anexos (foto/áudio)`);
    if (draft.value.caixa && draft.value.dinheiroContadoCents > 0) {
      try {
        await criarRetornoAutomatico({
          fechamentoId,
          caixa: draft.value.caixa,
          codigo: draft.value.codigo,
          valorCents: draft.value.dinheiroContadoCents,
          valorNotasCents: draft.value.dinheiroContadoNotasCents,
          valorMoedasCents: draft.value.dinheiroContadoMoedasCents,
          lacre: draft.value.lacreFechamento,
        });
      } catch (e) {
        falhasPosFechamento.push('o retorno automatico para o Cofre Fluxo');
        // O fechamento já foi salvo, mas o retorno precisa ficar visível para
        // permitir uma conferência/repetição posterior sem esconder a falha.
        console.error('[fechamento] falha ao criar retorno automático:', e);
      }
    }
    // Sangria automática pro Fluxo (23/09/2026, pedido do usuário — correção de conceito: "Fluxo
    // é tudo o que sobe dos caixas: sangrias e o valor total ao fechar o caixa"). Mesmo espírito
    // de melhor esforço do retorno automático acima.
    const totalSangriasCents = draft.value.sangrias.reduce((soma, s) => soma + s.valorCents, 0);
    if (draft.value.caixa && totalSangriasCents > 0) {
      try {
        await criarSangriaAutomatica({
          fechamentoId,
          caixa: draft.value.caixa,
          codigo: draft.value.codigo,
          valorCents: totalSangriasCents,
        });
      } catch (e) {
        falhasPosFechamento.push('a sangria automatica para o Cofre Fluxo');
        console.error('[fechamento] falha ao criar sangria automática:', e);
      }
    }
    if (falhasPosFechamento.length) {
      aviso.value = `Fechamento salvo, mas ${falhasPosFechamento.join(' e ')} nao foi registrado. Verifique sua conexao e clique em Salvar novamente para tentar de novo.`;
      return;
    }
    await router.push('/');
  } catch (e) {
    erro.value = e instanceof Error ? e.message : 'Não foi possível salvar o fechamento.';
  } finally {
    salvando.value = false;
  }
}
</script>

<template>
  <v-container class="py-6" style="max-width: 900px">
    <AppCabecalhoTela :titulo="titulo" />

    <!-- <900px: barra de progresso + pontos (comportamento original, já testado em 390px).
         >=900px: some daqui e a EtapasWizard assume — ver <style>. -->
    <v-progress-linear
      :model-value="progressoPct"
      color="primary"
      height="6"
      rounded
      class="mb-2 progresso-mobile"
    />
    <div class="d-flex justify-space-between align-center mb-5 progresso-mobile">
      <span class="text-caption text-medium-emphasis">{{ progressoLabel }}</span>
      <div class="d-flex ga-1">
        <span
          v-for="n in totalSecoes"
          :key="n"
          :style="{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background:
              n === secaoAtual
                ? 'rgb(var(--v-theme-primary))'
                : 'rgb(var(--v-theme-surface-variant))',
            display: 'inline-block',
          }"
        />
      </div>
    </div>

    <div class="wizard-corpo">
      <aside class="wizard-lateral">
        <EtapasWizard :etapas="TITULOS_SECAO" :etapa-atual="secaoAtual" @ir-para="irPara" />
      </aside>

      <div class="wizard-conteudo">
        <v-card class="pa-5 mb-5" rounded="lg" variant="outlined">
          <h2 class="text-subtitle-1 mb-4">{{ tituloSecao }}</h2>

          <SecaoIdentificacao v-if="secaoAtual === 1" :draft="draft" />
          <SecaoTransferencias v-else-if="secaoAtual === 2" :draft="draft" />
          <SecaoLancamentos v-else-if="secaoAtual === 3" :draft="draft" />
          <SecaoRelatorios v-else-if="secaoAtual === 4" :draft="draft" />
          <SecaoRelatorioFinal v-else-if="secaoAtual === 5" :draft="draft" />
        </v-card>

        <v-alert
          v-if="erro"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-4"
          role="alert"
          aria-live="assertive"
          >{{ erro }}</v-alert
        >
        <v-alert
          v-if="aviso"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-4"
          role="status"
          aria-live="polite"
          >{{ aviso }}</v-alert
        >

        <p
          v-if="mostrarSalvar && !draft.dinheiroContadoConfirmado"
          class="text-caption text-medium-emphasis text-right mb-2"
        >
          Confirme a "Transferência Final" (Notas/Moedas/Lacre) no fim do Relatório Final pra
          liberar o Salvar.
        </p>
        <div class="d-flex justify-space-between">
          <v-btn v-if="mostrarVoltar" variant="text" @click="voltar">Voltar</v-btn>
          <v-spacer />
          <v-btn v-if="mostrarAvancar" color="primary" @click="avancar">Avançar</v-btn>
          <v-btn
            v-if="mostrarSalvar"
            color="primary"
            :loading="salvando"
            :disabled="!draft.dinheiroContadoConfirmado"
            @click="onSalvar"
            >Salvar</v-btn
          >
        </div>
      </div>
    </div>
  </v-container>
</template>

<style scoped>
.wizard-lateral {
  display: none;
}

@media (width >= 900px) {
  /* !important: a div do rótulo+pontos também tem `d-flex` do Vuetify, que já é
     `display: flex !important` — sem isto o utilitário vencia o display:none. */
  .progresso-mobile {
    display: none !important;
  }
  .wizard-corpo {
    display: flex;
    align-items: flex-start;
    gap: var(--cx-sp-6);
  }
  .wizard-lateral {
    display: block;
    flex: 0 0 220px;
    /* Acompanha a rolagem da tela dentro da área visível — útil num formulário longo,
       sem exigir posição fixa que colidiria com o cabeçalho em telas baixas. */
    position: sticky;
    top: var(--cx-sp-6);
  }
  .wizard-conteudo {
    flex: 1 1 auto;
    min-width: 0;
  }
}
</style>
