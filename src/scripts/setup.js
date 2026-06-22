const audioConstraints = {
  audio: {
    autoGainControl: false,
    echoCancellation: false,
    noiseSuppression: false,
  },
  video: false,
}

export async function requestMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone access is not available in this browser.')
  }

  return navigator.mediaDevices.getUserMedia(audioConstraints)
}

export async function createAudioGraph(stream, fftSize) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  const audioContext = new AudioContextClass()
  const analyser = audioContext.createAnalyser()
  const gain = audioContext.createGain()
  const levelAnalyser = audioContext.createAnalyser()
  const limiter = audioContext.createDynamicsCompressor()
  const source = audioContext.createMediaStreamSource(stream)

  gain.gain.value = 1
  limiter.threshold.value = -1
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.003
  limiter.release.value = 0.08
  analyser.fftSize = fftSize
  analyser.smoothingTimeConstant = 0
  levelAnalyser.fftSize = fftSize
  levelAnalyser.smoothingTimeConstant = 0
  source.connect(gain)
  gain.connect(levelAnalyser)
  gain.connect(limiter)
  limiter.connect(analyser)

  if (audioContext.state === 'suspended') {
    await audioContext.resume()
  }

  return {
    analyser,
    audioContext,
    buffer: new Float32Array(analyser.fftSize),
    gain,
    levelBuffer: new Float32Array(levelAnalyser.fftSize),
    levelAnalyser,
    limiter,
    source,
  }
}

export function setAudioGraphGain(audioGraph, gainValue) {
  if (!audioGraph) return

  audioGraph.gain.gain.setTargetAtTime(
    gainValue,
    audioGraph.audioContext.currentTime,
    0.01,
  )
}

export function closeAudioGraph(audioGraph) {
  if (!audioGraph) return

  audioGraph.source.disconnect()
  audioGraph.gain.disconnect()
  audioGraph.levelAnalyser.disconnect()
  audioGraph.limiter.disconnect()
  audioGraph.audioContext.close()
}
