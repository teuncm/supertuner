const audioConstraints = {
  audio: {
    autoGainControl: false,
    echoCancellation: false,
    noiseSuppression: false,
    channelCount: { ideal: 1 },
    latency: { ideal: 0 },
  },
  video: false,
}

export async function requestMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone access is not available in this browser.')
  }

  return navigator.mediaDevices.getUserMedia(audioConstraints)
}

export async function createAudioGraph(stream) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  const audioContext = new AudioContextClass({ latencyHint: 'interactive' })
  const gain = audioContext.createGain()
  const highpass = audioContext.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = 20
  highpass.Q.value = 0
  const source = audioContext.createMediaStreamSource(stream)

  source.connect(highpass)
  highpass.connect(gain)

  if (audioContext.state === 'suspended') {
    try { await audioContext.resume() }
    catch (error) { source.disconnect(); highpass.disconnect(); gain.disconnect(); await audioContext.close(); throw error }
  }

  return {
    audioContext,
    gain,
    highpass,
    source,
  }
}

export function closeAudioGraph(audioGraph) {
  if (!audioGraph) return

  audioGraph.source.disconnect()
  audioGraph.highpass.disconnect()
  audioGraph.gain.disconnect()
  audioGraph.analyser?.disconnect()
  void audioGraph.audioContext.close().catch(() => {})
}
