<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { PITCH_CLASS_TABLE } from '@teuncm/n-et'
import {
  FFT_SIZE,
  IN_TUNE_CENTS,
  A4_FREQUENCY,
  MAX_A4_FREQUENCY,
  MAX_INPUT_GAIN,
  MAX_CENTS,
  MAX_TARGET_ACCURACY_CENTS,
  MIN_A4_FREQUENCY,
  MIN_INPUT_LEVEL_DB,
  PITCH_RELEASE_MS,
} from '../scripts/constants'
import { analyzePitch, createMPMDetector } from '../scripts/detection'
import {
  centsToPointerRotation,
  pitchToPointerRotation,
  unwrapRotation,
} from '../scripts/drawing'
import { closeAudioGraph, createAudioGraph, setAudioGraphGain } from '../scripts/setup'

const props = defineProps({
  stream: {
    type: Object,
    required: true,
  },
})

const reading = ref(null)
const inputGain = ref(10)
const tuningReference = ref(A4_FREQUENCY)
const targetAccuracy = ref(IN_TUNE_CENTS)
const centsPointerDegrees = ref(centsToPointerRotation(0))
const notePointerDegrees = ref(0)
const NOTE_LABEL_RADIUS = 25
const CENTS_POINTER_RADIUS = 43
const noteLabels = PITCH_CLASS_TABLE.map((name, index) => ({
  name,
  x: 50 + Math.sin((index * 30 * Math.PI) / 180) * NOTE_LABEL_RADIUS,
  y: 50 - Math.cos((index * 30 * Math.PI) / 180) * NOTE_LABEL_RADIUS,
}))
const centLabels = [-40, -30, -20, -10, 0, 10, 20, 30, 40].map((centsValue) => {
  const angle = (centsValue / MAX_CENTS) * 180

  return {
    name: centsValue > 0 ? `+${centsValue}` : `${centsValue}`,
    x: 50 + Math.sin((angle * Math.PI) / 180) * CENTS_POINTER_RADIUS,
    y: 50 - Math.cos((angle * Math.PI) / 180) * CENTS_POINTER_RADIUS,
  }
})

let audioGraph = null
let detector = null
let animationFrame = 0
let lastValidReadingAt = 0

const hasPitch = computed(() => reading.value?.valid)
const cents = computed(() => reading.value?.cents ?? 0)
const noteName = computed(() => reading.value?.noteName ?? '--')
const frequency = computed(() => (
  reading.value?.frequency ? `${reading.value.frequency.toFixed(1)} Hz` : '...'
))
const targetFrequency = computed(() => (
  reading.value?.targetFrequency
    ? `${reading.value.targetFrequency.toFixed(1)} Hz`
    : '...'
))
const gainLabel = computed(() => `${Number(inputGain.value).toFixed(1)}x`)
const tuningReferenceLabel = computed(() => `${Number(tuningReference.value).toFixed(0)}Hz`)
const targetAccuracyLabel = computed(() => `${targetAccuracy.value.toFixed(0)}c`)
const accuracyFanPath = computed(() => createAccuracyFanPath(
  Number(targetAccuracy.value),
  NOTE_LABEL_RADIUS,
  CENTS_POINTER_RADIUS,
))
const centsPointerRotation = computed(() => `${centsPointerDegrees.value}deg`)
const notePointerRotation = computed(() => `${notePointerDegrees.value}deg`)
const signedCents = computed(() => {
  if (!hasPitch.value) return '...'

  const roundedCents = Math.round(cents.value)
  return `${roundedCents > 0 ? '+' : ''}${roundedCents} cents`
})
const tuningState = computed(() => {
  if (!hasPitch.value) return 'waiting'
  if (Math.abs(cents.value) <= targetAccuracy.value) return 'tuned'
  return cents.value < 0 ? 'flat' : 'sharp'
})

function updatePitch() {
  audioGraph.levelAnalyser.getFloatTimeDomainData(audioGraph.levelBuffer)

  if (isInputLevelTooLow(audioGraph.levelBuffer)) {
    reading.value = createIdleReading()
    animationFrame = requestAnimationFrame(updatePitch)
    return
  }

  audioGraph.analyser.getFloatTimeDomainData(audioGraph.buffer)
  const nextReading = analyzePitch(
    detector,
    audioGraph.buffer,
    audioGraph.audioContext.sampleRate,
    Number(tuningReference.value),
  )
  const now = performance.now()

  if (nextReading.valid) {
    lastValidReadingAt = now
    reading.value = nextReading
    updatePointerRotations(nextReading)
  } else if (!reading.value?.valid || now - lastValidReadingAt > PITCH_RELEASE_MS) {
    reading.value = nextReading
  }

  animationFrame = requestAnimationFrame(updatePitch)
}

function isInputLevelTooLow(buffer) {
  let squareSum = 0

  for (let index = 0; index < buffer.length; index += 1) {
    squareSum += buffer[index] ** 2
  }

  const rms = Math.sqrt(squareSum / buffer.length)
  const db = 20 * Math.log10(Math.max(rms, Number.EPSILON))

  return db < MIN_INPUT_LEVEL_DB
}

function createIdleReading() {
  return {
    cents: 0,
    clarity: 0,
    frequency: 0,
    noteName: '--',
    targetFrequency: 0,
    valid: false,
  }
}

function updatePointerRotations(nextReading) {
  if (!nextReading.valid) return

  const nextCentsRotation = centsToPointerRotation(nextReading.cents)
  const nextNoteRotation = pitchToPointerRotation(
    nextReading.pitchClassIndex,
    nextReading.cents,
  )

  centsPointerDegrees.value = unwrapRotation(centsPointerDegrees.value, nextCentsRotation)
  notePointerDegrees.value = unwrapRotation(notePointerDegrees.value, nextNoteRotation)
}

function createAccuracyFanPath(accuracyCents, innerRadius, outerRadius) {
  const halfAngle = (accuracyCents / MAX_CENTS) * 180
  const startAngle = -halfAngle
  const endAngle = halfAngle
  const largeArcFlag = (endAngle - startAngle) > 180 ? 1 : 0
  const outerStart = pointOnClock(outerRadius, startAngle)
  const outerEnd = pointOnClock(outerRadius, endAngle)
  const innerStart = pointOnClock(innerRadius, startAngle)
  const innerEnd = pointOnClock(innerRadius, endAngle)

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ')
}

function pointOnClock(radius, degrees) {
  const radians = (degrees * Math.PI) / 180

  return {
    x: roundPathCoordinate(50 + Math.sin(radians) * radius),
    y: roundPathCoordinate(50 - Math.cos(radians) * radius),
  }
}

function roundPathCoordinate(value) {
  return Number(value.toFixed(3))
}

watch(inputGain, (gainValue) => {
  setAudioGraphGain(audioGraph, Number(gainValue))
})

onMounted(async () => {
  audioGraph = await createAudioGraph(props.stream, FFT_SIZE)
  setAudioGraphGain(audioGraph, Number(inputGain.value))
  detector = createMPMDetector(audioGraph.buffer.length)
  updatePitch()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame)
  closeAudioGraph(audioGraph)
  props.stream.getTracks().forEach((track) => track.stop())
})
</script>

<template>
  <section class="tuner" :class="`is-${tuningState}`">
    <div
      class="tuner-circle"
      :style="{
        '--cents-pointer-rotation': centsPointerRotation,
        '--note-pointer-rotation': notePointerRotation,
      }"
      aria-live="polite"
    >
      <svg class="accuracy-fan" viewBox="0 0 100 100" aria-hidden="true">
        <path :d="accuracyFanPath" />
      </svg>

      <div class="note-ring" aria-hidden="true">
        <span
          v-for="note in noteLabels"
          :key="note.name"
          class="note-label"
          :style="{
            left: `${note.x}%`,
            top: `${note.y}%`,
          }"
        >
          {{ note.name }}
        </span>
      </div>

      <div class="cent-ring" aria-hidden="true">
        <span
          v-for="cent in centLabels"
          :key="cent.name"
          class="cent-label"
          :style="{
            left: `${cent.x}%`,
            top: `${cent.y}%`,
          }"
        >
          {{ cent.name }}
        </span>
      </div>

      <div class="cents-pointer" />
      <div class="note-pointer" />
      <div class="center-dot" />
    </div>

    <div class="tuner-readout" aria-live="polite">
      <div class="readout-note">
        <span>Note</span>
        <strong>{{ noteName }}</strong>
      </div>
      <div>
        <span>Hz</span>
        <strong>{{ frequency }}</strong>
      </div>
      <div>
        <span>Target</span>
        <strong>{{ targetFrequency }}</strong>
      </div>
      <div>
        <span>Cents</span>
        <strong>{{ signedCents }}</strong>
      </div>
    </div>

    <label class="tuner-control">
      <span>Target</span>
      <input
        v-model.number="targetAccuracy"
        type="range"
        min="1"
        :max="MAX_TARGET_ACCURACY_CENTS"
        step="1"
      >
      <strong>{{ targetAccuracyLabel }}</strong>
    </label>

    <label class="tuner-control">
      <span>Gain</span>
      <input
        v-model.number="inputGain"
        type="range"
        min="1"
        :max="MAX_INPUT_GAIN"
        step="0.1"
      >
      <strong>{{ gainLabel }}</strong>
    </label>

    <label class="tuner-control">
      <span>A4</span>
      <input
        v-model.number="tuningReference"
        type="range"
        :min="MIN_A4_FREQUENCY"
        :max="MAX_A4_FREQUENCY"
        step="1"
      >
      <strong>{{ tuningReferenceLabel }}</strong>
    </label>
  </section>
</template>
