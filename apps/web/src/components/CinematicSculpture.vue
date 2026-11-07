<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{ time: number; scroll: number; paused: boolean; dark: boolean }>();
const canvas = ref<HTMLCanvasElement | null>(null);
let gl: WebGLRenderingContext | null = null;
let program: WebGLProgram | null = null;
let resizeObserver: ResizeObserver | null = null;
let vertexBuffer: WebGLBuffer | null = null;
let normalBuffer: WebGLBuffer | null = null;
let colorBuffer: WebGLBuffer | null = null;
let vertexCount = 0;
let pointerX = 0;
let pointerY = 0;
const positions: number[] = [];
const normals: number[] = [];
const colors: number[] = [];

type Vec = [number, number, number];
function subtract(a: Vec, b: Vec): Vec { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a: Vec, b: Vec): Vec { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function normalize(a: Vec): Vec { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function add(a: Vec, b: Vec): Vec { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function mul(a: Vec, s: number): Vec { return [a[0] * s, a[1] * s, a[2] * s]; }
function vertex(p: Vec, n: Vec, c: Vec) { positions.push(...p); normals.push(...n); colors.push(...c); }
function tri(a: Vec, b: Vec, c: Vec, shade: Vec) {
  const n = normalize(cross(subtract(b, a), subtract(c, a)));
  vertex(a, n, shade); vertex(b, n, shade); vertex(c, n, shade);
}
function quad(a: Vec, b: Vec, c: Vec, d: Vec, shade: Vec) {
  tri(a, b, c, shade); tri(a, c, d, shade);
}
// A solid, continuously twisted metallic ribbon with shaded front, back and edges.
// Geometry is real 3D, not a flattened CSS transform.
function ribbon(seed: number, radius: number, width: number, shade: Vec) {
  const sections = 240;
  const point = (t: number): Vec => {
    const r = radius + .19 * Math.cos(3 * t + seed);
    return [r * Math.cos(t), .84 * r * Math.sin(t), .22 * Math.sin(3 * t + seed)];
  };
  for (let i = 0; i < sections; i++) {
    const t = (i / sections) * Math.PI * 2;
    const u = ((i + 1) / sections) * Math.PI * 2;
    const band = (angle: number, side: number, depth: number): Vec => {
      const p = point(angle);
      const tangent = normalize(subtract(point(angle + .001), point(angle - .001)));
      const binormal = normalize(cross(tangent, [0, 0, 1]));
      const normal = normalize(cross(binormal, tangent));
      const twist = angle * 1.5 + seed;
      const across = add(mul(binormal, Math.cos(twist)), mul(normal, Math.sin(twist)));
      const face = normalize(cross(tangent, across));
      return add(add(p, mul(across, width * side)), mul(face, depth));
    };
    const thick = .028;
    quad(band(t, -1, thick), band(u, -1, thick), band(u, 1, thick), band(t, 1, thick), shade);
    quad(band(t, 1, -thick), band(u, 1, -thick), band(u, -1, -thick), band(t, -1, -thick), mul(shade, .80));
    quad(band(t, -1, -thick), band(u, -1, -thick), band(u, -1, thick), band(t, -1, thick), mul(shade, .65));
    quad(band(t, 1, thick), band(u, 1, thick), band(u, 1, -thick), band(t, 1, -thick), mul(shade, .75));
  }
}
function sphere(origin: Vec, radius: number, shade: Vec) {
  const rings = 26, segments = 48;
  const at = (a: number, b: number): Vec => [
    origin[0] + radius * Math.sin(a) * Math.cos(b),
    origin[1] + radius * Math.cos(a),
    origin[2] + radius * Math.sin(a) * Math.sin(b),
  ];
  for (let y = 0; y < rings; y++) for (let x = 0; x < segments; x++) {
    const a = y / rings * Math.PI, b = (y + 1) / rings * Math.PI;
    const c = x / segments * Math.PI * 2, d = (x + 1) / segments * Math.PI * 2;
    quad(at(a, c), at(b, c), at(b, d), at(a, d), shade);
  }
}
function rod(a: Vec, b: Vec, radius: number, shade: Vec) {
  const axis = normalize(subtract(b, a));
  const x = normalize(cross(axis, [0, 0, 1]));
  const y = normalize(cross(axis, x));
  const at = (p: Vec, t: number): Vec => add(p, add(mul(x, radius * Math.cos(t)), mul(y, radius * Math.sin(t))));
  for (let i = 0; i < 28; i++) {
    const t = 2 * Math.PI * i / 28, u = 2 * Math.PI * (i + 1) / 28;
    quad(at(a, t), at(b, t), at(b, u), at(a, u), shade);
  }
}
const vertexShader = `
attribute vec3 position;
attribute vec3 normal;
attribute vec3 shade;
uniform float time;
uniform float scroll;
uniform vec2 viewport;
uniform vec2 cursor;
varying vec3 vNormal;
varying vec3 vShade;
varying vec3 vPosition;
void main() {
  float phase = time * 6.28318530718 / 14.0;
  float turn = phase + scroll * .43;
  float tilt = .18 * sin(phase);
  vec3 p = position;
  float a = turn + cursor.x * .14;
  p = vec3(p.x*cos(a)+p.z*sin(a), p.y, -p.x*sin(a)+p.z*cos(a));
  p = vec3(p.x, p.y*cos(tilt)-p.z*sin(tilt), p.y*sin(tilt)+p.z*cos(tilt));
  vec3 n = normal;
  n = vec3(n.x*cos(a)+n.z*sin(a),n.y,-n.x*sin(a)+n.z*cos(a));
  n = vec3(n.x,n.y*cos(tilt)-n.z*sin(tilt),n.y*sin(tilt)+n.z*cos(tilt));
  vNormal = normalize(n);
  vShade = shade;
  vPosition = p;
  float aspect = viewport.x / viewport.y;
  float projection = 2.35 / (5.1 - p.z);
  gl_Position = vec4(p.x * projection / aspect, p.y * projection, -p.z * .075, 1.0);
}`;
const fragmentShader = `
precision highp float;
uniform float dark;
varying vec3 vNormal;
varying vec3 vShade;
varying vec3 vPosition;
void main() {
 vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
 vec3 l1 = normalize(vec3(-.55,.85,1.4));
 vec3 l2 = normalize(vec3(.9,-.4,.7));
 vec3 view = normalize(vec3(0.,0.,1.));
 float diffuse = max(dot(n,l1),0.);
 float rim = pow(1.0-max(dot(n,view),0.),2.2);
 float shine = pow(max(dot(reflect(-l1,n),view),0.),44.);
 float shine2 = pow(max(dot(reflect(-l2,n),view),0.),18.);
 vec3 base = vShade * (.48 + diffuse * .43 + max(dot(n,l2),0.) * .19);
 base += vec3(.92,.94,1.) * shine * 1.05 + vec3(.48,.53,.87) * shine2 * .36;
 base += mix(vec3(.26,.3,.56),vec3(.42,.49,.7),dark) * rim * .25;
 gl_FragColor = vec4(min(base,vec3(1.)),1.);
}`;
function compile(type: number, source: string): WebGLShader | null {
  if (!gl) return null;
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Sculpture shader error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader); return null;
  }
  return shader;
}
function init() {
  if (!canvas.value) return;
  gl = canvas.value.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
  if (!gl) return;
  const vs = compile(gl.VERTEX_SHADER, vertexShader);
  const fs = compile(gl.FRAGMENT_SHADER, fragmentShader);
  if (!vs || !fs) return;
  program = gl.createProgram();
  if (!program) return;
  gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { console.error('Sculpture program error:', gl.getProgramInfoLog(program)); return; }
  gl.deleteShader(vs); gl.deleteShader(fs);
  // Two pearlescent loops + an understated gold accent echo the reference.
  ribbon(.35, 1.1, .20, [.77,.76,.95]);
  ribbon(2.3, .83, .14, [.58,.48,.91]);
  sphere([.17,.04,.47], .30, [1.,.73,.29]);
  rod([-1.25,-.85,-.46],[1.18,1.00,.52], .037, [.79,.66,.96]);
  vertexCount = positions.length / 3;
  const attributes = [
    { name: 'position', data: positions },
    { name: 'normal', data: normals },
    { name: 'shade', data: colors },
  ];
  for (const attr of attributes) {
    const buffer = gl.createBuffer();
    if (!buffer) continue;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(attr.data), gl.STATIC_DRAW);
    const location = gl.getAttribLocation(program, attr.name);
    if (location >= 0) { gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0); }
    if (attr.name === 'position') vertexBuffer = buffer;
    if (attr.name === 'normal') normalBuffer = buffer;
    if (attr.name === 'shade') colorBuffer = buffer;
  }
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas.value);
  resize();
  render();
}
function resize() {
  if (!canvas.value || !gl) return;
  const w = canvas.value.clientWidth, h = canvas.value.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.7);
  canvas.value.width = Math.max(1, Math.round(w * dpr));
  canvas.value.height = Math.max(1, Math.round(h * dpr));
  gl.viewport(0, 0, canvas.value.width, canvas.value.height);
  render();
}
function render() {
  if (!gl || !program || !canvas.value) return;
  gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(program);
  gl.uniform1f(gl.getUniformLocation(program, 'time'), props.time);
  gl.uniform1f(gl.getUniformLocation(program, 'scroll'), props.scroll);
  gl.uniform1f(gl.getUniformLocation(program, 'dark'), props.dark ? 1 : 0);
  gl.uniform2f(gl.getUniformLocation(program, 'cursor'), pointerX, pointerY);
  gl.uniform2f(gl.getUniformLocation(program, 'viewport'), canvas.value.width, canvas.value.height);
  gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
}
function onPointer(event: PointerEvent) {
  if (!canvas.value) return;
  const rect = canvas.value.getBoundingClientRect();
  pointerX = ((event.clientX - rect.left) / rect.width - .5) * 2;
  pointerY = ((event.clientY - rect.top) / rect.height - .5) * 2;
  render();
}
watch(() => [props.time, props.scroll, props.dark], render);
onMounted(init);
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (gl) {
    for (const buffer of [vertexBuffer, normalBuffer, colorBuffer]) if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
  }
});
</script>

<template>
  <canvas ref="canvas" class="sculpture-canvas" aria-hidden="true" @pointermove="onPointer" />
</template>

<style scoped>
.sculpture-canvas {width:100%;height:100%;display:block;touch-action:pan-y;pointer-events:auto;}
@media (prefers-reduced-motion:reduce) {.sculpture-canvas{pointer-events:none}}
</style>
