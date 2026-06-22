<script setup>
import { onBeforeUnmount, ref } from 'vue'
import Start from './components/Start.vue'
import Tuner from './components/Tuner.vue'

const stream = ref(null)

function startTuner(mediaStream) {
  stream.value = mediaStream
}

onBeforeUnmount(() => {
  stream.value?.getTracks().forEach((track) => track.stop())
})
</script>

<template>
  <main class="app-shell">
    <Start v-if="!stream" @ready="startTuner" />
    <Tuner v-else :stream="stream" />
  </main>
</template>
