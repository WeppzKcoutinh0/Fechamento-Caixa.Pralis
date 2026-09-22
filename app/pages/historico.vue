<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { CAIXAS, TURNOS, type Caixa, type Turno } from '~/types/fechamento';
import { useSupabase } from '~/composables/useSupabase';
import { useSessaoCaixa } from '~/composables/useSessaoCaixa';
import { formatCents, toCents } from '~/utils/financeiro';
import { formatarDataBr } from '~/utils/vendasFechamento';
import AppCabecalhoTela from '~/components/app/AppCabecalhoTela.vue';
import ConfirmacaoDialog from '~/components/comum/ConfirmacaoDialog.vue';

definePageMeta({ middleware: ['admin'] });

interface SessaoRow {
  id: string;
  caixa: string;
  turno: string;
  business_date: string;
  opened_at: string;
  opened_by: string;
  closed_at: string | null;
  status: 'ABERTO' | 'FECHADO';
  fechamento_id: string | null;
}
interface FechamentoResumoRow {
  id: string;
  codigo: string;
  valor_total_final: string;
  diferenca: string;
}

interface LinhaHistorico {
  sessaoId: string;
  caixa: string;
  turno: string;
  businessDate: string;
  openedAt: string;
  closedAt: string | null;
  status: 'ABERTO' | 'FECHADO';
  operadorNome: string;
  fechamentoId: string | null;
  fechamentoCodigo: string | null;
  valorTotalFinalCents: number | null;
  diferencaCents: number | null;
}

const router = useRouter();
const supabase = useSupabase();
const { encerrarSemFechamento } = useSessaoCaixa();

const carregando = ref(true);
const erro = ref<string | null>(null);
const linhas = ref<LinhaHistorico[]>([]);

const filtroData = ref('');
const filtroCaixa = ref<Caixa | null>(null);
const filtroTurno = ref<Turno | null>(null);
const filtroStatus = ref<'ABERTO' | 'FECHADO' | null>(null);

async function carregar(): Promise<void> {
  carregando.value = true;
  erro.value = null;
  try {
    const { data: sessoes, error: erroSessoes } = await supabase
      .from('cash_sessions')
      .select(
        'id, caixa, turno, business_date, opened_at, opened_by, closed_at, status, fechamento_id',
      )
      .order('opened_at', { ascending: false });
    if (erroSessoes) throw erroSessoes;

    const linhasSessoes = (sessoes ?? []) as SessaoRow[];

    const idsUsuarios = [...new Set(linhasSessoes.map((s) => s.opened_by))];
    const idsFechamentos = linhasSessoes
      .map((s) => s.fechamento_id)
      .filter((id): id is string => !!id);

    const [
      { data: perfis, error: erroPerfis },
      { data: fechamentosResumo, error: erroFechamentos },
    ] = await Promise.all([
      idsUsuarios.length
        ? supabase.from('profiles').select('user_id, nome').in('user_id', idsUsuarios)
        : Promise.resolve({ data: [], error: null }),
      idsFechamentos.length
        ? supabase
            .from('fechamentos')
            .select('id, codigo, valor_total_final, diferenca')
            .in('id', idsFechamentos)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (erroPerfis) throw erroPerfis;
    if (erroFechamentos) throw erroFechamentos;

    const nomePorUsuario = new Map(
      (perfis ?? []).map((p: { user_id: string; nome: string }) => [p.user_id, p.nome]),
    );
    const fechamentoPorId = new Map(
      ((fechamentosResumo ?? []) as FechamentoResumoRow[]).map((f) => [f.id, f]),
    );

    linhas.value = linhasSessoes.map((s) => {
      const fechamento = s.fechamento_id ? fechamentoPorId.get(s.fechamento_id) : undefined;
      return {
        sessaoId: s.id,
        caixa: s.caixa,
        turno: s.turno,
        businessDate: s.business_date,
        openedAt: s.opened_at,
        closedAt: s.closed_at,
        status: s.status,
        operadorNome: nomePorUsuario.get(s.opened_by) ?? '—',
        fechamentoId: s.fechamento_id,
        fechamentoCodigo: fechamento?.codigo ?? null,
        valorTotalFinalCents: fechamento ? toCents(fechamento.valor_total_final) : null,
        diferencaCents: fechamento ? toCents(fechamento.diferenca) : null,
      };
    });
  } catch (e) {
    erro.value = e instanceof Error ? e.message : 'Não foi possível carregar o histórico.';
  } finally {
    carregando.value = false;
  }
}
onMounted(carregar);

const filtradas = computed(() =>
  linhas.value.filter(
    (l) =>
      (!filtroData.value || l.businessDate === filtroData.value) &&
      (!filtroCaixa.value || l.caixa === filtroCaixa.value) &&
      (!filtroTurno.value || l.turno === filtroTurno.value) &&
      (!filtroStatus.value || l.status === filtroStatus.value),
  ),
);

function formatarHora(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function abrirFechamento(linha: LinhaHistorico): void {
  if (linha.fechamentoId) router.push(`/fechamentos/${linha.fechamentoId}/ver`);
}

const sessaoParaEncerrar = ref<LinhaHistorico | null>(null);

function pedirEncerrar(linha: LinhaHistorico): void {
  sessaoParaEncerrar.value = linha;
}
async function confirmarEncerrar(): Promise<void> {
  if (!sessaoParaEncerrar.value) return;
  const sessaoId = sessaoParaEncerrar.value.sessaoId;
  sessaoParaEncerrar.value = null;
  try {
    await encerrarSemFechamento(sessaoId);
    await carregar();
  } catch (e) {
    erro.value = e instanceof Error ? e.message : 'Não foi possível encerrar a sessão.';
  }
}
</script>

<template>
  <v-container class="py-6" style="max-width: 1100px">
    <AppCabecalhoTela titulo="Histórico de Caixa" />

    <div class="d-flex ga-3 mb-5 flex-wrap">
      <v-text-field
        v-model="filtroData"
        label="Data"
        type="date"
        density="comfortable"
        style="max-width: 180px"
        clearable
      />
      <v-select
        v-model="filtroCaixa"
        :items="[...CAIXAS]"
        label="Caixa"
        density="comfortable"
        style="max-width: 160px"
        clearable
      />
      <v-select
        v-model="filtroTurno"
        :items="[...TURNOS]"
        label="Turno"
        density="comfortable"
        style="max-width: 140px"
        clearable
      />
      <v-select
        v-model="filtroStatus"
        :items="['ABERTO', 'FECHADO']"
        label="Status"
        density="comfortable"
        style="max-width: 160px"
        clearable
      />
    </div>

    <v-alert v-if="erro" type="error" variant="tonal" class="mb-4">{{ erro }}</v-alert>

    <div v-if="carregando" class="d-flex justify-center py-10">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <v-alert v-else-if="filtradas.length === 0" type="info" variant="tonal">
      Nenhuma sessão de caixa encontrada.
    </v-alert>

    <div v-else class="d-flex flex-column ga-2">
      <v-card
        v-for="l in filtradas"
        :key="l.sessaoId"
        variant="outlined"
        rounded="lg"
        class="pa-4"
        :style="{ cursor: l.fechamentoId ? 'pointer' : 'default' }"
        @click="abrirFechamento(l)"
      >
        <div class="d-flex align-center flex-wrap ga-3">
          <v-chip
            :color="l.status === 'ABERTO' ? 'success' : 'default'"
            size="small"
            variant="tonal"
          >
            {{ l.status }}
          </v-chip>
          <strong>{{ l.caixa }} · {{ l.turno }}</strong>
          <span class="text-caption text-medium-emphasis">{{
            formatarDataBr(l.businessDate)
          }}</span>
          <span class="text-caption text-medium-emphasis"
            >Aberto {{ formatarHora(l.openedAt)
            }}<template v-if="l.closedAt"> · Fechado {{ formatarHora(l.closedAt) }}</template></span
          >
          <span class="text-caption text-medium-emphasis">{{ l.operadorNome }}</span>
          <v-spacer />
          <template v-if="l.fechamentoCodigo">
            <span class="text-caption">{{ l.fechamentoCodigo }}</span>
            <strong v-if="l.valorTotalFinalCents !== null"
              >R$ {{ formatCents(l.valorTotalFinalCents) }}</strong
            >
          </template>
          <v-chip v-else-if="l.status === 'ABERTO'" size="small" variant="text" color="warning"
            >Sem fechamento ainda</v-chip
          >
          <v-chip v-else size="small" variant="text">Encerrada sem fechamento</v-chip>
          <v-btn
            v-if="l.status === 'ABERTO'"
            size="small"
            variant="text"
            color="error"
            @click.stop="pedirEncerrar(l)"
          >
            Encerrar sem fechamento
          </v-btn>
        </div>
      </v-card>
    </div>

    <ConfirmacaoDialog
      :model-value="!!sessaoParaEncerrar"
      titulo="Encerrar sessão sem fechamento?"
      mensagem="Uso pra sessão esquecida/aberta por engano. O caixa/turno/dia fica liberado pra abrir de novo, mas nenhum fechamento é criado."
      texto-confirmar="Encerrar"
      @update:model-value="sessaoParaEncerrar = null"
      @confirmar="confirmarEncerrar"
    />
  </v-container>
</template>
