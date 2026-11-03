import { getPitchWindowSize } from './constants'
import { closeAudioGraph, createAudioGraph } from './setup'
import captureWorkletUrl from './capture-worklet.js?url&no-inline'

export async function createPitchEngine(stream, onReading, onError, onAudioActivity = () => {}) {
  const graph = await createAudioGraph(stream)
  let worker
  try { worker = new Worker(new URL('./pitch-worker.js', import.meta.url), { type: 'module' }) }
  catch (error) { closeAudioGraph(graph); throw error }
  let capture = null
  let buffer = null
  let pollTimer
  let watchdog
  let stopped = false
  let pendingAt = 0
  let lastResult = performance.now()
  let idle = true
  let receiving = false
  function setReceiving(value) {
    if (receiving !== value) { receiving = value; onAudioActivity(value) }
  }

  function publish(reading) {
    if (reading?.valid || !idle) onReading(reading)
    idle = !reading?.valid
  }
  function active() { return !document.hidden && graph.audioContext.state === 'running' }
  worker.onmessage = ({ data }) => {
    if (stopped) return
    if (data.buffer) buffer = data.buffer
    if (data.error) { fail(); return }
    const fresh = active() && (data.audioTime === undefined
      ? performance.now() - pendingAt < 120
      : graph.audioContext.currentTime - data.audioTime < 0.12)
    lastResult = performance.now()
    setReceiving(fresh)
    publish(fresh ? data.reading : null)
  }
  worker.onerror = fail
  function fail() {
    stop()
    onError('Audio analysis stopped. Please start listening again.')
  }

  // Connect capture directly to the worker. PCM never visits the UI thread.
  try {
    if (!graph.audioContext.audioWorklet) throw new Error('AudioWorklet unavailable')
    await graph.audioContext.audioWorklet.addModule(captureWorkletUrl)
    if (stopped) throw new Error('Audio initialization stopped')
    capture = new AudioWorkletNode(graph.audioContext, 'pitch-capture', { channelCount: 1, channelCountMode: 'explicit', numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { windowSize: getPitchWindowSize(graph.audioContext.sampleRate) } })
    const channel = new MessageChannel()
    worker.postMessage({ type: 'connect', port: channel.port1 }, [channel.port1])
    capture.port.postMessage({ type: 'connect', port: channel.port2 }, [channel.port2])
    capture.onprocessorerror = fail
    graph.gain.connect(capture)
    // The processor writes no output, so this connection is always silent.
    capture.connect(graph.audioContext.destination)
  } catch (error) {
    if (stopped) throw error
    capture?.disconnect()
    capture?.port.close()
    capture = null
    const analyser = graph.audioContext.createAnalyser()
    analyser.fftSize = getPitchWindowSize(graph.audioContext.sampleRate)
    analyser.smoothingTimeConstant = 0
    graph.analyser = analyser
    graph.gain.connect(analyser)
    buffer = new Float32Array(analyser.fftSize)
    // Compatibility path, still faster than the previous 33 ms polling loop.
    pollTimer = setInterval(() => {
      if (!active() || !buffer) return
      analyser.getFloatTimeDomainData(buffer)
      pendingAt = performance.now()
      worker.postMessage({ buffer, sampleRate: graph.audioContext.sampleRate, available: buffer.length, advanced: Math.round(graph.audioContext.sampleRate * 0.01) }, [buffer.buffer])
      buffer = null
    }, 10)
  }

  function updateActivity() {
    capture?.port.postMessage({ type: 'active', value: active() })
    publish(null)
    setReceiving(false)
  }
  document.addEventListener('visibilitychange', updateActivity)
  graph.audioContext.addEventListener('statechange', updateActivity)
  if (!active()) updateActivity()
  watchdog = setInterval(() => {
    if (!active() || performance.now() - lastResult > 120) { publish(null); setReceiving(false) }
  }, 60)

  function stop() {
    if (stopped) return
    stopped = true
    setReceiving(false)
    clearInterval(pollTimer)
    clearInterval(watchdog)
    document.removeEventListener('visibilitychange', updateActivity)
    graph.audioContext.removeEventListener('statechange', updateActivity)
    if (capture) {
      capture.onprocessorerror = null
      capture.port.postMessage({ type: 'stop' })
      capture.disconnect()
      capture.port.close()
    }
    worker.terminate()
    closeAudioGraph(graph)
  }
  return {
    stop,
    setReference(value) { worker.postMessage({ type: 'reference', value }) },
    setSensitivity(value) { graph.gain.gain.setTargetAtTime(value, graph.audioContext.currentTime, 0.01) },
  }
}
