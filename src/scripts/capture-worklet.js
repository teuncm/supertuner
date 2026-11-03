// No FFTs on the audio thread: only a ring-buffer write and a bounded snapshot.
// One transferable snapshot in flight gives backpressure without queuing audio.
class PitchCapture extends AudioWorkletProcessor {
  constructor(options) {
    super()
    this.size = options.processorOptions.windowSize
    this.mask = this.size - 1
    this.ring = new Float32Array(this.size * 2)
    this.snapshot = new Float32Array(this.size)
    this.hopSize = Math.round(sampleRate * 0.005)
    this.writeIndex = 0
    this.available = 0
    this.hop = 0
    this.enabled = true
    this.running = true
    this.channel = null
    this.port.onmessage = ({ data }) => {
      if (data.type === 'connect') {
        this.channel = data.port
        this.channel.onmessage = ({ data: returned }) => { this.snapshot = returned.buffer }
        this.channel.start()
      } else if (data.type === 'active') {
        this.enabled = data.value
        this.available = 0
        this.hop = 0
      } else if (data.type === 'stop') {
        this.running = false
        this.channel?.close()
      }
    }
  }
  process(inputs) {
    if (!this.running) return false
    const input = inputs[0]?.[0]
    if (!input || !this.enabled) return true
    for (let i = 0; i < input.length; i++) {
      this.ring[this.writeIndex] = input[i]
      this.ring[this.writeIndex + this.size] = input[i]
      this.writeIndex = (this.writeIndex + 1) & this.mask
    }
    this.available = Math.min(this.size, this.available + input.length)
    this.hop += input.length
    if (this.hop >= this.hopSize && this.snapshot && this.channel) {
      this.snapshot.set(this.ring.subarray(this.writeIndex, this.writeIndex + this.size))
      this.channel.postMessage({ buffer: this.snapshot, sampleRate, available: this.available, frame: currentFrame + input.length, advanced: this.hop }, [this.snapshot.buffer])
      this.snapshot = null
      this.hop = 0
    }
    return true
  }
}
registerProcessor('pitch-capture', PitchCapture)
