<script setup>
import { ref } from 'vue'
import { requestMicrophone } from '../scripts/setup'

const emit = defineEmits(['ready'])

const isStarting = ref(false)
const buttonLabel = ref('Start tuner')

async function start() {
  if (isStarting.value) return

  isStarting.value = true
  buttonLabel.value = 'Allow microphone'

  try {
    const stream = await requestMicrophone()
    emit('ready', stream)
  } catch {
    buttonLabel.value = 'Microphone blocked'
    isStarting.value = false
  }
}
</script>

<template>
  <button class="start-button" type="button" :disabled="isStarting" @click="start">
    {{ buttonLabel }}
  </button>
</template>
