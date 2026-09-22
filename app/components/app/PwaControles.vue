<script setup lang="ts">
const pwa = usePWA();
const mostrarInstrucaoIos = ref(false);

onMounted(() => {
  const dispositivoIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const emAppInstalado = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;

  mostrarInstrucaoIos.value = dispositivoIos && !emAppInstalado;
});

async function instalarNoDispositivo() {
  await pwa?.install();
}

async function atualizarAplicativo() {
  await pwa?.updateServiceWorker(true);
}
</script>

<template>
  <v-snackbar
    :model-value="pwa?.showInstallPrompt"
    color="primary"
    location="bottom end"
    :timeout="-1"
  >
    Instale o Caixa Cicluz neste dispositivo.
    <template #actions>
      <v-btn variant="text" @click="pwa?.cancelInstall()">Agora não</v-btn>
      <v-btn variant="flat" color="white" @click="instalarNoDispositivo">Instalar</v-btn>
    </template>
  </v-snackbar>

  <v-snackbar
    :model-value="pwa?.needRefresh"
    color="secondary"
    location="bottom end"
    :timeout="-1"
  >
    Uma atualização está disponível.
    <template #actions>
      <v-btn variant="text" @click="pwa?.cancelPrompt()">Depois</v-btn>
      <v-btn variant="flat" color="white" @click="atualizarAplicativo">Atualizar</v-btn>
    </template>
  </v-snackbar>

  <v-snackbar
    v-model="mostrarInstrucaoIos"
    color="primary"
    location="bottom"
    :timeout="-1"
  >
    Para instalar no iPhone: toque em Compartilhar e escolha “Adicionar à Tela de Início”.
    <template #actions>
      <v-btn variant="text" @click="mostrarInstrucaoIos = false">Entendi</v-btn>
    </template>
  </v-snackbar>
</template>
