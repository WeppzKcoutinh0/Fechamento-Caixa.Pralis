<script setup lang="ts">
import { ref, watch } from 'vue';
import { useAnexos } from '~/composables/useAnexos';

const props = defineProps<{
  fechamentoId: string;
  campo: string;
  uploadAdiado?: boolean;
  arquivoPendente?: File | null;
}>();
const modelValue = defineModel<string | null>({ default: null });
const transcricao = defineModel<string>('transcricao', { default: '' });
const emit = defineEmits<{
  arquivoSelecionado: [arquivo: File];
  arquivoRemovido: [];
}>();

const { enviar, urlAssinada } = useAnexos();
const gravando = ref(false);
const enviando = ref(false);
const erro = ref<string | null>(null);
const urlReproducao = ref<string | null>(null);
const arquivoPendenteLocal = ref(false);

let mediaRecorder: MediaRecorder | null = null;
let chunks: Blob[] = [];

interface ReconhecimentoEvento {
  results: ArrayLike<ArrayLike<{ transcript?: string }>>;
}

interface ReconhecimentoVoz {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: ReconhecimentoEvento) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface JanelaComReconhecimento extends Window {
  SpeechRecognition?: new () => ReconhecimentoVoz;
  webkitSpeechRecognition?: new () => ReconhecimentoVoz;
}

let reconhecimento: ReconhecimentoVoz | null = null;

function iniciarTranscricao(): void {
  if (typeof window === 'undefined') return;
  const janela = window as JanelaComReconhecimento;
  const Construtor = janela.SpeechRecognition ?? janela.webkitSpeechRecognition;
  if (!Construtor) return;

  reconhecimento = new Construtor();
  reconhecimento.lang = 'pt-BR';
  reconhecimento.continuous = true;
  reconhecimento.interimResults = false;
  reconhecimento.onresult = (event) => {
    const partes: string[] = [];
    for (let i = 0; i < event.results.length; i += 1) {
      const texto = event.results[i]?.[0]?.transcript?.trim();
      if (texto) partes.push(texto);
    }
    if (partes.length > 0) {
      transcricao.value = [transcricao.value.trim(), partes.join(' ')].filter(Boolean).join(' ');
    }
  };
  reconhecimento.onerror = () => {
    // A gravação do áudio continua mesmo quando o navegador não oferece reconhecimento de voz.
  };
  try {
    reconhecimento.start();
  } catch {
    reconhecimento = null;
  }
}

function pararTranscricao(): void {
  reconhecimento?.stop();
  reconhecimento = null;
}

async function atualizarUrlReproducao(): Promise<void> {
  urlReproducao.value = modelValue.value ? await urlAssinada(modelValue.value) : null;
}
watch(() => modelValue.value, atualizarUrlReproducao, { immediate: true });

async function alternarGravacao(): Promise<void> {
  if (gravando.value) {
    pararTranscricao();
    mediaRecorder?.stop();
    return;
  }

  erro.value = null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      gravando.value = false;
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const arquivo = new File([blob], `observacao-${Date.now()}.webm`, { type: 'audio/webm' });
      if (props.uploadAdiado) {
        arquivoPendenteLocal.value = true;
        emit('arquivoSelecionado', arquivo);
        return;
      }
      enviando.value = true;
      try {
        modelValue.value = await enviar(props.fechamentoId, props.campo, arquivo);
      } catch (e) {
        erro.value = e instanceof Error ? e.message : 'Não foi possível enviar o áudio.';
      } finally {
        enviando.value = false;
      }
    };
    mediaRecorder.start();
    iniciarTranscricao();
    gravando.value = true;
  } catch {
    erro.value = 'Microfone não disponível';
  }
}

function removerAudio(): void {
  if (arquivoPendenteLocal.value || props.arquivoPendente) {
    arquivoPendenteLocal.value = false;
    emit('arquivoRemovido');
  }
  modelValue.value = null;
  urlReproducao.value = null;
}
</script>

<template>
  <div>
    <v-btn
      :color="gravando ? 'error' : 'primary'"
      :loading="enviando"
      variant="tonal"
      :prepend-icon="
        gravando ? 'mdi-stop' : modelValue ? 'mdi-microphone' : 'mdi-microphone-outline'
      "
      size="small"
      @click="alternarGravacao"
    >
      {{ gravando ? 'Gravando… toque para parar' : modelValue ? 'Regravar' : 'Gravar observação' }}
    </v-btn>
    <audio
      v-if="urlReproducao"
      :src="urlReproducao"
      controls
      class="d-block mt-2"
      style="height: 32px"
    />
    <v-chip
      v-if="(arquivoPendenteLocal || arquivoPendente) && !urlReproducao"
      prepend-icon="mdi-microphone"
      color="primary"
      variant="tonal"
      class="mt-2"
    >
      Áudio pronto para salvar
    </v-chip>
    <v-btn
      v-if="modelValue || arquivoPendenteLocal || arquivoPendente"
      icon="mdi-close"
      size="x-small"
      variant="text"
      aria-label="Remover áudio"
      @click="removerAudio"
    />
    <div v-if="erro" class="text-caption text-error mt-1">{{ erro }}</div>
  </div>
</template>
