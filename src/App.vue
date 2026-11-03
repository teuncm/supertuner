<script setup vapor>
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import Start from './components/Start.vue'
import Tuner from './components/Tuner.vue'

const stream = shallowRef(null)
const error = ref('')
const theme = ref(readTheme())
const settingsOpen = ref(false)
function readTheme() {
  try { return localStorage.getItem('supertuner-theme') === 'light' ? 'light' : 'dark' }
  catch { return 'dark' }
}
watch(theme, (value) => {
  document.documentElement.dataset.theme = value
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value === 'dark' ? '#111111' : '#fcfcfc')
  try { localStorage.setItem('supertuner-theme', value) } catch { /* Storage is optional. */ }
}, { immediate: true })
function startTuner(mediaStream) {
  error.value = ''
  stream.value = mediaStream
}
function stopTuner() {
  stream.value?.getTracks().forEach((track) => track.stop())
  stream.value = null
}
function handleError(message) {
  stopTuner()
  error.value = message
}
onBeforeUnmount(stopTuner)
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <button class="icon-button settings-toggle" type="button" aria-label="Tuner settings" title="Settings" :aria-expanded="settingsOpen" aria-controls="tuner-settings" @click="settingsOpen = !settingsOpen">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--page)"/><circle cx="15" cy="17" r="3" fill="var(--page)"/></svg>
      </button>
      <button class="theme-toggle" type="button" :aria-label="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'" :aria-pressed="theme === 'light'" @click="theme = theme === 'dark' ? 'light' : 'dark'">
        <svg v-if="theme === 'dark'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z"/></svg>
      </button>
    </header>
    <main>
      <Tuner :stream="stream" :theme="theme" :settings-open="settingsOpen" @error="handleError">
        <template #microphone>
          <Start v-if="!stream" @ready="startTuner" />
          <button v-else class="microphone-button is-listening" type="button" aria-label="Stop listening" title="Stop listening" @click="stopTuner">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 9v3a3 3 0 0 0 5.1 2.1M9.1 5.1A3 3 0 0 1 15 6v5M6 10v2a6 6 0 0 0 10.2 4.2M18 10v2a6 6 0 0 1-.2 1.5M12 18v3m-3 0h6M3 3l18 18"/></svg>
          </button>
          <p v-if="error" class="error-message" role="alert">{{ error }}</p>
        </template>
        <template #session>
          <button class="stop-session" type="button" @click="stopTuner">Stop listening</button>
        </template>
      </Tuner>
    </main>
  </div>
</template>
