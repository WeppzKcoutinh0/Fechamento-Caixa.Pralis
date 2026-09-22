<script setup lang="ts">
import { useModoEscuro } from '~/composables/useModoEscuro';

const { inicializar } = useModoEscuro();

useHead({
  htmlAttrs: { lang: "pt-BR" },
  meta: [
    { name: "theme-color", content: "#6515dd" },
    { name: "apple-mobile-web-app-capable", content: "yes" },
    { name: "apple-mobile-web-app-status-bar-style", content: "default" },
    { name: "apple-mobile-web-app-title", content: "Caixa Cicluz" }
  ],
  link: [{ rel: "apple-touch-icon", href: "/marca/pwa-192.png" }]
});

onMounted(inicializar);
</script>

<template>
  <VitePwaManifest />
  <v-app>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <AppPwaControles />
  </v-app>
</template>
