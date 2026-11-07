<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';

const canvas = ref<HTMLCanvasElement | null>(null);
const supported = ref(true);
let frame = 0;
let observer: ResizeObserver | null = null;
let gl: WebGLRenderingContext | null = null;
let vertexBuffer: WebGLBuffer | null = null;
let logoTexture: WebGLTexture | null = null;
let program: WebGLProgram | null = null;
let vertices = 0;
let start = 0;

const vertexSource = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aUv;
attribute float aFront;
uniform float uTime;
uniform float uAspect;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;
varying float vFront;
void main(){
  float rx = -0.23 + 0.15 * sin(uTime * 0.32);
  float ry = -0.38 + 0.23 * sin(uTime * 0.26 + 0.4);
  float rz = 0.055 * sin(uTime * 0.18);
  mat3 mx = mat3(1.,0.,0., 0.,cos(rx),sin(rx), 0.,-sin(rx),cos(rx));
  mat3 my = mat3(cos(ry),0.,-sin(ry), 0.,1.,0., sin(ry),0.,cos(ry));
  mat3 mz = mat3(cos(rz),sin(rz),0., -sin(rz),cos(rz),0., 0.,0.,1.);
  mat3 rot = mz * my * mx;
  vec3 p = rot * aPosition;
  vPosition = p;
  vNormal = normalize(rot * aNormal);
  vUv = aUv;
  vFront = aFront;
  float depth = 4.8 - p.z;
  vec2 projected = p.xy * (2.55 / depth);
  projected.x /= max(0.65,uAspect);
  gl_Position = vec4(projected, (p.z / 6.) , 1.);
}`;
const fragmentSource = `
precision mediump float;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;
varying float vFront;
uniform sampler2D uLogo;
void main(){
  vec3 n = normalize(vNormal);
  vec3 light = normalize(vec3(-0.55,0.95,1.6));
  float diffuse = max(dot(n,light),0.);
  float front = clamp(0.58 + n.z * 0.12,0.,1.);
  vec3 base = mix(vec3(.035,.135,.34),vec3(.16,.40,.84),0.46 + diffuse * .42);
  base += vec3(.042,.10,.17) * front;
  vec3 reflected = reflect(-light,n);
  float spec = pow(max(dot(reflected,normalize(vec3(.1,.1,1.))),0.),30.);
  float rim = pow(1. - max(dot(n,vec3(0.,0.,1.)),0.),2.5);
  vec3 color = base + spec * vec3(.35,.58,.9) + rim * vec3(.07,.16,.29);
  vec4 mark = texture2D(uLogo,vUv);
  if (vFront > .5) color = mix(color,mark.rgb * (.82 + diffuse * .32),mark.a);
  gl_FragColor = vec4(color,1.);
}`;

function compile(type: number, source: string): WebGLShader {
  const context = gl!;
  const shader = context.createShader(type);
  if (!shader) throw new Error('Unable to allocate shader');
  context.shaderSource(shader, source);
  context.compileShader(shader);
  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    const error = context.getShaderInfoLog(shader);
    context.deleteShader(shader);
    throw new Error(error || 'Shader compilation failed');
  }
  return shader;
}
function buildMesh(): Float32Array {
  const data: number[] = [];
  const segments = 30;
  const radius = 0.30;
  type Vec = [number,number,number];
  function corner(face:number,u:number,v:number) {
    let p: Vec;
    // All faces use the same surface UV orientation; the front is +Z.
    switch(face){
      case 0:p=[u,v,1];break;
      case 1:p=[-u,v,-1];break;
      case 2:p=[1,v,-u];break;
      case 3:p=[-1,v,u];break;
      case 4:p=[u,1,-v];break;
      default:p=[u,-1,v];
    }
    const inner = 1-radius;
    const c = p.map(n=>Math.max(-inner,Math.min(inner,n))) as Vec;
    const d = p.map((n,i)=>n-c[i]!) as Vec;
    const len = Math.hypot(...d)||1;
    const normal = d.map(n=>n/len) as Vec;
    const position = c.map((n,i)=>n+normal[i]!*radius) as Vec;
    return [...position,...normal,(u+1)/2,(v+1)/2,face===0?1:0];
  }
  function tri(a:number[],b:number[],c:number[]) { data.push(...a,...b,...c); }
  for(let face=0;face<6;face++) {
    for(let y=0;y<segments;y++){
      for(let x=0;x<segments;x++){
        const u0=-1+2*x/segments,u1=-1+2*(x+1)/segments;
        const v0=-1+2*y/segments,v1=-1+2*(y+1)/segments;
        const a=corner(face,u0,v0),b=corner(face,u1,v0),c=corner(face,u1,v1),d=corner(face,u0,v1);
        tri(a,b,c);tri(a,c,d);
      }
    }
  }
  return new Float32Array(data);
}
function createLogo(): HTMLCanvasElement {
  const texture = document.createElement('canvas');
  texture.width=256; texture.height=256;
  const ctx=texture.getContext('2d')!;
  ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=18;
  ctx.strokeStyle='#f0f9ff';
  ctx.beginPath();
  ctx.moveTo(65,98);ctx.lineTo(129,98);ctx.bezierCurveTo(162,98,162,151,129,151);ctx.lineTo(87,151);ctx.stroke();
  ctx.strokeStyle='#56e0cb';
  ctx.beginPath();
  ctx.moveTo(191,158);ctx.lineTo(127,158);ctx.bezierCurveTo(94,158,94,105,127,105);ctx.lineTo(169,105);ctx.stroke();
  return texture;
}
function initialize() {
  const element=canvas.value;
  if(!element)return;
  const context=element.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false});
  if(!context){supported.value=false;return;}
  gl=context;
  const vs=compile(context.VERTEX_SHADER,vertexSource);
  const fs=compile(context.FRAGMENT_SHADER,fragmentSource);
  const shaderProgram=context.createProgram();
  if(!shaderProgram)throw new Error('Unable to create program');
  context.attachShader(shaderProgram,vs);
  context.attachShader(shaderProgram,fs);
  context.linkProgram(shaderProgram);
  context.deleteShader(vs);context.deleteShader(fs);
  if(!context.getProgramParameter(shaderProgram,context.LINK_STATUS)) throw new Error(context.getProgramInfoLog(shaderProgram)||'Link failed');
  program=shaderProgram;
  context.useProgram(program);
  vertexBuffer=context.createBuffer();
  context.bindBuffer(context.ARRAY_BUFFER,vertexBuffer);
  const points=buildMesh();vertices=points.length/9;
  context.bufferData(context.ARRAY_BUFFER,points,context.STATIC_DRAW);
  const stride=9*4;
  const attrs=[['aPosition',3,0],['aNormal',3,12],['aUv',2,24],['aFront',1,32]] as const;
  for(const [name,size,offset] of attrs){
    const loc=context.getAttribLocation(program,name);
    if(loc<0)continue;
    context.enableVertexAttribArray(loc);
    context.vertexAttribPointer(loc,size,context.FLOAT,false,stride,offset);
  }
  logoTexture=context.createTexture();
  context.activeTexture(context.TEXTURE0);
  context.bindTexture(context.TEXTURE_2D,logoTexture);
  context.texImage2D(context.TEXTURE_2D,0,context.RGBA,context.RGBA,context.UNSIGNED_BYTE,createLogo());
  context.texParameteri(context.TEXTURE_2D,context.TEXTURE_MIN_FILTER,context.LINEAR);
  context.texParameteri(context.TEXTURE_2D,context.TEXTURE_MAG_FILTER,context.LINEAR);
  context.texParameteri(context.TEXTURE_2D,context.TEXTURE_WRAP_S,context.CLAMP_TO_EDGE);
  context.texParameteri(context.TEXTURE_2D,context.TEXTURE_WRAP_T,context.CLAMP_TO_EDGE);
  context.uniform1i(context.getUniformLocation(program,'uLogo'),0);
  context.enable(context.DEPTH_TEST);
  context.depthFunc(context.LEQUAL);
  observer=new ResizeObserver(()=>{
    const dpr=Math.min(window.devicePixelRatio||1,2);
    const width=Math.max(1,Math.round(element.clientWidth*dpr));
    const height=Math.max(1,Math.round(element.clientHeight*dpr));
    if(element.width!==width||element.height!==height){element.width=width;element.height=height}
    context.viewport(0,0,width,height);
  });
  observer.observe(element);
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  start=performance.now();
  function render(now:number){
    if(!gl||!program||!canvas.value)return;
    context.viewport(0,0,element.width,element.height);
    context.clearColor(0,0,0,0);
    context.clear(context.COLOR_BUFFER_BIT|context.DEPTH_BUFFER_BIT);
    context.useProgram(program);
    context.uniform1f(context.getUniformLocation(program,'uTime'),motion.matches?1:(now-start)/1000);
    context.uniform1f(context.getUniformLocation(program,'uAspect'),element.width/Math.max(1,element.height));
    context.drawArrays(context.TRIANGLES,0,vertices);
    if(!motion.matches)frame=requestAnimationFrame(render);
  }
  frame=requestAnimationFrame(render);
}
onMounted(()=>{try{initialize()}catch(error){console.warn('Rounded cube unavailable',error);supported.value=false;}});
onBeforeUnmount(()=>{
  cancelAnimationFrame(frame);observer?.disconnect();
  if(gl){if(vertexBuffer)gl.deleteBuffer(vertexBuffer);if(logoTexture)gl.deleteTexture(logoTexture);if(program)gl.deleteProgram(program)}
  gl=null;
});
</script>

<template>
  <canvas v-if="supported" ref="canvas" class="rounded-resolve-cube" aria-hidden="true" />
  <div v-else class="rounded-cube-fallback" aria-hidden="true">
    <svg viewBox="0 0 32 32"><path d="M8.5 11.5h7.5a3.5 3.5 0 0 1 0 7H11" stroke="white" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M23.5 20.5H16a3.5 3.5 0 0 1 0-7H21" stroke="#56e0cb" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>
  </div>
</template>

<style scoped>
.rounded-resolve-cube{position:absolute;inset:-80%;width:260%;height:260%;display:block;pointer-events:none;filter:drop-shadow(0 0 11px #4195ff8f)}
.rounded-cube-fallback{position:absolute;inset:0;border-radius:25%;background:linear-gradient(140deg,#457fd0,#103266);box-shadow:inset -12px -12px 20px #071c4a,0 0 20px #3d8dee;display:grid;place-items:center}
.rounded-cube-fallback svg{width:55%}
</style>
