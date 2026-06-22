import { ET12, NOTES_PER_OCT_DEFAULT } from '@teuncm/n-et'
import { PitchDetector } from 'pitchy'
import { A4_FREQUENCY, MAX_CENTS, MIN_CLARITY, MIN_VOLUME_DB } from './constants'

export function createMPMDetector(inputLength) {
  const detector = PitchDetector.forFloat32Array(inputLength)

  detector.clarityThreshold = MIN_CLARITY
  detector.minVolumeDecibels = MIN_VOLUME_DB

  return detector
}

export function analyzePitch(detector, buffer, sampleRate, a4Frequency = A4_FREQUENCY) {
  const [frequency, clarity] = detector.findPitch(buffer, sampleRate)
  const temperament = new ET12(a4Frequency)

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

  const [midiNumber, detuneSemitones] = temperament.freqToMidiNumDetuned(frequency)
  const cents = clamp(detuneSemitones * 100, -MAX_CENTS, MAX_CENTS)
  const pitchClassIndex = mod(midiNumber, NOTES_PER_OCT_DEFAULT)

  return {
    cents,
    clarity,
    frequency,
    midiNumber,
    noteName: temperament.midiNumToSPN(midiNumber),
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
