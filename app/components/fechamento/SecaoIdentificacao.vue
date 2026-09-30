<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { CAIXAS, TURNOS, type Caixa, type FechamentoDraft, type Turno } from '~/types/fechamento';
import { useVendasCanceladas } from '~/composables/useVendasCanceladas';
import { useVendasFechamento } from '~/composables/useVendasFechamento';
import { useSincronizarVendas } from '~/composables/useSincronizarVendas';
import { formatCents, toCents } from '~/utils/financeiro';
import { caixaParaNumero, formatarDataBr, turnoParaLetra } from '~/utils/vendasFechamento';

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
// NÃO entra no cálculo do fechamento (mudança pedida pelo usuário, 30/09/2026): esta busca é só
// leitura/conferência — nunca preenche o Relatório PDV (passo 4) nem lança nada automaticamente.
// O total aqui é exibido aqui mesmo e comparado lado a lado com o Relatório de Maquininhas no
// Relatório Final (passo 5, ver aoAbrirComparacaoVendas em SecaoRelatorioFinal.vue). O fechamento
// fecha com exatamente os mesmos números de quando ninguém aperta este botão — quem preenche o
// Relatório PDV continua sendo só o "Buscar vendas do dia"/digitação manual de SecaoRelatorios.vue.
const dataVendas = ref(props.draft.data);
const { erro, resumo, buscarPorData } = useVendasFechamento();
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

// "Sincronizar vendas agora" (pedido do usuário, 17/09/2026): puxa a planilha na hora, sem
// esperar o cron automático (1x/dia, de madrugada — ver server/utils/sincronizarPlanilha.ts).
// ATENÇÃO, real: isto NUNCA traz vendas de HOJE enquanto a loja ainda está aberta — o bot da loja
// só escreve na planilha à noite (22h10). Isto só evita esperar até o cron da manhã SEGUINTE
// depois que o bot já rodou — não é tempo real durante o dia (a mensagem abaixo do botão deixa
// isso explícito, pra não parecer que "sincronizar" traz venda que ainda nem existe na origem).
//
// 28/09/2026 (bug real em produção): o cron automático da Vercel simplesmente não disparou por 2
// dias seguidos — sem nenhum aviso, "Buscar vendas" voltava vazio porque só lê o que já está
// sincronizado, nunca puxa a planilha sozinho. `useSincronizarVendas` (compartilhado com
// SecaoRelatorios.vue) agora é chamado ANTES de ler, aqui e no botão separado, tirando a
// dependência de alguém lembrar de clicar em dois botões — e do cron precisar funcionar sozinho.
const {
  sincronizando,
  erro: sincronizacaoErro,
  resultado: sincronizacaoResultado,
  sincronizar: sincronizarSilenciosamente,
} = useSincronizarVendas();

const filtroBusca = computed(() => ({
  caixa: caixaParaNumero(props.draft.caixa),
  turno: turnoParaLetra(props.draft.turno),
  horaInicio: filtrarPorHorario.value ? horaDoCampo(horaInicio.value) : null,
  horaFim: filtrarPorHorario.value ? horaDoCampo(horaFim.value) : null,
}));

// 28/09/2026 (pedido do usuário: botões devem poder ser apertados separadamente): cada botão tem
// seu PRÓPRIO estado de "ocupado" — `sincronizando` (compartilhado, de useSincronizarVendas) só
// entra no TEXTO do botão que de fato está esperando, nunca no loading/disabled dos outros dois.
const ocupadoBuscarVendas = ref(false);
async function buscarVendas() {
  jaBuscou.value = true;
  ocupadoBuscarVendas.value = true;
  try {
    await buscarPorData(dataVendas.value, filtroBusca.value);
  } finally {
    ocupadoBuscarVendas.value = false;
  }
}

// O robô local envia CREARE -> API -> Supabase a cada minuto. Depois que o operador faz a
// primeira busca, esta tela só relê o Supabase a cada 60s: não relê a planilha nem disputa com o
// robô. Assim os números reais novos aparecem no próprio fechamento sem apertar o botão de novo.
let atualizacaoAutomatica: ReturnType<typeof setInterval> | undefined;
let atualizandoAutomaticamente = false;
async function atualizarVendasAutomaticamente(): Promise<void> {
  if (
    !jaBuscou.value ||
    atualizandoAutomaticamente ||
    ocupadoBuscarVendas.value ||
    ocupadoCanceladas.value
  )
    return;
  atualizandoAutomaticamente = true;
  try {
    await buscarPorData(dataVendas.value, filtroBusca.value);
    if (jaBuscouCanceladas.value) await buscarVendasCanceladasBase(dataVendas.value);
  } finally {
    atualizandoAutomaticamente = false;
  }
}

onMounted(() => {
  atualizacaoAutomatica = setInterval(() => {
    void atualizarVendasAutomaticamente();
  }, 60_000);
});

onBeforeUnmount(() => {
  if (atualizacaoAutomatica) clearInterval(atualizacaoAutomatica);
});

/** Botão "Sincronizar vendas agora" — mesma sincronização, só que sem ler depois (o usuário só
 * quer empurrar a planilha pro banco, não necessariamente re-buscar o filtro atual). */
const ocupadoSincronizarAgora = ref(false);
async function sincronizarAgora() {
  ocupadoSincronizarAgora.value = true;
  try {
    await sincronizarSilenciosamente();
    // Re-busca automaticamente pro filtro atual, pra já mostrar se algo novo chegou.
    if (jaBuscou.value) await buscarPorData(dataVendas.value, filtroBusca.value);
  } finally {
    ocupadoSincronizarAgora.value = false;
  }
}

// Vendas canceladas (pedido do usuário, 23/09/2026, ligado de vez em 24/09/2026): mesmo botão
// espelhado de "Buscar vendas" — o robô já manda os itens cancelados (tipo='C' em
// vendas_produto_dia), ver useVendasCanceladas.ts.
const {
  erro: erroCanceladas,
  itens: vendasCanceladas,
  buscarPorData: buscarVendasCanceladasBase,
} = useVendasCanceladas();
const jaBuscouCanceladas = ref(false);
const ocupadoCanceladas = ref(false);
async function buscarVendasCanceladas() {
  jaBuscouCanceladas.value = true;
  ocupadoCanceladas.value = true;
  try {
    await buscarVendasCanceladasBase(dataVendas.value);
  } finally {
    ocupadoCanceladas.value = false;
  }
}
function formatarQtd(qtd: number): string {
  return qtd.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}
/** "13:34:27" -> "13:34" (só exibição, sem fuso — igual o horário que o CREARE já registra). */
function formatarHora(hora: string | null): string {
  return hora ? hora.slice(0, 5) : '';
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

// Colaboradores/Alimentação/Furto-Roubo/Sócios/Sobra-Perda: o CREARE já manda esses valores (ver
// types/vendasFechamento.ts ResumoVendasDia.ajustes) — puramente informativo (mudança 30/09/2026:
// voltou a não lançar nada sozinho), só pra você decidir se lança manualmente no passo 3.
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
        :readonly="!!draft.cashSessionId"
      />
    </div>
    <div class="d-flex flex-column flex-sm-row ga-3">
      <v-select
        v-model="turnoModel"
        :items="[...TURNOS]"
        label="Turno"
        placeholder="Selecione..."
        :readonly="!!draft.cashSessionId"
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
      <v-text-field v-model="dataVendas" label="Data das vendas" type="date" readonly />

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

      <div class="d-flex flex-wrap ga-2 align-center">
        <v-btn
          color="primary"
          variant="tonal"
          :loading="ocupadoBuscarVendas"
          :disabled="ocupadoBuscarVendas || !dataVendas"
          @click="buscarVendas"
        >
          {{
            !ocupadoBuscarVendas
              ? 'Buscar vendas'
              : sincronizando
                ? 'Sincronizando...'
                : 'Buscando vendas...'
          }}
        </v-btn>
        <v-btn
          variant="text"
          size="small"
          prepend-icon="mdi-cloud-sync-outline"
          :loading="ocupadoSincronizarAgora"
          :disabled="ocupadoSincronizarAgora"
          @click="sincronizarAgora"
        >
          {{ ocupadoSincronizarAgora ? 'Sincronizando...' : 'Sincronizar vendas agora' }}
        </v-btn>
        <v-btn
          variant="outlined"
          size="small"
          prepend-icon="mdi-cancel"
          :loading="ocupadoCanceladas"
          :disabled="ocupadoCanceladas || !dataVendas"
          @click="buscarVendasCanceladas"
        >
          {{
            !ocupadoCanceladas
              ? 'Buscar vendas canceladas'
              : sincronizando
                ? 'Sincronizando...'
                : 'Buscando...'
          }}
        </v-btn>
      </div>

      <template v-if="jaBuscouCanceladas && !ocupadoCanceladas">
        <v-alert v-if="erroCanceladas" type="error" variant="tonal" density="comfortable">
          {{ erroCanceladas }}
        </v-alert>
        <v-alert
          v-else-if="!vendasCanceladas.length"
          type="info"
          variant="tonal"
          density="comfortable"
        >
          Nenhuma venda cancelada para {{ formatarDataBr(dataVendas) }}.
        </v-alert>
        <v-alert v-else type="warning" variant="tonal" density="comfortable">
          <div>
            {{ vendasCanceladas.length }} venda{{
              vendasCanceladas.length === 1 ? '' : 's'
            }}
            cancelada{{ vendasCanceladas.length === 1 ? '' : 's' }} em
            {{ formatarDataBr(dataVendas) }}.
          </div>
          <ul class="text-caption mt-2 pl-4">
            <li
              v-for="(item, i) in vendasCanceladas"
              :key="`${item.produto}-${i}`"
              class="d-flex justify-space-between ga-2"
            >
              <span>
                <span v-if="item.vendaCreareId" class="d-block text-caption font-weight-bold">
                  Venda CREARE: {{ item.vendaCreareId }}
                </span>
                {{ item.produto }} ({{ formatarQtd(item.quantidade) }})
                <template v-if="item.horaVenda"> — {{ formatarHora(item.horaVenda) }}</template>
              </span>
              <strong class="text-no-wrap">R$ {{ formatCents(item.totalCents) }}</strong>
            </li>
          </ul>
          <div class="text-caption mt-2 font-weight-bold">
            Motivo e exportação (PDF/WhatsApp) em "Vendas/Produtos Cancelados" no Relatório Final
            (passo 5).
          </div>
        </v-alert>
      </template>
      <p class="text-caption text-medium-emphasis mt-n2">
        Puxa a planilha do bot na hora, sem esperar o sync automático de madrugada — mas só traz o
        que o bot da loja já escreveu lá. Vendas de HOJE só aparecem depois que o bot rodar hoje à
        noite (22h10), mesmo sincronizando agora.
      </p>
      <v-alert v-if="sincronizacaoErro" type="error" variant="tonal" density="comfortable">
        {{ sincronizacaoErro }}
      </v-alert>
      <v-alert v-else-if="sincronizacaoResultado" type="info" variant="tonal" density="comfortable">
        Planilha relida: {{ sincronizacaoResultado.gravadasFechamento }} linha(s) de fechamento e
        {{ sincronizacaoResultado.gravadasProdutos }} de produto gravadas (reenviar não duplica).
      </v-alert>

      <template v-if="jaBuscou && !ocupadoBuscarVendas">
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
            Só pra conferência — não altera o Relatório PDV nem o cálculo do fechamento. Veja a
            comparação lado a lado com o Relatório de Maquininhas no Relatório Final (passo 5).
          </div>
        </v-alert>

        <v-alert
          v-if="ajustesPresentes.length"
          type="success"
          variant="tonal"
          density="comfortable"
        >
          <div class="text-caption font-weight-bold">
            O CREARE também registrou estes ajustes neste dia (só pra conferência — não são
            lançados automaticamente; lance manualmente no passo 3 se quiser considerá-los):
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
