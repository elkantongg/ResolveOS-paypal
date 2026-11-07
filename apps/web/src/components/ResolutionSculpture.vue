<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import * as THREE from 'three';

const props = defineProps<{ progress: number; chapter: number; dark: boolean }>();
const host = ref<HTMLDivElement | null>(null);
let renderer: THREE.WebGLRenderer | undefined;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let rig: THREE.Group;
let gold: THREE.Mesh;
let goldPath: THREE.CatmullRomCurve3;
let surface: THREE.MeshPhysicalMaterial;
let accent: THREE.MeshStandardMaterial;
let floor: THREE.Mesh;
let raf = 0;
let last = 0;
let clock = 0;
let visible = true;
let reduced = false;
let observer: IntersectionObserver | undefined;
let resizeObserver: ResizeObserver | undefined;
const disposables: Array<{ dispose: () => void }> = [];

function tube(points: THREE.Vector3[], radius: number, material: THREE.Material) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const geometry = new THREE.TubeGeometry(curve, 100, radius, 14, false);
  disposables.push(geometry);
  return new THREE.Mesh(geometry, material);
}

function arcPoints(start: number, end: number, radius: number, depth = 0): THREE.Vector3[] {
  return Array.from({ length: 80 }, (_, i) => {
    const t = start + (end - start) * i / 79;
    return new THREE.Vector3(Math.cos(t) * radius, Math.sin(t) * radius, depth + .22 * Math.cos(t * 1.7));
  });
}

function createAmbientShadow() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(64,64,3,64,64,62);
  gradient.addColorStop(0,'rgba(40,39,90,.30)');
  gradient.addColorStop(.5,'rgba(67,56,120,.13)');
  gradient.addColorStop(1,'rgba(67,56,120,0)');
  context.fillStyle=gradient;
  context.fillRect(0,0,size,size);
  const texture = new THREE.CanvasTexture(canvas);
  disposables.push(texture);
  const geo = new THREE.PlaneGeometry(8.4,5.2);
  disposables.push(geo);
  const material = new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,opacity:.68});
  disposables.push(material);
  const mesh = new THREE.Mesh(geo,material);
  mesh.rotation.x=-Math.PI/2;
  mesh.position.set(.1,-2.95,-.8);
  scene.add(mesh);
  return mesh;
}

function makeScene() {
  const el = host.value!;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34,1,.1,100);
  camera.position.set(0,1.4,13.8);
  camera.lookAt(0,.1,0);
  renderer = new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.65;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-hidden','true');
  renderer.domElement.style.cssText='display:block;width:100%;height:100%';
  el.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xfafaff,0x7983be,2.3));
  const key = new THREE.DirectionalLight(0xffffff,4.8);
  key.position.set(-3.5,7,6);
  scene.add(key);
  const fill = new THREE.PointLight(0xc4b2ff,55,16,2);
  fill.position.set(4,1,3);
  scene.add(fill);
  const warm = new THREE.PointLight(0xffd9a1,22,13,2);
  warm.position.set(-2,2,6);
  scene.add(warm);

  rig=new THREE.Group();
  scene.add(rig);
  surface=new THREE.MeshPhysicalMaterial({
    color:0xf3f0ff,metalness:.13,roughness:.19,clearcoat:1,clearcoatRoughness:.13,
    transmission:.04,ior:1.45,side:THREE.DoubleSide
  });
  accent=new THREE.MeshStandardMaterial({
    color:0xf6bd55,metalness:.92,roughness:.16,envMapIntensity:2
  });
  disposables.push(surface,accent);

  // Two deliberate open sculptural loops; the shape reads as one continuous
  // pathway resolving into a circle, rather than a collection of random objects.
  const rear=tube(arcPoints(-.65,2.75,2.24,-.28),.23,surface);
  rear.rotation.y=-.27;
  rig.add(rear);
  const fore=tube(arcPoints(2.95,6.35,2.24,.36),.23,surface);
  fore.rotation.y=-.27;
  rig.add(fore);

  // A slim architectural axis passes through the open ring at an angle.
  const axisMaterial=new THREE.MeshPhysicalMaterial({
    color:0xb8afdb,metalness:.46,roughness:.25,clearcoat:.7
  });
  disposables.push(axisMaterial);
  const axisGeometry=new THREE.BoxGeometry(.09,5.6,.12);
  disposables.push(axisGeometry);
  const axis=new THREE.Mesh(axisGeometry,axisMaterial);
  axis.rotation.z=-.94;
  axis.position.set(.18,-.1,-.42);
  rig.add(axis);

  const goldGeo=new THREE.SphereGeometry(.35,48,32);
  disposables.push(goldGeo);
  gold=new THREE.Mesh(goldGeo,accent);
  rig.add(gold);
  goldPath=new THREE.CatmullRomCurve3(arcPoints(-.65,2.75,2.24,.15));
  gold.position.copy(goldPath.getPoint(.25));

  // Quiet, properly lit platform and a soft contact shadow.
  const baseGeo=new THREE.BoxGeometry(6.4,.10,4.2);
  disposables.push(baseGeo);
  const baseMat=new THREE.MeshStandardMaterial({color:0xe9e5f2,metalness:.04,roughness:.75,transparent:true,opacity:.35});
  disposables.push(baseMat);
  floor=new THREE.Mesh(baseGeo,baseMat);
  floor.position.set(.25,-3.05,-.6);
  floor.rotation.y=-.12;
  scene.add(floor);
  createAmbientShadow();
  resize();
  updatePalette();
}

function updatePalette() {
  if (!surface) return;
  surface.color.set(props.dark?0xbac9ed:0xf5f2ff);
  accent.color.set(props.dark?0xf3c16a:0xf7c46b);
  if(floor) (floor.material as THREE.MeshStandardMaterial).color.set(props.dark?0x263b62:0xe9e5f2);
}
function resize() {
  if(!renderer || !host.value || !camera)return;
  const w=Math.max(1,host.value.clientWidth);
  const h=Math.max(1,host.value.clientHeight);
  renderer.setSize(w,h,false);
  camera.aspect=w/h;
  camera.position.z=w<540?16.8:13.8;
  camera.updateProjectionMatrix();
}
function animate(time:number) {
  const delta=last?Math.min((time-last)/1000,.05):0;
  last=time;
  if(!reduced && visible) clock+=delta;
  if(rig) {
    const p=props.progress;
    const turn=reduced?0:Math.sin(clock*.31)*.10;
    rig.rotation.y=turn+p*.24;
    rig.rotation.z=(reduced?0:Math.sin(clock*.23)*.045)+p*.09;
    rig.position.y=(reduced?0:Math.sin(clock*.42)*.12)-p*.16;
    rig.scale.setScalar(1+p*.035);
    const t=(.12+clock*.055)%1;
    gold.position.copy(goldPath.getPoint(t));
    gold.position.z+=.28;
    gold.rotation.y=clock*.8;
  }
  if(renderer&&scene&&camera&&visible)renderer.render(scene,camera);
  raf=requestAnimationFrame(animate);
}
onMounted(()=>{
  reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    makeScene();
    observer=new IntersectionObserver(entries=>{visible=Boolean(entries[0]?.isIntersecting);});
    observer.observe(host.value!);
    resizeObserver=new ResizeObserver(resize);
    resizeObserver.observe(host.value!);
    raf=requestAnimationFrame(animate);
  } catch (e) {
    console.warn('ResolveOS 3D presentation unavailable; using static fallback.',e);
    host.value?.classList.add('webgl-unavailable');
  }
});
watch(()=>props.dark,()=>updatePalette());
onBeforeUnmount(()=>{
  cancelAnimationFrame(raf);
  observer?.disconnect();
  resizeObserver?.disconnect();
  disposables.forEach(item=>item.dispose());
  renderer?.dispose();
  renderer?.domElement.remove();
});
</script>

<template>
  <div ref="host" class="sculpture-host">
    <div class="sculpture-fallback" aria-hidden="true">
      <span class="fallback-ring" /><span class="fallback-gold" />
    </div>
  </div>
</template>

<style scoped>
.sculpture-host {width:100%;height:100%;position:relative;isolation:isolate;overflow:hidden}
.sculpture-host canvas {position:relative;z-index:2}
.sculpture-fallback {display:none;position:absolute;inset:15%;align-items:center;justify-content:center;transform:rotate(-18deg)}
.webgl-unavailable .sculpture-fallback {display:flex}
.fallback-ring {width:min(50vw,370px);aspect-ratio:1;border:42px solid #e5dff5;border-radius:50%;box-shadow:20px 30px 50px #7f82b340,inset 10px 5px 20px #fff}
.fallback-gold {position:absolute;left:62%;top:12%;width:44px;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 30% 25%,#fff7c8,#eeaa36 52%,#ab6610);box-shadow:9px 14px 23px #7d5c2d54}
@media(prefers-reduced-motion:reduce){.sculpture-host *{animation:none!important}}
</style>
