<script setup vapor>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { A4_FREQUENCY, IN_TUNE_CENTS, MAX_A4_FREQUENCY, MIN_A4_FREQUENCY, MAX_TARGET_ACCURACY_CENTS } from '../scripts/constants'
import { createPitchEngine } from '../scripts/engine'
import { createPitchRenderer } from '../scripts/pitch-renderer'
import { createPitchSmoother } from '../scripts/pitch-smoother'
const props = defineProps({ stream: { type: Object, default: null }, theme: { type: String, default: 'dark' }, settingsOpen: { type: Boolean, default: false } })
const emit = defineEmits(['error'])
const reading = shallowRef(null)
const audioReceived = ref(false)
const isHeld = ref(false)
const targetAccuracy = ref(IN_TUNE_CENTS)
const tuningReference = ref(A4_FREQUENCY)
const sensitivity = ref(15)
const canvas = ref(null)
const gpuReady = ref(false)
const deviationTicks = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50]
const hasPitch = computed(() => Boolean(reading.value?.valid))
const cents = computed(() => hasPitch.value ? reading.value.cents : 0)
const inTune = computed(() => hasPitch.value && !isHeld.value && Math.abs(cents.value) <= targetAccuracy.value)
const note = computed(() => hasPitch.value ? reading.value.noteName.replace(/-?\d+$/, '') : '—')
const octave = computed(() => hasPitch.value ? reading.value.noteName.match(/-?\d+$/)?.[0] : '')
const signedCents = computed(() => {
  if (!hasPitch.value) return '—'
  const rounded = Math.round(cents.value * 10) / 10
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}`
})
const status = computed(() => !props.stream ? 'Ready when you are' : !hasPitch.value ? 'Listening for a note' : isHeld.value ? `Last detected ${reading.value.noteName}` : inTune.value ? 'In tune' : cents.value < 0 ? 'Too flat · tune up' : 'Too sharp · tune down')
let engine = null
let renderer = null
let frame = 0
let pendingReading
let pitchTimeout = null
let lastDetectedAt = 0
const smoother = createPitchSmoother()
let activeReference = A4_FREQUENCY
function scheduleDraw() {
  if (!frame) frame = requestAnimationFrame(draw)
}
function draw() {
  frame = 0
  if (pendingReading !== undefined) {
    reading.value = pendingReading
    pendingReading = undefined
  }
  renderer?.draw({ cents: cents.value, tolerance: targetAccuracy.value, valid: hasPitch.value, inTune: inTune.value, light: props.theme === 'light' })
}
watch(() => props.stream, async (stream, _, onCleanup) => {
  let cancelled = false
  let session = null
  onCleanup(() => {
    cancelled = true
    clearTimeout(pitchTimeout)
    pitchTimeout = null
    session?.stop()
    if (engine === session) engine = null
  })
  reading.value = null
  isHeld.value = false
  lastDetectedAt = 0
  smoother.reset()
  audioReceived.value = false
  pendingReading = undefined
  scheduleDraw()
  if (!stream) return
  try {
    session = await createPitchEngine(stream, (value) => {
      if (cancelled) return
      const now = performance.now()
      const nextReading = smoother.update(value, now, activeReference)
      if (nextReading?.valid) {
        isHeld.value = false
        lastDetectedAt = now
        clearTimeout(pitchTimeout)
        pitchTimeout = null
        pendingReading = nextReading
        scheduleDraw()
      } else if (lastDetectedAt > 0) {
        isHeld.value = true
        scheduleDraw()
        if (pitchTimeout === null) {
          pitchTimeout = setTimeout(() => {
            pitchTimeout = null
            if (cancelled) return
            lastDetectedAt = 0
            isHeld.value = false
            pendingReading = null
            scheduleDraw()
          }, Math.max(0, lastDetectedAt + 3000 - now))
        }
      } else {
        pendingReading = null
        scheduleDraw()
      }
    }, (message) => { if (!cancelled) emit('error', message) }, (receiving) => {
      if (!cancelled) audioReceived.value = receiving
    })
    if (cancelled) { session.stop(); return }
    engine = session
    engine.setReference(activeReference)
    engine.setSensitivity(sensitivity.value)
  } catch {
    if (!cancelled) emit('error', 'Could not initialize audio. Please start listening again.')
  }
}, { immediate: true })
watch(tuningReference, (value) => {
  const reference = Number(value)
  if (reference >= MIN_A4_FREQUENCY && reference <= MAX_A4_FREQUENCY) {
    activeReference = reference
    engine?.setReference(reference)
  }
})
watch(sensitivity, (value) => engine?.setSensitivity(value))
watch([targetAccuracy, () => props.theme], scheduleDraw)
onMounted(() => {
  renderer = createPitchRenderer(canvas.value, (ready) => { gpuReady.value = ready; scheduleDraw() }, scheduleDraw)
  scheduleDraw()
})
onBeforeUnmount(() => {
  clearTimeout(pitchTimeout)
  cancelAnimationFrame(frame)
  renderer?.destroy()
})
</script>
<template>
  <section class="tuner" aria-label="Tuner">
    <div class="microphone-control" :class="{ 'is-hidden': audioReceived }" role="region" aria-label="Microphone access"><slot name="microphone" /></div>
    <div class="pitch-readout" :class="{ 'has-pitch': hasPitch, 'is-held': isHeld }" aria-hidden="true"><span class="scientific-note"><span class="note-name">{{ note.charAt(0) }}</span><span class="accidental">{{ note.slice(1) }}</span><span class="octave">{{ octave }}</span></span></div>
    <div class="tuning-display" :class="{ 'is-tuned': inTune, 'is-held': isHeld }">
      <p class="sr-only" role="status">{{ status }}</p>
      <div class="meter" aria-label="Pitch deviation" role="meter" aria-valuemin="-50" aria-valuemax="50" :aria-valuenow="hasPitch ? cents : undefined" :aria-valuetext="hasPitch ? `${signedCents} cents, ${status}` : status">
        <div class="meter-plot">
          <canvas ref="canvas" class="pitch-canvas" :class="{ ready: gpuReady }" aria-hidden="true" />
          <div v-if="!gpuReady" class="meter-fallback" aria-hidden="true">
            <div class="fallback-range" :style="{ width: `${targetAccuracy * 2}%` }" />
            <span v-for="tick in deviationTicks" :key="tick" class="fallback-tick" :class="{ 'is-center': tick === 0 }" :style="{ left: `${tick + 50}%` }" />
            <div v-if="hasPitch" class="fallback-needle" :style="{ left: `${cents + 50}%` }" />
          </div>
        </div>
      </div>
    </div>
    <div class="deviation-scale" aria-hidden="true"><span v-for="tick in deviationTicks" :key="tick" class="deviation-label" :style="{ left: `${tick + 50}%` }">{{ tick > 0 ? `+${tick}` : tick }}</span></div>
    <div v-if="settingsOpen" id="tuner-settings" class="tuner-settings">
      <div class="input-controls">
      <label class="tolerance-control"><span>In-tune range <strong>±{{ targetAccuracy.toFixed(1) }} <small>cents</small></strong></span><input v-model.number="targetAccuracy" type="range" min="1" :max="MAX_TARGET_ACCURACY_CENTS" step="0.1" aria-label="In-tune range" :aria-valuetext="`±${targetAccuracy.toFixed(1)} cents`" /></label>
      <label class="tolerance-control sensitivity-control"><span>Sensitivity <strong>{{ sensitivity.toFixed(1) }}×</strong></span><input v-model.number="sensitivity" type="range" min="1" max="20" step="0.1" aria-label="Sensitivity" :aria-valuetext="`${sensitivity.toFixed(1)}×`" /></label>
      </div>
      <label class="reference-control"><span>Reference pitch</span><span class="reference-input">A4 <input v-model.number="tuningReference" type="number" :min="MIN_A4_FREQUENCY" :max="MAX_A4_FREQUENCY" step="1" @change="tuningReference = Math.min(MAX_A4_FREQUENCY, Math.max(MIN_A4_FREQUENCY, Number(tuningReference) || A4_FREQUENCY))" /> Hz</span></label>
      <div v-if="stream" class="session-settings"><slot name="session" /></div>
    </div>
  </section>
</template>
