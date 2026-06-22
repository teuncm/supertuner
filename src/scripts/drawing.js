import { MAX_CENTS } from './constants'

const CENTS_SWEEP_DEGREES = 360
const DEGREES_PER_NOTE = 30

export function centsToPointerRotation(cents) {
  return 180 + ((cents + MAX_CENTS) / (MAX_CENTS * 2)) * CENTS_SWEEP_DEGREES
}

export function pitchToPointerRotation(pitchClassIndex, cents) {
  return (pitchClassIndex * DEGREES_PER_NOTE) + (cents / 100) * DEGREES_PER_NOTE
}

export function unwrapRotation(currentRotation, targetRotation) {
  if (!Number.isFinite(currentRotation)) return targetRotation

  const turns = Math.round((currentRotation - targetRotation) / 360)
  return targetRotation + turns * 360
}
