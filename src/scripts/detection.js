import { ET12, NOTES_PER_OCT_DEFAULT } from '@teuncm/n-et'
import { PitchDetector } from 'pitchy'
import { A4_FREQUENCY, MAX_CENTS, MIN_CLARITY, MIN_VOLUME_DB } from './constants.js'

let referenceFrequency
let temperament
const TUNER_NOTES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B']

export function createMPMDetector(inputLength) {
  const detector = PitchDetector.forFloat32Array(inputLength)

  detector.clarityThreshold = MIN_CLARITY
  detector.minVolumeDecibels = MIN_VOLUME_DB

  return detector
}

export function analyzePitch(detector, buffer, sampleRate, a4Frequency = A4_FREQUENCY) {
  const [frequency, clarity] = detector.findPitch(buffer, sampleRate)
  return describePitch(frequency, clarity, a4Frequency)
}

export function describePitch(frequency, clarity, a4Frequency = A4_FREQUENCY, preferredMidiNumber) {

  if (!frequency || clarity < MIN_CLARITY) {
    return {
      cents: 0,
      clarity,
      frequency,
      noteName: '--',
      targetFrequency: 0,
      valid: false,
    }
  }

  if (referenceFrequency !== a4Frequency) {
    temperament = new ET12(a4Frequency)
    referenceFrequency = a4Frequency
  }

  let [midiNumber, detuneSemitones] = temperament.freqToMidiNumDetuned(frequency)
  // Only the note identity has a small deadband; the in-tune tolerance is exact.
  if (Number.isInteger(preferredMidiNumber)) {
    const preferredDetune = midiNumber - preferredMidiNumber + detuneSemitones
    if (Math.abs(preferredDetune) <= 0.56) {
      midiNumber = preferredMidiNumber
      detuneSemitones = preferredDetune
    }
  }
  const cents = clamp(detuneSemitones * 100, -MAX_CENTS, MAX_CENTS)
  const pitchClassIndex = mod(midiNumber, NOTES_PER_OCT_DEFAULT)

  return {
    cents,
    clarity,
    frequency,
    midiNumber,
    noteName: `${TUNER_NOTES[pitchClassIndex]}${Math.floor(midiNumber / NOTES_PER_OCT_DEFAULT) - 1}`,
    pitchClassIndex,
    targetFrequency: temperament.midiNumToFreq(midiNumber),
    valid: true,
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor
}
