<script setup lang="ts">
import { computed, ref } from 'vue';
import { CAIXAS, TURNOS, type Caixa, type FechamentoDraft, type Turno } from '~/types/fechamento';
import { useVendasFechamento } from '~/composables/useVendasFechamento';
import { formatCents, toCents } from '~/utils/financeiro';
import {
  aplicarResumoAoPrimeiroPdv,
  caixaParaNumero,
  formatarDataBr,
  turnoParaLetra,
} from '~/utils/vendasFechamento';

const props = defineProps<{ draft: FechamentoDraft }>();

// v-select tipa o modelo pelos `items` (sem ''); o rascunho usa '' como "não selecionado"
// (mesmo sentido do <option value=""> atual) — os computeds só fazem essa ponte de tipos.
const caixaModel = computed<Caixa | null>({
  get: () => (props.draft.caixa || null) as Caixa | null,
  set: (v) => {
    props.draft.caixa = v ?? '';
  },
});
const turnoModel = computed<Turno | null>({
  get: () => (props.draft.turno || null) as Turno | null,
  set: (v) => {
    props.draft.turno = v ?? '';
  },
});

// Busca de vendas: lê o que o bot local (ver integracoes-scripts/README.md) já sincronizou no
// Supabase. Data independente de `draft.data` (que é sempre hoje e readonly): o usuário pode
// consultar qualquer data com dados sincronizados, não só o dia corrente.
//
// Filtra por caixa/turno (pedido do usuário): o bot já grava caixa/turno separados por linha
// (extraídos do operador, ex. "VND CAIXA PDV - 1M" -> caixa "1", turno "M"), então dá pra buscar
// só o caixa deste fechamento em vez de somar a loja inteira — o que também é o certo pro cálculo:
// um fechamento é de UM caixa, não da loja toda. Sem caixa selecionado ainda, busca todos juntos
// (comportamento anterior, como fallback).
//
// Já conta pro cálculo do fechamento (pedido do usuário): toda busca com resultado preenche o
// primeiro PDV do Relatório PDV (passo 4) — mesmo destino/helper do botão "Buscar vendas do dia"
// de lá. PDVs extras adicionados manualmente não são tocados.
const dataVendas = ref(props.draft.data);
const { carregando, erro, resumo, buscarPorData } = useVendasFechamento();
const jaBuscou = ref(false);

// Filtro por horário (pedido do usuário): o bot passou a sincronizar por hora cheia da venda,
// não só por turno inteiro (ver FECHAMENTO_CAIXA.sql v6) — então dá pra restringir ainda mais a
// busca a um intervalo, ex. "Caixa 1 das 8h às 12h". Granularidade de hora cheia só: os campos
// são <input type="time"> por familiaridade, mas só a HORA é usada (minutos são ignorados).
//
// `filtrarPorHorario` (interruptor, começa desligado) é o que DECIDE se o filtro vale — não
// "os campos estão vazios ou não". Bug real: um clique sem querer num <input type="time"> já
// preenche "00:00" sozinho (comportamento nativo do navegador, não precisa de seleção
// deliberada) — se a decisão dependesse só do valor do campo, isso virava um filtro fantasma
// "só a meia-noite", que não bate com nenhuma venda e faz a busca inteira parecer vazia sem
// nenhum aviso do porquê. Com o interruptor, os campos só contam quando o usuário liga de
// propósito.
const filtrarPorHorario = ref(false);
const horaInicio = ref('00:00');
const horaFim = ref('23:00');

function horaDoCampo(valor: string): number | null {
  const hora = parseInt(valor.split(':')[0] ?? '', 10);
  return Number.isFinite(hora) ? hora : null;
}

const rotuloFiltro = computed(() => {
  const partes = [props.draft.caixa, props.draft.turno].filter(Boolean);
  const base = partes.length ? partes.join(' - ') : 'todos os caixas';
  if (!filtrarPorHorario.value) return base;
  const hi = horaDoCampo(horaInicio.value);
  const hf = horaDoCampo(horaFim.value);
  const rotuloHora = `${hi !== null ? String(hi).padStart(2, '0') + 'h' : 'início'} às ${hf !== null ? String(hf).padStart(2, '0') + 'h' : 'fim'}`;
  return `${base}, ${rotuloHora}`;
});

async function buscarVendas() {
  jaBuscou.value = true;
  const resultado = await buscarPorData(dataVendas.value, {
    caixa: caixaParaNumero(props.draft.caixa),
    turno: turnoParaLetra(props.draft.turno),
    horaInicio: filtrarPorHorario.value ? horaDoCampo(horaInicio.value) : null,
    horaFim: filtrarPorHorario.value ? horaDoCampo(horaFim.value) : null,
  });
  if (!resultado || resultado.registros === 0) return;
  aplicarResumoAoPrimeiroPdv(props.draft, resultado);
}

const formasPagamento = computed(() => {
  if (!resumo.value) return [];
  const { dinheiro, credito, debito, pix, voucher, crediario, outros } = resumo.value.porForma;
  return [
    ['Dinheiro', dinheiro],
    ['Crédito', credito],
    ['Débito', debito],
    ['Pix', pix],
    ['Voucher', voucher],
    ['Crediário', crediario],
    ['Outros', outros],
  ].filter(([, valor]) => Math.abs(Number(valor)) >= 0.005) as [string, number][];
});

// Colaboradores/Alimentação/Furto-Roubo/Sócios/Sobra-Perda: o CREARE já manda esses valores, mas
// até agora nenhuma tela mostrava (ver types/vendasFechamento.ts ResumoVendasDia.ajustes) — puro
// informativo, não entra em nenhuma conta. Fica visível pra você decidir se vale lançar como
// despesa/mercadoria manualmente (passo 3) quando aparecer algo aqui.
const ajustesPresentes = computed(() => {
  if (!resumo.value) return [];
  const { colaboradores, alimentacao, rouboFurto, socios, sobraPerda } = resumo.value.ajustes;
  return [
    ['Colaboradores', colaboradores],
    ['Alimentação', alimentacao],
    ['Furto/Roubo', rouboFurto],
    ['Sócios', socios],
    ['Sobra/Perda', sobraPerda],
  ].filter(([, valor]) => Math.abs(Number(valor)) >= 0.005) as [string, number][];
});
</script>

<template>
  <div class="d-flex flex-column ga-4">
    <div class="d-flex flex-column flex-sm-row ga-3">
      <v-text-field :model-value="draft.data" label="Data" type="date" readonly />
      <v-select
        v-model="caixaModel"
        :items="[...CAIXAS]"
        label="Caixa"
        placeholder="Selecione..."
      />
    </div>
    <div class="d-flex flex-column flex-sm-row ga-3">
      <v-select
        v-model="turnoModel"
        :items="[...TURNOS]"
        label="Turno"
        placeholder="Selecione..."
      />
      <v-text-field
        v-model="draft.responsavel"
        label="Responsável"
        placeholder="Nome do responsável"
      />
    </div>

    <v-divider />

    <div class="d-flex flex-column ga-3">
      <div class="text-subtitle-2 text-medium-emphasis">Vendas do dia</div>
      <v-text-field v-model="dataVendas" label="Data das vendas" type="date" />

      <v-switch
        v-model="filtrarPorHorario"
        label="Filtrar por horário"
        color="primary"
        density="comfortable"
        hide-details
        class="flex-grow-0"
      />
      <template v-if="filtrarPorHorario">
        <div class="d-flex flex-column flex-sm-row ga-3">
          <v-text-field v-model="horaInicio" label="Horário de" type="time" />
          <v-text-field v-model="horaFim" label="Horário até" type="time" />
        </div>
        <p class="text-caption text-medium-emphasis mt-n2">
          Filtra por hora cheia — os minutos são ignorados.
        </p>
      </template>

      <v-btn
        color="primary"
        variant="tonal"
        :loading="carregando"
        :disabled="carregando || !dataVendas"
        class="align-self-start"
        @click="buscarVendas"
      >
        {{ carregando ? 'Buscando vendas...' : 'Buscar vendas' }}
      </v-btn>

      <template v-if="jaBuscou && !carregando">
        <v-alert v-if="erro" type="error" variant="tonal" density="comfortable">
          {{ erro }}
        </v-alert>

        <v-alert
          v-else-if="resumo && resumo.registros === 0"
          type="info"
          variant="tonal"
          density="comfortable"
        >
          Nenhuma venda sincronizada para {{ rotuloFiltro }} em {{ formatarDataBr(resumo.data) }}.
          Se a loja esteve aberta nesse dia, verifique se o bot está rodando (ver
          integracoes-scripts/README.md).
        </v-alert>

        <v-alert v-else-if="resumo" type="success" variant="tonal" density="comfortable">
          <div>
            {{ resumo.numeroVendas }} venda{{ resumo.numeroVendas === 1 ? '' : 's' }} —
            {{ rotuloFiltro }} — em {{ formatarDataBr(resumo.data) }} — total R$
            {{ formatCents(toCents(resumo.totalPagamento)) }}.
          </div>
          <ul v-if="formasPagamento.length" class="text-caption mt-2 pl-4">
            <li v-for="[forma, valor] in formasPagamento" :key="forma">
              {{ forma }}: R$ {{ formatCents(toCents(valor)) }}
            </li>
          </ul>
          <div class="text-caption mt-2 font-weight-bold">
            Já preenchido no Relatório PDV (passo 4) — já entra no cálculo do fechamento.
          </div>
        </v-alert>

        <v-alert v-if="ajustesPresentes.length" type="warning" variant="tonal" density="comfortable">
          <div class="text-caption font-weight-bold">
            O CREARE também registrou estes ajustes — não entram em nenhum cálculo automático,
            avalie se vale lançar manualmente (passo 3):
          </div>
          <ul class="text-caption mt-1 pl-4">
            <li v-for="[nome, valor] in ajustesPresentes" :key="nome">
              {{ nome }}: R$ {{ formatCents(toCents(valor)) }}
            </li>
          </ul>
        </v-alert>
      </template>
    </div>
  </div>
</template>
