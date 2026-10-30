// The room: baked-lighting meshes shown unlit, a fixed seat at the desk, a monitor you can
// sit up to and use, and speakers that play from where they are.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { RoomAudio } from './audio.js';

// Blender's "AgX - Punchy" look: three's AgX plus the same look step Blender applies
// (power 1.35, saturation 1.4 in AgX log space), so the browser matches the Cycles preview
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
  'color = agxDefaultContrastApprox( color );',
  `color = agxDefaultContrastApprox( color );
  #ifdef AGX_PUNCHY
  {
    float luma = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
    color = pow( max( color, vec3( 0.0 ) ), vec3( 1.35 ) );
    color = luma + 1.4 * ( color - luma );
  }
  #endif
  #ifdef AGX_MOOD
  {
    // a gentle version of the same idea: a little contrast and colour, no crushing
    float luma = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
    color = pow( max( color, vec3( 0.0 ) ), vec3( 1.12 ) );
    color = luma + 1.06 * ( color - luma );
  }
  #endif`);

const $ = (id) => document.getElementById(id);
const coarse = matchMedia('(pointer: coarse)').matches;
// phones and tablets get half-size textures; ?q=hi / ?q=lo overrides for testing
const tier = new URLSearchParams(location.search).get('q') || (coarse ? 'lo' : 'hi');

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;          // same view transform as the Blender scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07060a);         // night
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.02, 30);
scene.add(camera);
const audio = new RoomAudio(camera);

// ------------------------------------------------------------------ loading
const manager = new THREE.LoadingManager();
manager.onProgress = (_, done, total) => { $('bar').firstElementChild.style.width = `${(done / total) * 100}%`; };
const texLoader = new THREE.TextureLoader(manager);
const v = `?v=${Date.now()}`;
const manifest = await (await fetch(`assets/manifest.json${v}`)).json();
// a touch under Blender's exposure: the room should sit in the dark, not glow
const MOOD_EV = 0;   // exposure now set in Blender (manifest.exposure)
renderer.toneMappingExposure = Math.pow(2, (manifest.exposure ?? 0) + MOOD_EV);
const params = new URLSearchParams(location.search);
// Plain AgX. The Punchy look (an approximation of Blender's) crushed the shadows and pushed
// everything red; ?look=punchy brings it back for comparison.
const punchy = params.get('look') === 'punchy';
const logK = manifest.logK ?? 0;   // 0: old bakes, light maps are plain sRGB
// colour maps are sRGB (the GPU decodes them); log-encoded light maps are decoded in the shader
const tex = (files, linear = false) => {
  const t = texLoader.load(`assets/${files[tier]}${v}`);
  t.flipY = false;
  t.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
};
const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
black.needsUpdate = true;

// surface colour x (room light + the monitor's light) + emission; the renderer adds AgX + sRGB.
// The monitor's light is baked on its own, as if the screen showed the desktop, and scaled
// live by screenTint: dark while the PC boots, Bliss-coloured on the desktop.
const time = { value: 0 };
const screenTint = { value: new THREE.Color(0, 0, 0) };
// a dim, warm fill, like a 40 W bulb somewhere behind you: just enough that the room isn't a
// black void, fading with distance so the lamp and the screen still do the lighting.
// Added here rather than baked, so it can be tuned without a re-bake; positioned below.
const FILL = { color: new THREE.Color(1.0, 0.68, 0.42), strength: 0.02, radius: 1.6 };
const fill = {
  fillColor: { value: FILL.color.clone().multiplyScalar(FILL.strength) },
  fillPos: { value: new THREE.Vector3() },
  fillRadius: { value: FILL.radius },
};
const materials = {};
for (const [group, g] of Object.entries(manifest.groups)) {
  materials[group] = new THREE.ShaderMaterial({
    defines: { ...(logK ? { LOG_LIGHT: 1 } : {}), ...(punchy ? { AGX_PUNCHY: 1 } : { AGX_MOOD: 1 }) },
    uniforms: {
      albedo: { value: tex(g.albedo) },
      light: { value: tex(g.light, !!logK) },
      emit: { value: g.emit ? tex(g.emit, !!logK) : black },
      screen: { value: g.screen ? tex(g.screen, !!logK) : black },
      lightScale: { value: g.lightScale },
      emitScale: { value: g.emitScale ?? 0 },
      screenScale: { value: g.screenScale ?? 0 },
      screenTint,
      ...fill,
      alpha: { value: 1 },
      logK: { value: logK },
      time,
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D albedo, light, emit, screen;
      uniform float lightScale, emitScale, screenScale, logK, time, alpha;
      uniform vec3 screenTint, fillColor, fillPos;
      uniform float fillRadius;
      varying vec2 vUv;
      varying vec3 vWorld;
      vec3 hdr(sampler2D t, float scale) {
        vec3 e = texture2D(t, vUv).rgb;
        #ifdef LOG_LIGHT
          return (exp2(e * log2(1.0 + logK)) - 1.0) / logK * scale;
        #else
          return e * scale;
        #endif
      }
      void main() {
        vec3 L = hdr(light, lightScale) + hdr(screen, screenScale) * screenTint;
        float fd = distance(vWorld, fillPos) / fillRadius;
        L += fillColor / (1.0 + fd * fd);
        vec3 c = texture2D(albedo, vUv).rgb * L + hdr(emit, emitScale);
        gl_FragColor = vec4(c, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
const gltf = await new GLTFLoader(manager).loadAsync(`assets/room.glb${v}`);
scene.add(gltf.scene);
scene.updateMatrixWorld(true);

const named = {};
gltf.scene.traverse((o) => {
  if (!o.isMesh) return;
  named[o.name] = o;
  const g = manifest.objects[o.name];
  if (g) o.material = materials[g];
});

// ------------------------------------------------------------------ the pedestal fan
// The Havells fan on the left is running, and its head sweeps slowly side to side the way
// these fans do, about 70 degrees end to end every ~14 s, easing at each end.
// A real fan does ~20 turns a second, which a 60 Hz screen can't show (three blades, a third
// of a turn per frame: it would look parked), so the blades turn at a speed the eye reads as
// fast, with a few fading copies trailing behind them as motion blur.
const FAN_RUNNING = true;
const FAN_SPEED = 2.6 * Math.PI * 2;          // blade turns, radians a second
const SWEEP = 0;                              // fixed, pointing at the chair (was 35° each way)
const SWEEP_PERIOD = 14;                      // seconds for a full left-right-left
const fanHead = named.Fan_Head;
const fanBlur = [];
if (FAN_RUNNING && fanHead && named.Fan_Blades) {
  const blades = named.Fan_Blades;
  fanHead.attach(blades);                     // blades ride on the head as it turns
  const BLUR = 5, STEP = 0.07;                // copies, and the angle between them
  for (let i = 1; i <= BLUR; i++) {
    const ghost = blades.clone();
    ghost.material = blades.material.clone();
    ghost.material.uniforms = THREE.UniformsUtils.clone(blades.material.uniforms);
    for (const k of ['albedo', 'light', 'emit', 'screen']) ghost.material.uniforms[k].value = blades.material.uniforms[k].value;
    ghost.material.uniforms.screenTint = screenTint;
    ghost.material.uniforms.alpha.value = 0.32 * (1 - i / (BLUR + 1));
    ghost.material.transparent = true;
    ghost.material.depthWrite = false;
    fanHead.add(ghost);
    fanBlur.push({ mesh: ghost, lag: i * STEP });
  }
  fanBlur.unshift({ mesh: blades, lag: 0 });
  for (const b of fanBlur) b.base = b.mesh.quaternion.clone();
}
const headBase = fanHead ? fanHead.quaternion.clone() : null;
const FAN_AXIS = new THREE.Vector3(0, 0, -1);  // Blender's local y (the fan's axis) is glTF's local -z
const UP = new THREE.Vector3(0, 1, 0);         // the swivel turns about the vertical
const spinQ = new THREE.Quaternion(), sweepQ = new THREE.Quaternion();
function runFan(t) {
  if (!fanBlur.length) return;
  sweepQ.setFromAxisAngle(UP, SWEEP * Math.sin((t / SWEEP_PERIOD) * Math.PI * 2));
  fanHead.quaternion.copy(sweepQ).multiply(headBase);
  for (const b of fanBlur) {
    spinQ.setFromAxisAngle(FAN_AXIS, t * FAN_SPEED - b.lag);
    b.mesh.quaternion.copy(b.base).multiply(spinQ);
  }
}

// ------------------------------------------------------------------ the Ajanta clock
// Keeps the visitor's real local time. The hands were baked pointing at 12; each turns about
// the clock's face (Blender's local y = glTF's local -z), clockwise as seen from the room.
// The second hand steps once a second like a quartz movement, with a tiny settle.
const clockHands = ['Clock_Hand_Hour', 'Clock_Hand_Minute', 'Clock_Hand_Second']
  .map((n) => named[n]).filter(Boolean).map((mesh) => ({ mesh, base: mesh.quaternion.clone() }));
const CLOCK_AXIS = new THREE.Vector3(0, 0, -1);
const handQ = new THREE.Quaternion();
let lastSecond = -1;
function runClock(onTick) {
  if (clockHands.length !== 3) return;
  const now = new Date();
  const ms = now.getMilliseconds(), s = now.getSeconds(), m = now.getMinutes(), h = now.getHours() % 12;
  // the step: snaps to the new second in ~60 ms, overshoots a hair and settles
  const k = Math.min(ms / 60, 1);
  const settle = k < 1 ? k * k * 1.06 : 1 + 0.06 * Math.exp(-(ms - 60) / 25) * Math.cos((ms - 60) / 18);
  const sec = s - 1 + Math.min(settle, 1.06);
  const angles = [
    ((h + m / 60 + s / 3600) / 12) * Math.PI * 2,
    ((m + s / 60) / 60) * Math.PI * 2,
    (sec / 60) * Math.PI * 2,
  ];
  clockHands.forEach((hand, i) => {
    handQ.setFromAxisAngle(CLOCK_AXIS, angles[i]);
    hand.mesh.quaternion.copy(hand.base).multiply(handQ);
  });
  if (s !== lastSecond) { if (lastSecond >= 0) onTick(); lastSecond = s; }
}

// ------------------------------------------------------------------ the monitor's screen
// The running PC (web/pc, built from pc/) sits on the screen itself, in a CSS 3D layer laid
// exactly over the panel: whatever it's doing (BIOS, boot, windows, Winamp) is what you see,
// from the chair or up close. A black plane underneath catches clicks while you're seated.
const screenBox = new THREE.Box3().setFromObject(named.VA_Screen);
named.VA_Screen.visible = false;
const sSize = screenBox.getSize(new THREE.Vector3());
const sCenter = screenBox.getCenter(new THREE.Vector3());
sCenter.z = screenBox.max.z + 0.0004;
const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(sSize.x, sSize.y),
  new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }));
screenMesh.position.copy(sCenter);
screenMesh.name = 'Screen';
scene.add(screenMesh);

const SCREEN_W = 1024, SCREEN_H = 640;          // the PC's resolution, in CSS px
const iframe = $('screen');
const cssScene = new THREE.Scene();
const cssRenderer = new CSS3DRenderer();
cssRenderer.domElement.id = 'css3d';
document.body.insertBefore(cssRenderer.domElement, $('gl').nextSibling);
const monitorEl = $('monitor');          // the PC plus the LCD-era layers on top (index.html)
const screenObj = new CSS3DObject(monitorEl);
monitorEl.style.pointerEvents = 'none';   // CSS3DObject forces 'auto'; clicks go to the room unless the PC is in use
screenObj.position.copy(sCenter);
screenObj.scale.set(sSize.x / SCREEN_W, sSize.y / SCREEN_H, 1);
cssScene.add(screenObj);
// load the PC only now: moving an iframe in the page (as CSS3DObject just did) reloads it
iframe.src = iframe.dataset.src;
let pcPhase = 'off';
const DESK_TOP = 0.75;                    // height of the desk top, in metres

// ------------------------------------------------------------------ light off the screen
// A few times a second the PC hands over a ~96 px snapshot of its screen. Its average colour,
// against the colour of the image the glow was baked with, scales the baked monitor light
// (that soft spill is all the rough laminate shows; no mirror-like reflection).
const tintTarget = new THREE.Color(0, 0, 0);
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function averageLinear(source, w, h) {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 10;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(source, 0, 0, w, h, 0, 0, 16, 10);
  const d = x.getImageData(0, 0, 16, 10).data, sum = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += toLinear(d[i + k] / 255);
  return sum.map((s) => s / (d.length / 4));
}
// the glow was baked with Bliss on the screen
let reference = [0.25, 0.35, 0.45];
const bliss = new Image();
bliss.src = 'pc/xp/bliss.jpg';
bliss.onload = () => { reference = averageLinear(bliss, bliss.naturalWidth, bliss.naturalHeight); };

async function sampleScreen() {
  try { await sampleOnce(); } catch (e) { console.warn('screen sample failed', e); }
  setTimeout(sampleScreen, coarse ? 400 : 250);   // keep going whatever happened
}
async function sampleOnce() {
  let shot = null;
  try {
    // a capture can outlive the page it was asked of (the PC reloading): never wait forever
    shot = await Promise.race([iframe.contentWindow?.__capture?.(96),
      new Promise((r) => setTimeout(() => r(null), 2000))]);
  } catch { /* PC still loading */ }
  if (shot && shot.width) {
    const avg = averageLinear(shot, shot.width, shot.height);
    tintTarget.setRGB(...avg.map((a, k) => Math.min(a / Math.max(reference[k], 1e-3), 2.5)));
    // the haze around the panel takes the screen's colour, stronger the brighter it is
    const lum = 0.2126 * avg[0] + 0.7152 * avg[1] + 0.0722 * avg[2];
    const peak = Math.max(...avg, 1e-3);
    const [r, g, b] = avg.map((a) => Math.round(255 * Math.pow(a / peak, 1 / 2.2)));
    monitorEl.style.setProperty('--haze', `rgba(${r}, ${g}, ${b}, ${Math.min(0.06 + lum * 0.8, 0.3).toFixed(3)})`);
  } else if (pcPhase === 'off') {
    tintTarget.setRGB(0, 0, 0);
  }
}
sampleScreen();

// ------------------------------------------------------------------ seated camera
// Exactly the Blender camera (Cam_Seated), which is framed in Blender on the desk, the wall
// art and the tower; the bake culls to that same view, so the two can't drift apart.
const center = (o) => new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
const camNode = gltf.cameras[0];
const seatPos = camNode.getWorldPosition(new THREE.Vector3());
const seatQuat = camNode.getWorldQuaternion(new THREE.Quaternion());
const baseAspect = camNode.aspect || 16 / 9;
const vTan = Math.tan(THREE.MathUtils.degToRad(camNode.fov) / 2);   // Blender's framing, as tangents
const hTan = vTan * baseAspect;
camera.position.copy(seatPos);
camera.quaternion.copy(seatQuat);
fill.fillPos.value.copy(seatPos).add(new THREE.Vector3(-0.3, 1.0, 0.7));   // above and behind your left shoulder

function fitFov() {
  // keep all of Blender's frame visible whatever the screen shape
  const t = Math.max(vTan, hTan / camera.aspect);
  camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(t)), 30, 100);
  camera.updateProjectionMatrix();
}

// ------------------------------------------------------------------ audio sources
// the wall behind the desk is at y = 1.8 m in Blender, i.e. z = -1.8 here
audio.attach(scene, center(named.Speaker_L), center(named.Speaker_R), center(named.Tower),
  { wallZ: -1.8, deskY: DESK_TOP });
if (named.Clock_Frame || named.Art) audio.addClock(scene, new THREE.Vector3(-0.33, 1.75, -1.79));   // the clock above the Messi poster (Blender -0.33, 1.79, 1.75)
if (named.Fan_Blades) {
  audio.addPedestalFan(scene, named.Fan_Blades.getWorldPosition(new THREE.Vector3()));
  if (fanHead) fanHead.attach(audio.pedestal);   // the whoosh turns with the head
}

// ------------------------------------------------------------------ interaction
const actions = {
  Screen: ['zoom', 'ViewSonic VA2216w: sit up and use it'],
  Monitor: ['zoom', 'ViewSonic VA2216w: sit up and use it'],
  Keyboard: ['zoom', 'Logitech keyboard'],
  Mouse: ['zoom', 'Logitech mouse'],
  Speaker_L: ['music', 'Speakers: play / pause Winamp'],
  Speaker_R: ['music', 'Speakers: play / pause Winamp'],
  Tower: ['fan', 'The PC: listen to the fan'],
  Modem: ['none', 'BSNL broadband modem'],
  Spindle: ['none', 'Blank CD-Rs'],
};
const pickables = Object.keys(actions).map((n) => (n === 'Screen' ? screenMesh : named[n])).filter(Boolean);
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(pickables, false)[0];
  return hit ? hit.object.name : null;
}

// you're sitting at the desk: the view stays put, you just point at things
let mode = 'seated';   // seated | moving | zoomed
const el = renderer.domElement;
el.addEventListener('pointermove', (e) => {
  if (mode !== 'seated' || e.pointerType !== 'mouse') return;
  const name = pick(e.clientX, e.clientY);
  el.style.cursor = name ? 'pointer' : 'default';
  const tip = $('tip');
  tip.style.display = name ? 'block' : 'none';
  if (name) { tip.textContent = actions[name][1]; tip.style.left = `${e.clientX}px`; tip.style.top = `${e.clientY}px`; }
});
el.addEventListener('click', (e) => {
  if (mode !== 'seated') return;
  const name = pick(e.clientX, e.clientY);
  if (!name) return;
  const act = actions[name][0];
  if (act === 'zoom') zoomIn();
  else if (act === 'music') iframe.contentWindow?.postMessage({ type: 'speakers' }, '*');
  else if (act === 'fan') audio.toggleFan();
});

// ------------------------------------------------------------------ zoom to the screen
const tween = { t: 1, dur: 1.1, fromP: new THREE.Vector3(), toP: new THREE.Vector3(),
  fromQ: new THREE.Quaternion(), toQ: new THREE.Quaternion(), done: null };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function moveTo(p, q, done) {
  tween.fromP.copy(camera.position); tween.fromQ.copy(camera.quaternion);
  tween.toP.copy(p); tween.toQ.copy(q); tween.t = 0; tween.done = done; mode = 'moving';
}
// sitting up to the PC: close enough to use it, but with both speakers still in view
const zoomBox = new THREE.Box3().setFromObject(named.VA_Screen);
for (const n of ['Speaker_L', 'Speaker_R']) if (named[n]) zoomBox.expandByObject(named[n]);
const zoomSize = zoomBox.getSize(new THREE.Vector3());
function zoomPose() {
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const w = Math.max(zoomSize.x, sSize.x) * 1.12, h = Math.max(zoomSize.y, sSize.y) * 1.15;
  const d = Math.max(h / 2 / t, w / 2 / (t * camera.aspect));
  const p = sCenter.clone().add(new THREE.Vector3(0, 0, d));
  const q = new THREE.Quaternion();   // looking straight down -z at the screen
  return [p, q];
}
function zoomIn() {
  $('tip').style.display = 'none';
  $('hud').style.opacity = 0;
  const [p, q] = zoomPose();
  moveTo(p, q, () => {
    mode = 'zoomed';
    iframe.classList.add('on');          // the PC takes clicks and keys now
    monitorEl.classList.add('close');
    $('back').style.display = 'block';
    if (pcPhase === 'off') powerOn();   // turned off from the Start menu: sitting up turns it back on
  });
}
function zoomOut() {
  iframe.classList.remove('on');
  monitorEl.classList.remove('close');
  $('back').style.display = 'none';
  moveTo(seatPos, seatQuat, () => { mode = 'seated'; $('hud').style.opacity = 1; });
}
$('back').addEventListener('click', zoomOut);

// ------------------------------------------------------------------ the PC
const powerOn = () => iframe.contentWindow?.postMessage({ type: 'power' }, '*');
// the PC hands over a stream for each audio graph it creates; they all go to the speakers
const takeStreams = () => (iframe.contentWindow?.__pcStreams ?? []).forEach((s) => audio.addStream(s));
// sound can only start after the visitor clicks or types, in the room or on the PC
const unlock = () => void audio.unlock();
const listenForGesture = (target) => ['pointerdown', 'keydown'].forEach((ev) =>
  target.addEventListener(ev, unlock, { capture: true }));
listenForGesture(window);
const hookPc = () => {
  try { listenForGesture(iframe.contentWindow); } catch { /* not loaded yet */ }
  takeStreams();
};
iframe.addEventListener('load', hookPc);
hookPc();

addEventListener('message', (e) => {
  if (e.source !== iframe.contentWindow) return;
  const m = e.data || {};
  if (m.type === 'pc-ready') { hookPc(); powerOn(); }
  if (m.type === 'pc-audio') takeStreams();
  if (m.type === 'pc-phase') pcPhase = m.phase;
});

// ------------------------------------------------------------------ dust in the lamp's beam
// Specks of dust drifting slowly through the desk lamp's cone, only visible where the light
// catches them: brightest near the bulb and the middle of the beam, gone at its edges.
// The lamp's position and aim are Blender's DeskLamp_Light (z-up), converted to three's y-up.
const dust = (() => {
  const lamp = new THREE.Vector3(0.211, 1.004, -1.432);
  const aim = new THREE.Vector3(-0.433, -0.836, 0.337).normalize();
  const HALF = THREE.MathUtils.degToRad(42), REACH = 0.42, COUNT = coarse ? 60 : 110;
  const pos = new Float32Array(COUNT * 3), seed = new Float32Array(COUNT);
  const side = new THREE.Vector3().crossVectors(aim, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(side, aim).normalize();
  for (let i = 0; i < COUNT; i++) {
    // spread through the cone, a bit wider than it so specks drift in and out of the light
    const d = 0.03 + Math.random() * REACH;
    const r = Math.tan(HALF * 1.15) * d * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    const p = lamp.clone().addScaledVector(aim, d).addScaledVector(side, r * Math.cos(a)).addScaledVector(up, r * Math.sin(a));
    pos.set([p.x, p.y, p.z], i * 3);
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: {
      time: { value: 0 }, lamp: { value: lamp }, aim: { value: aim },
      cosHalf: { value: Math.cos(HALF) }, reach: { value: REACH }, deskY: { value: DESK_TOP + 0.003 },
      px: { value: renderer.getPixelRatio() },
    },
    vertexShader: /* glsl */`
      attribute float seed;
      uniform float time, cosHalf, reach, deskY, px;
      uniform vec3 lamp, aim;
      varying float vGlow;
      void main() {
        float t = time * (0.05 + 0.04 * seed);
        // a lazy wander in every direction, a slow sink, and the whole cloud stirred by the fan
        vec3 p = position + 0.035 * vec3(sin(t * 2.1 + seed * 40.0), sin(t * 1.3 + seed * 17.0) - 0.4 * fract(t * 0.2 + seed),
                                         cos(t * 1.7 + seed * 23.0));
        p.x += 0.012 * sin(time * 0.45 + p.y * 9.0);
        vec3 to = p - lamp;
        float d = length(to);
        float cosA = dot(to / d, aim);
        float inBeam = smoothstep(cosHalf, cosHalf + 0.12, cosA);
        float along = smoothstep(0.02, 0.06, d) * (1.0 - smoothstep(reach * 0.7, reach, d));
        float twinkle = 0.8 + 0.2 * sin(time * (0.4 + seed * 0.5) + seed * 60.0);
        vGlow = inBeam * along * twinkle / (1.0 + 6.0 * d * d) * step(deskY, p.y);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.4 + 1.2 * seed) * px * (0.6 / -mv.z);
      }`,
    fragmentShader: /* glsl */`
      varying float vGlow;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, r) * vGlow * 0.35;
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.66) * a, a);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  window.__dust = points;   // for tuning from the console
  return { update(t) { mat.uniforms.time.value = t; } };
})();

// ------------------------------------------------------------------ resize + loop
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  cssRenderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  fitFov();
  if (mode === 'zoomed') {
    const [p, q] = zoomPose();
    camera.position.copy(p); camera.quaternion.copy(q); camera.updateMatrixWorld();
  }
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  time.value = clock.elapsedTime;
  if (mode === 'moving') {
    tween.t = Math.min(1, tween.t + dt / tween.dur);
    const k = ease(tween.t);
    camera.position.lerpVectors(tween.fromP, tween.toP, k);
    camera.quaternion.slerpQuaternions(tween.fromQ, tween.toQ, k);
    if (tween.t >= 1) { camera.updateMatrixWorld(); tween.done?.(); }
  }
  // the monitor's glow on the desk follows the screen, eased so it doesn't flicker
  screenTint.value.lerp(tintTarget, 1 - Math.exp(-dt * 4));
  runFan(clock.elapsedTime);
  runClock(() => audio.tick());
  dust.update(clock.elapsedTime);
  renderer.render(scene, camera);
  cssRenderer.render(cssScene, camera);
});

// ------------------------------------------------------------------ in
// loaded: fade straight into the room and switch the PC on
$('loader').classList.add('gone');
powerOn();
