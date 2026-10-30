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
// The Havells fan on the left, running, pointed at the chair.
//
// Why it isn't simply rotated smoothly: a real pedestal fan turns at ~1200 rpm, 20 turns a
// second, far too fast for the eye to follow any blade. What you actually see (and what a
// camera records) is
//   - motion blur: each blade smeared into a translucent fan of grey, covering most of the gap
//     to the next blade, so the head reads as a hazy disc rather than three paddles;
//   - aliasing: sampled at the screen's refresh rate, the blur pattern appears to creep slowly
//     forwards or backwards (the wagon-wheel effect) instead of spinning at its true speed;
//   - unsteadiness: a cheap induction motor's speed wanders by a percent or two with the mains
//     and the load, so that creep drifts, stalls and reverses, and the head shivers faintly.
// So the blades really turn at ~20 rps (integrated from a slowly wandering speed), and each
// frame draws them smeared across the angle they sweep while an imaginary shutter is open.
const FAN_RUNNING = true;
const FAN_RPS = 15.5;                          // ~930 rpm: the fan on speed 2, calmer to watch
const SHUTTER = 1 / 110;                       // seconds of motion each frame smears together
const BLUR = 12;                               // copies drawn across that smear
const fanHead = named.Fan_Head;
const fanBlur = [];
if (FAN_RUNNING && fanHead && named.Fan_Blades) {
  const blades = named.Fan_Blades;
  fanHead.attach(blades);
  const make = (alpha) => {
    const ghost = blades.clone();
    ghost.material = blades.material.clone();
    ghost.material.uniforms = THREE.UniformsUtils.clone(blades.material.uniforms);
    for (const k of ['albedo', 'light', 'emit', 'screen']) ghost.material.uniforms[k].value = blades.material.uniforms[k].value;
    ghost.material.uniforms.screenTint = screenTint;
    ghost.material.uniforms.alpha.value = alpha;
    ghost.material.transparent = true;
    ghost.material.depthWrite = false;
    fanHead.add(ghost);
    return ghost;
  };
  // the smear is densest in the middle of the exposure and thins at both ends
  for (let i = 0; i < BLUR; i++) {
    const f = i / (BLUR - 1);
    fanBlur.push({ mesh: make(0.34 * Math.sin(Math.PI * (0.15 + 0.7 * f))), frac: f });
  }
  blades.visible = false;
  for (const b of fanBlur) b.base = blades.quaternion.clone();
}
const headBase = fanHead ? fanHead.quaternion.clone() : null;
const FAN_AXIS = new THREE.Vector3(0, 0, -1);  // Blender's local y (the fan's axis) is glTF's local -z
const SHAKE_X = new THREE.Vector3(1, 0, 0), SHAKE_Y = new THREE.Vector3(0, 1, 0);
const spinQ = new THREE.Quaternion(), shakeQ = new THREE.Quaternion(), shakeQ2 = new THREE.Quaternion();
let fanAngle = 0, fanLast = 0;
function runFan(t) {
  if (!fanBlur.length) return;
  const dt = Math.min(t - fanLast, 0.1); fanLast = t;
  // the motor's speed wanders a little: slow mains/load drift plus a faint faster wobble
  const rps = FAN_RPS * (1 + 0.012 * Math.sin(t * 0.37) + 0.006 * Math.sin(t * 1.9 + 1.3) + 0.003 * Math.sin(t * 5.3));
  const w = rps * Math.PI * 2;
  fanAngle = (fanAngle + w * dt) % (Math.PI * 2);
  const sweep = w * SHUTTER;                   // angle swept while the shutter is open
  for (const b of fanBlur) {
    spinQ.setFromAxisAngle(FAN_AXIS, fanAngle - sweep * b.frac);
    b.mesh.quaternion.copy(b.base).multiply(spinQ);
  }
  // the whole head shivers very slightly at the blade rate: the slightly unbalanced rotor
  const shiver = 0.0009 * Math.sin(fanAngle * 3), nod = 0.0006 * Math.sin(fanAngle * 3 + 1.1);
  shakeQ.setFromAxisAngle(SHAKE_Y, shiver); shakeQ2.setFromAxisAngle(SHAKE_X, nod);
  fanHead.quaternion.copy(headBase).multiply(shakeQ).multiply(shakeQ2);
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

// ------------------------------------------------------------------ the BSNL modem
// A ZTE ZXDSL 831AII. Power and DSL sit solid green (DSL blinks for a few seconds while it
// trains, like it did every time the line came back); Internet and Ethernet flicker with
// traffic: quick bursts while something's loading, the odd lone blip when idle, and busier
// while you're sat up at the PC. USB was never plugged in, so it stays dark.
const modemLeds = (() => {
  const meshes = [0, 1, 2, 3, 4].map((i) => named[`Modem_LED_${i}`]);
  if (!meshes[0]) return null;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(150,255,150,0.9)'); grd.addColorStop(0.22, 'rgba(50,255,80,0.3)'); grd.addColorStop(1, 'rgba(0,255,40,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return meshes.map((mesh) => {
    if (!mesh) return null;
    mesh.material = new THREE.MeshBasicMaterial({ color: 0x0b1a0e, toneMapped: false });
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending,
      depthWrite: false, transparent: true, toneMapped: false, opacity: 0 }));
    glow.position.copy(new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3())).add(new THREE.Vector3(0, 0, 0.0015));
    glow.scale.setScalar(0.016); scene.add(glow);
    return { mesh, glow, on: false };
  });
})();
window.__modem = () => modemLeds?.map((l) => l?.on);   // for checking from the console
const LED_ON = new THREE.Color(0x3dff5a), LED_OFF = new THREE.Color(0x0b1a0e);
// traffic, one stream per LED: idle blips, then a burst of fast toggling now and then
const traffic = [2, 3].map(() => ({ burstUntil: 0, nextBurst: 1 + Math.random() * 3, nextFlip: 0, on: true }));
function runModem(t) {
  if (!modemLeds) return;
  const busy = mode === 'zoomed' ? 2.2 : 1;
  const states = [true, t < 7 ? Math.floor(t * 2.5) % 2 === 0 : true, true, true, false];
  traffic.forEach((s, k) => {
    if (t > s.nextBurst) {                       // a page, a song, Windows Update...
      s.burstUntil = t + 0.25 + Math.random() * (Math.random() < 0.2 ? 3 : 0.9);
      s.nextBurst = s.burstUntil + (0.4 + Math.random() * 4) / busy;
    }
    if (t > s.nextFlip) {
      const inBurst = t < s.burstUntil;
      s.on = inBurst ? !s.on : true;
      s.nextFlip = t + (inBurst ? 0.025 + Math.random() * 0.07 : 0.05);
    }
    // Internet only shows once the line has trained
    states[k + 2] = t < 7 && k === 0 ? false : s.on;
  });
  modemLeds.forEach((led, i) => {
    if (!led || led.on === states[i]) return;
    led.on = states[i];
    led.mesh.material.color.copy(led.on ? LED_ON : LED_OFF);
    led.glow.material.opacity = led.on ? 0.7 : 0;
  });
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
// ------------------------------------------------------------------ what you can touch
// Only real things are interactive: the monitor (and the keyboard and mouse in front of it)
// sit you up to the PC; the speaker's two knobs bring you in close to use them by hand.
const actions = {
  Screen: ['zoom', 'ViewSonic VA2216w: sit up and use it'],
  Monitor: ['zoom', 'ViewSonic VA2216w: sit up and use it'],
  Keyboard: ['zoom', 'Logitech keyboard'],
  Mouse: ['zoom', 'Logitech mouse'],
  Speaker_L_Knob_Volume: ['knob', 'Volume'],
  Speaker_L_Knob_Power: ['knob', 'Power'],
};
const KNOB_VOL = 'Speaker_L_Knob_Volume', KNOB_PWR = 'Speaker_L_Knob_Power';
const isKnob = (n) => n === KNOB_VOL || n === KNOB_PWR;
// the knobs are about 1.5 cm across: give each an invisible, finger-sized hit area
for (const n of [KNOB_VOL, KNOB_PWR]) {
  const k = named[n]; if (!k) continue;
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = n; scene.add(hit);
  hit.position.copy(new THREE.Box3().setFromObject(k).getCenter(new THREE.Vector3()));
  named['hit:' + n] = hit;
}
const pickables = Object.keys(actions).map((n) => (n === 'Screen' ? screenMesh : named['hit:' + n] ?? named[n])).filter(Boolean);
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(pickables, false)[0];
  return hit ? hit.object.name : null;
}

// ------------------------------------------------------------------ the subtle hint
// Interactive things answer a hover with a soft warm halo around their outline, and every so
// often all of them breathe once, faintly, so phones (no hover) still find them.
// The halo is the object's own shape drawn a touch larger, back faces only, added on top.
const hulls = {};          // action key -> [{ hull, src, scale, centre }]
const hullMat = () => new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.82, 0.55), transparent: true, opacity: 0,
  side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
function addHull(key, src, scale) {
  if (!src) return;
  src.geometry.computeBoundingBox();
  const centre = src.geometry.boundingBox.getCenter(new THREE.Vector3());
  const hull = new THREE.Mesh(src.geometry, hullMat());
  hull.matrixAutoUpdate = false; hull.renderOrder = 5;
  scene.add(hull);
  (hulls[key] ??= []).push({ hull, src, scale, centre });
}
addHull('pc', named.Monitor, 1.012);
addHull('kb', named.Keyboard, 1.03);
addHull('mouse', named.Mouse, 1.08);
// the knobs get a clean soft ring in the panel's plane instead (a hull around a short
// cylinder is half hidden by the panel and the knob itself)
const ringTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0.00, 'rgba(255,214,160,0)');
  grd.addColorStop(0.58, 'rgba(255,214,160,0)');
  grd.addColorStop(0.70, 'rgba(255,220,170,0.55)');
  grd.addColorStop(0.76, 'rgba(255,226,180,1)');
  grd.addColorStop(0.84, 'rgba(255,214,160,0.35)');
  grd.addColorStop(1.00, 'rgba(255,214,160,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
})();
function addRing(key, knob) {
  if (!knob) return;
  const size = new THREE.Box3().setFromObject(knob).getSize(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z) / 2;
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(r * 3.0, r * 3.0), new THREE.MeshBasicMaterial({ map: ringTex,
    transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  ring.renderOrder = 6; scene.add(ring);
  (hulls[key] ??= []).push({ ring, src: knob });
}
addRing(KNOB_VOL, named[KNOB_VOL]);
addRing(KNOB_PWR, named[KNOB_PWR]);
const hullKey = (name) => ({ Screen: 'pc', Monitor: 'pc', Keyboard: 'kb', Mouse: 'mouse' })[name] ?? name;
const hullT = new THREE.Matrix4(), hullS = new THREE.Matrix4(), hullB = new THREE.Matrix4();
let hovered = null, hintStart = 3, hintNext = 3;
function updateHints(t, dt) {
  if (t > hintNext) { hintStart = t; hintNext = t + 22; }
  const pulse = Math.max(0, Math.sin(Math.min((t - hintStart) / 1.8, 1) * Math.PI)) * 0.2;
  const inReach = mode === 'knobs' ? [KNOB_VOL, KNOB_PWR] : mode === 'seated' ? Object.keys(hulls) : mode === 'zoomed' ? [KNOB_VOL, KNOB_PWR] : [];
  for (const [key, list] of Object.entries(hulls)) {
    const live = inReach.includes(key);
    const target = !live ? 0 : (hovered && hullKey(hovered) === key ? 0.42 : pulse);
    for (const h of list) {
      if (h.ring) {
        const want = target * 1.2;                 // rings are thinner than hulls: a bit stronger
        h.ring.material.opacity += (want - h.ring.material.opacity) * (1 - Math.exp(-dt * 10));
        h.ring.visible = h.ring.material.opacity > 0.003;
        if (!h.ring.visible) continue;
        const k = knobs[key];
        // flat against the panel, around the knob's base, facing out
        h.ring.position.copy(k.basePos).addScaledVector(k.out, 0.0004);
        h.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), k.out);
        continue;
      }
      h.hull.material.opacity += (target - h.hull.material.opacity) * (1 - Math.exp(-dt * 10));
      h.hull.visible = h.hull.material.opacity > 0.003;
      if (!h.hull.visible) continue;
      h.src.updateWorldMatrix(true, false);
      hullT.makeTranslation(h.centre.x, h.centre.y, h.centre.z);
      hullS.makeScale(h.scale, h.scale, h.scale);
      hullB.makeTranslation(-h.centre.x, -h.centre.y, -h.centre.z);
      h.hull.matrix.copy(h.src.matrixWorld).multiply(hullT).multiply(hullS).multiply(hullB);
    }
  }
}

// ------------------------------------------------------------------ the speaker's knobs
// Power: a push button. Pressed in (flush with the panel) is on, with the LED lit; press it
// again and it springs out, the LED goes dark. Volume: a pot with ~270 degrees of travel,
// turned by rolling your finger or mouse around it, or with the scroll wheel.
const knobs = {};
for (const n of [KNOB_VOL, KNOB_PWR]) if (named[n]) {
  const mesh = named[n];
  knobs[n] = { mesh, base: mesh.quaternion.clone(), basePos: mesh.position.clone(),
    out: new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion) };   // the shaft: Blender local z is glTF local y, pointing out of the panel
}
const KNOB_AXIS = new THREE.Vector3(0, 1, 0);
const VOL_TRAVEL = THREE.MathUtils.degToRad(270);
const knobQ = new THREE.Quaternion();
function setKnob(name, angle) {
  const k = knobs[name]; if (!k) return;
  knobQ.setFromAxisAngle(KNOB_AXIS, -angle);        // clockwise as you face it
  k.mesh.quaternion.copy(k.base).multiply(knobQ);
}
let volume = 0.7, powered = true, lastNotch = -1;
const volAngle = (v) => (v - 0.5) * VOL_TRAVEL;
setKnob(KNOB_VOL, volAngle(volume));
window.__knobs = () => ({ volume, powered, mode });   // for checking from the console

// the power LED: a small green dot above the button, with a soft glow when it's on
const PUSH = 0.0035;                               // how far the button stands out when off
let push = 0;                                      // 0 = pressed in, 1 = out
const led = (() => {
  const k = knobs[KNOB_PWR]; if (!k) return null;
  const at = new THREE.Box3().setFromObject(k.mesh).getCenter(new THREE.Vector3())
    .add(new THREE.Vector3(0, 0.0105, 0)).addScaledVector(k.out, -0.0035);   // just above the button, below the logo
  const look = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), k.out);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0016, 16), new THREE.MeshBasicMaterial({ color: 0x2bff4a, toneMapped: false }));
  dot.position.copy(at); dot.quaternion.copy(look); scene.add(dot);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(120,255,140,0.9)'); grd.addColorStop(0.25, 'rgba(40,255,80,0.35)'); grd.addColorStop(1, 'rgba(0,255,40,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending,
    depthWrite: false, transparent: true, toneMapped: false }));
  glow.position.copy(at).addScaledVector(k.out, 0.001); glow.scale.setScalar(0.014); scene.add(glow);
  return { dot, glow };
})();
function updatePowerKnob(dt) {
  push += ((powered ? 0 : 1) - push) * (1 - Math.exp(-dt * 28));   // springs out, presses in
  const k = knobs[KNOB_PWR];
  if (k) k.mesh.position.copy(k.basePos).addScaledVector(k.out, push * PUSH);
  if (led) {
    led.dot.material.color.set(powered ? 0x2bff4a : 0x0c160e);
    led.glow.material.opacity = powered ? 0.85 : 0;
  }
}
function togglePower() {
  powered = !powered;
  audio.setPower(powered);
}
function turnVolume(delta) {
  const v = THREE.MathUtils.clamp(volume + delta, 0, 1);
  if (v === volume) return;
  volume = v;
  setKnob(KNOB_VOL, volAngle(volume));
  audio.setVolume(volume);
  const notch = Math.round(volume * 24);           // the pot's faint detents
  if (notch !== lastNotch) { if (lastNotch >= 0) audio.knobClick(0.22); lastNotch = notch; }
  showDial();
}

// a faint arc around the volume knob while you're turning it, showing where it is
const dial = document.createElement('div');
dial.id = 'dial';
dial.innerHTML = '<svg viewBox="-50 -50 100 100"><path class="track"/><path class="level"/><circle class="tip" r="2.6"/></svg>';
document.body.appendChild(dial);
const arc = (a0, a1, r) => {
  const p = (a) => [Math.sin(a) * r, -Math.cos(a) * r];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
};
dial.querySelector('.track').setAttribute('d', arc(-VOL_TRAVEL / 2, VOL_TRAVEL / 2, 40));
let dialUntil = 0;
function showDial() { dialUntil = performance.now() + 1400; }
const projV = new THREE.Vector3();
function knobScreen(name) {
  const k = knobs[name]; if (!k) return null;
  projV.copy(new THREE.Box3().setFromObject(k.mesh).getCenter(new THREE.Vector3())).project(camera);
  return { x: (projV.x + 1) / 2 * innerWidth, y: (1 - projV.y) / 2 * innerHeight };
}
function updateDial() {
  const on = mode === 'knobs' && (performance.now() < dialUntil || rotary);
  dial.style.opacity = on ? 1 : 0;
  if (mode !== 'knobs') return;
  const s = knobScreen(KNOB_VOL); if (!s) return;
  const size = Math.min(innerWidth, innerHeight) * 0.34;
  Object.assign(dial.style, { left: `${s.x - size / 2}px`, top: `${s.y - size / 2}px`, width: `${size}px`, height: `${size}px` });
  const a = volAngle(volume);
  dial.querySelector('.level').setAttribute('d', arc(-VOL_TRAVEL / 2, a, 40));
  const tip = dial.querySelector('.tip');
  tip.setAttribute('cx', Math.sin(a) * 40); tip.setAttribute('cy', -Math.cos(a) * 40);
}

// ------------------------------------------------------------------ pointer
let mode = 'seated';   // seated | moving | zoomed | knobs
const el = renderer.domElement;
const reachable = (name) => name && (mode === 'seated' || (isKnob(name) && (mode === 'zoomed' || mode === 'knobs')));
let rotary = null, pressMoved = 0, pressAt = null;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
el.addEventListener('pointerdown', (e) => {
  pressMoved = 0; pressAt = { x: e.clientX, y: e.clientY };
  if (mode !== 'knobs') return;
  const s = knobScreen(KNOB_VOL); if (!s) return;
  const name = pick(e.clientX, e.clientY);
  // up close, a roll anywhere around the volume knob turns it (the power button just takes taps)
  const near = Math.hypot(e.clientX - s.x, e.clientY - s.y) < Math.min(innerWidth, innerHeight) * 0.3;
  if (name === KNOB_PWR || !near) return;
  rotary = { cx: s.x, cy: s.y, a: Math.atan2(e.clientY - s.y, e.clientX - s.x) };
  el.setPointerCapture(e.pointerId);
  showDial();
});
el.addEventListener('pointermove', (e) => {
  if (pressAt) pressMoved = Math.max(pressMoved, Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y));
  if (rotary) {
    const a = Math.atan2(e.clientY - rotary.cy, e.clientX - rotary.cx);
    // screen angles grow clockwise (y points down): clockwise is louder, like the real knob
    turnVolume(wrap(a - rotary.a) / VOL_TRAVEL);
    rotary.a = a;
    return;
  }
  if (e.pointerType !== 'mouse') return;
  const name = pick(e.clientX, e.clientY);
  hovered = reachable(name) ? name : null;
  el.style.cursor = hovered ? (mode === 'knobs' && hovered === KNOB_VOL ? 'grab' : 'pointer') : (mode === 'knobs' ? 'grab' : 'default');
  const tip = $('tip');
  tip.style.display = hovered && mode !== 'knobs' ? 'block' : 'none';
  if (hovered) { tip.textContent = actions[hovered][1]; tip.style.left = `${e.clientX}px`; tip.style.top = `${e.clientY}px`; }
});
el.addEventListener('pointerup', () => { rotary = null; pressAt = null; });
el.addEventListener('pointerleave', () => { if (!rotary) hovered = null; });
el.addEventListener('wheel', (e) => {
  if (mode !== 'knobs') return;
  e.preventDefault();
  turnVolume(-e.deltaY * 0.0009);
}, { passive: false });
el.addEventListener('click', (e) => {
  if (pressMoved > 6) return;                      // that was a turn, not a tap
  const name = pick(e.clientX, e.clientY);
  if (!reachable(name)) return;
  if (mode === 'knobs') { if (name === KNOB_PWR) togglePower(); return; }
  const act = actions[name][0];
  if (act === 'zoom') zoomIn();
  else if (act === 'knob') knobsIn(name === KNOB_PWR);
});

// ------------------------------------------------------------------ moving the camera
const tween = { t: 1, dur: 1.1, fromP: new THREE.Vector3(), toP: new THREE.Vector3(),
  fromQ: new THREE.Quaternion(), toQ: new THREE.Quaternion(), done: null };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function moveTo(p, q, done, dur = 1.1) {
  tween.fromP.copy(camera.position); tween.fromQ.copy(camera.quaternion);
  tween.toP.copy(p); tween.toQ.copy(q); tween.t = 0; tween.dur = dur; tween.done = done; mode = 'moving';
}
// sitting up to the PC: close enough to use it, but with both speakers still in view
const zoomBox = new THREE.Box3().setFromObject(named.VA_Screen);
for (const n of ['Speaker_L', 'Speaker_R']) if (named[n]) zoomBox.expandByObject(named[n]);
const zoomSize = zoomBox.getSize(new THREE.Vector3());
function zoomPose() {
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const w = Math.max(zoomSize.x, sSize.x) * 1.0, h = Math.max(zoomSize.y, sSize.y) * 1.12;   // speakers just in frame
  const d = Math.max(h / 2 / t, w / 2 / (t * camera.aspect));
  // centred on the screen-and-speakers box, so the speaker knobs at the bottom are in reach too
  const c = zoomBox.getCenter(new THREE.Vector3());
  const p = new THREE.Vector3(c.x, c.y, sCenter.z + d);
  const q = new THREE.Quaternion();   // looking straight down -z at the screen
  return [p, q];
}
const setHud = (txt) => { $('hud').textContent = txt; $('hud').style.opacity = txt ? 1 : 0; };
const SEATED_HUD = 'Tap the monitor to use the PC';
function zoomIn() {
  $('tip').style.display = 'none'; hovered = null;
  setHud('');
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
  moveTo(seatPos, seatQuat, () => { mode = 'seated'; setHud(SEATED_HUD); });
}
// up close to the speaker's knobs: lean in until they fill a good part of the view
let knobsReturn = 'seated';
function knobsPose() {
  const kv = knobs[KNOB_VOL], kp = knobs[KNOB_PWR];
  const a = new THREE.Box3().setFromObject(kv.mesh).getCenter(new THREE.Vector3());
  const b = new THREE.Box3().setFromObject(kp.mesh).getCenter(new THREE.Vector3());
  const target = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.006, 0));
  const eye = target.clone().addScaledVector(kv.out, 0.11).add(new THREE.Vector3(0, 0.008, 0));
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(eye, target, new THREE.Vector3(0, 1, 0)));
  return [eye, q];
}
function knobsIn() {
  knobsReturn = mode === 'zoomed' ? 'zoomed' : 'seated';
  $('tip').style.display = 'none'; hovered = null;
  iframe.classList.remove('on');
  setHud('');
  const [p, q] = knobsPose();
  moveTo(p, q, () => {
    mode = 'knobs';
    $('back').style.display = 'block';
    setHud(coarse ? 'Roll your finger around the volume knob · tap the power button' : 'Roll the volume knob (or scroll) · click the power button');
    setTimeout(() => { if (mode === 'knobs') setHud(''); }, 4500);
    hintStart = clock.elapsedTime + 0.4;            // the two knobs breathe once as you arrive
  }, 0.9);
}
function knobsOut() {
  setHud('');
  if (knobsReturn === 'zoomed') {
    const [p, q] = zoomPose();
    moveTo(p, q, () => { mode = 'zoomed'; iframe.classList.add('on'); }, 0.9);
  } else {
    $('back').style.display = 'none';
    moveTo(seatPos, seatQuat, () => { mode = 'seated'; setHud(SEATED_HUD); }, 0.9);
  }
}
$('back').addEventListener('click', () => (mode === 'knobs' ? knobsOut() : zoomOut()));

// ------------------------------------------------------------------ the PC
const powerOn = () => iframe.contentWindow?.postMessage({ type: 'power' }, '*');
// the PC hands over a stream for each audio graph it creates; they all go to the speakers
const takeStreams = () => (iframe.contentWindow?.__pcStreams ?? []).forEach((s) => audio.addStream(s));
// sound can only start after the visitor clicks or types, in the room or on the PC
const unlock = () => void audio.unlock();
const listenForGesture = (target) => ['pointerdown', 'keydown'].forEach((ev) =>
  target.addEventListener(ev, unlock, { capture: true }));
listenForGesture(window);

// mute, remembered between visits; M toggles it too
const muteBtn = document.getElementById('mute');
let muted = false;
try { muted = localStorage.getItem('muted') === '1'; } catch { /* storage blocked */ }
const setMuted = (m) => {
  muted = m;
  audio.setMuted(m);
  muteBtn.classList.toggle('off', m);
  muteBtn.setAttribute('aria-label', m ? 'Unmute' : 'Mute');
  try { localStorage.setItem('muted', m ? '1' : '0'); } catch { /* storage blocked */ }
};
setMuted(muted);
muteBtn.addEventListener('click', () => setMuted(!muted));
window.addEventListener('keydown', (e) => {
  if ((e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey && !e.altKey) setMuted(!muted);
});
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
  runModem(clock.elapsedTime);
  updateHints(clock.elapsedTime, dt);
  updatePowerKnob(dt);
  updateDial();
  dust.update(clock.elapsedTime);
  renderer.render(scene, camera);
  cssRenderer.render(cssScene, camera);
});

// ------------------------------------------------------------------ in
// loaded: fade straight into the room and switch the PC on
$('loader').classList.add('gone');
powerOn();
