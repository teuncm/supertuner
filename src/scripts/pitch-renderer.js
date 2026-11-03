const vertexSource = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`
const fragmentSource = `
precision highp float;
uniform vec2 resolution;
uniform float pixelRatio;
uniform float cents;
uniform float tolerance;
uniform float valid;
uniform vec3 ink;
float rect(vec2 point, vec2 center, vec2 size) {
  vec2 edge = abs(point - center) - size * 0.5;
  return 1.0 - smoothstep(-0.5, 0.5, max(edge.x, edge.y));
}
void main() {
  vec2 p = gl_FragCoord.xy / pixelRatio;
  vec2 size = resolution / pixelRatio;
  float padding = 18.0;
  float width = size.x - padding * 2.0;
  float middle = size.y * 0.5;
  float range = rect(p, vec2(size.x * 0.5, middle), vec2(width * tolerance / 50.0, size.y));
  float tickNumber = floor((p.x - padding) / width * 10.0 + 0.5);
  float tickX = padding + tickNumber * width / 10.0;
  float tickHeight = abs(tickNumber - 5.0) < 0.5 ? 44.0 : 32.0;
  float ticks = rect(p, vec2(tickX, 10.0 + tickHeight * 0.5), vec2(2.0, tickHeight));
  float needleX = padding + (cents + 50.0) / 100.0 * width;
  float needle = rect(p, vec2(needleX, middle), vec2(3.0, size.y - 24.0)) * valid;
  float alpha = max(range * 0.08, max(ticks * 0.2, needle));
  gl_FragColor = vec4(ink * alpha, alpha);
}
`

// Only redraw when values or dimensions change; an idle tuner uses no draw calls.
export function createPitchRenderer(canvas, onReady, invalidate = () => {}) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' })
  if (!gl) { onReady(false); return { draw() {}, destroy() {} } }
  let program
  let vertices
  let uniforms
  let available = false
  let lastKey = ''
  let cssWidth = canvas.clientWidth
  let cssHeight = canvas.clientHeight
  const resizeObserver = new ResizeObserver(([entry]) => {
    cssWidth = entry.contentRect.width
    cssHeight = entry.contentRect.height
    invalidate()
  })
  resizeObserver.observe(canvas)
  // Moving between screens can change pixel density without changing CSS size.
  window.addEventListener('resize', invalidate)
  function initialize() {
    const shaders = []
    try {
      for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
        const shader = gl.createShader(type)
        shaders.push(shader)
        gl.shaderSource(shader, source)
        gl.compileShader(shader)
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Shader compilation failed')
      }
      program = gl.createProgram()
      shaders.forEach((shader) => gl.attachShader(program, shader))
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Shader linking failed')
      gl.useProgram(program)
      vertices = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, vertices)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
      const position = gl.getAttribLocation(program, 'position')
      gl.enableVertexAttribArray(position)
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
      uniforms = Object.fromEntries(['resolution', 'pixelRatio', 'cents', 'tolerance', 'valid', 'ink'].map((name) => [name, gl.getUniformLocation(program, name)]))
      available = true
      lastKey = ''
    } catch {
      available = false
      if (vertices) gl.deleteBuffer(vertices)
      if (program) gl.deleteProgram(program)
    } finally {
      shaders.forEach((shader) => gl.deleteShader(shader))
      onReady(available)
    }
  }
  function lost(event) { event.preventDefault(); available = false; onReady(false) }
  canvas.addEventListener('webglcontextlost', lost)
  canvas.addEventListener('webglcontextrestored', initialize)
  initialize()
  return {
    draw({ cents, tolerance, valid, inTune, light }) {
      if (!available || document.hidden) return
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.round(cssWidth * ratio))
      const height = Math.max(1, Math.round(cssHeight * ratio))
      const key = `${width}/${height}/${ratio}/${cents}/${tolerance}/${valid}/${inTune}/${light}`
      if (key === lastKey) return
      lastKey = key
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
      gl.viewport(0, 0, width, height)
      gl.uniform2f(uniforms.resolution, width, height)
      gl.uniform1f(uniforms.pixelRatio, ratio)
      gl.uniform1f(uniforms.cents, cents)
      gl.uniform1f(uniforms.tolerance, tolerance)
      gl.uniform1f(uniforms.valid, valid ? 1 : 0)
      const ink = inTune ? [1, 1, 1] : light ? [0.125, 0.125, 0.125] : [0.933, 0.933, 0.933]
      gl.uniform3fv(uniforms.ink, ink)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
    destroy() {
      resizeObserver.disconnect()
      window.removeEventListener('resize', invalidate)
      canvas.removeEventListener('webglcontextlost', lost)
      canvas.removeEventListener('webglcontextrestored', initialize)
      gl.deleteBuffer(vertices)
      gl.deleteProgram(program)
    },
  }
}
