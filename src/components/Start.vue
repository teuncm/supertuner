<script setup vapor>
import { onBeforeUnmount, ref } from 'vue'
import { requestMicrophone } from '../scripts/setup'
const emit = defineEmits(['ready'])
const isStarting = ref(false)
const error = ref('')
let disposed = false
onBeforeUnmount(() => { disposed = true })
async function start() {
  if (isStarting.value) return
  isStarting.value = true
  error.value = ''
  try {
    const stream = await requestMicrophone()
    if (disposed) stream.getTracks().forEach((track) => track.stop())
    else emit('ready', stream)
  } catch (cause) {
    if (disposed) return
    error.value = cause.name === 'NotAllowedError'
      ? 'Allow microphone access in your browser, then try again.'
      : cause.name === 'NotFoundError' ? 'Connect a microphone, then try again.'
        : 'Could not start the microphone. Please try again.'
  } finally {
    if (!disposed) isStarting.value = false
  }
}
</script>
<template>
  <button class="microphone-button" type="button" :disabled="isStarting" :aria-label="isStarting ? 'Allow microphone access' : 'Start listening'" :title="isStarting ? 'Allow microphone access' : 'Start listening'" :aria-busy="isStarting" @click="start">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v3m-3 0h6"/></svg>
  </button>
  <p v-if="error" class="error-message" role="alert">{{ error }}</p>
</template>
