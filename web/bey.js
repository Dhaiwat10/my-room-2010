// The Beyblade stadium under the desk, up close: choose a top, launch it on "let it rip", and
// battle the computer's top until one is knocked out of the stadium or spins out.
//
// Opened from the room like the game boxes' inspect view: an overlay with its own renderer. The
// stadium is the room's own model (assets/stadium/), its plastic rebuilt here from the same maps.
//
// The launch is two skills, one after the other:
//   power   hold, and let go at the top of the swinging gauge
//   timing  then tap as the closing ring meets your top, right on "Let it rip!"
// Each is graded, and the grades set the top's spin and speed: a perfect launch is a real edge.
//
// The physics runs in the stadium's frame (metres, y up), 240 steps a second:
//   - a top rides the bowl's surface, and the slope pulls it back towards the middle
//   - its tip's grip curls its path round the bowl (a flat tip hard, a sharp one barely)
//   - spin bleeds away to the tip, the air and every hit
//   - each top is a rigid body leaning on its tip: gravity tips its axis over and its spin holds it
//     up (a gyroscope), so a hit sets it nodding, the tip's friction stands it back up, and once the
//     spin drops under the speed that can hold it, the lean grows on its own: a widening wobble
//     until the metal wheel's edge scrapes the floor, bleeding the last of the spin, and it lies down
//   - two tops meeting trade a knock along the line between them, and another from their
//     spinning edges grinding (attack rings hit hardest), and both lose spin
//   - a top whose ring meets the wall bounces off it; hit fast enough, it goes over the rim
//
// And it's shot like a broadcast: a turntable close-up while you choose, over your shoulder for
// the countdown, slow motion after your launch, a camera that keeps both tops in frame, and a
// hit-stop and slow-motion punch-in on the big hits, ring-outs and the finish.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ------------------------------------------------------------------ the stadium
const SCALE = 1.276;                     // the model is made at desk size; this is the real one, 34.5 cm across
// the top surface the tips run on, centre to rim, in the model's mm (art/stadium/model.py)
const PROFILE = [[0, 10], [46, 10], [48.6, 10], [50.2, 9.82], [51.8, 10.3], [62, 12.6], [74, 17.4], [86, 25.2],
  [96, 33.2], [101.5, 40], [105, 47.5], [107, 54.5], [108.2, 60.2], [109.4, 61.8], [110.6, 62.5]];
const RIM = 110.6e-3 * SCALE;
const NOTCHES = [20, 140, 260].map((d) => -THREE.MathUtils.degToRad(d));   // the rim's three dips (Blender's angles, mirrored by y-up)
const LOGO = 272 / 84;                   // the centre print spans 84 mm of the 272 mm plan view

// height, slope and curvature of the bowl at a radius, from a fine smoothed table
const SURF = (() => {
  const N = 720, rmax = RIM * 1.02, h = new Float32Array(N), out = { h: new Float32Array(N), s: new Float32Array(N), k: new Float32Array(N), dr: rmax / (N - 1) };
  for (let i = 0; i < N; i++) {
    const r = (i * out.dr) / SCALE * 1e3;
    let j = 1; while (j < PROFILE.length - 1 && PROFILE[j][0] < r) j++;
    const [r0, z0] = PROFILE[j - 1], [r1, z1] = PROFILE[j];
    h[i] = (z0 + (z1 - z0) * THREE.MathUtils.clamp((r - r0) / (r1 - r0), 0, 1)) * SCALE * 1e-3;
  }
  for (let i = 0; i < N; i++) {      // a light blur takes the corners off the straight pieces
    let a = 0, n = 0;
    for (let k = -4; k <= 4; k++) { const q = i + k; if (q >= 0 && q < N) { a += h[q]; n++; } }
    out.h[i] = a / n;
  }
  for (let i = 1; i < N - 1; i++) out.s[i] = (out.h[i + 1] - out.h[i - 1]) / (2 * out.dr);
  out.s[N - 1] = out.s[N - 2];
  for (let i = 1; i < N - 1; i++) out.k[i] = (out.s[i + 1] - out.s[i - 1]) / (2 * out.dr);
  return out;
})();
function surf(r) {
  const f = Math.min(r / SURF.dr, SURF.h.length - 1.001), i = Math.floor(f), t = f - i;
  const L = (a) => a[i] + (a[i + 1] - a[i]) * t;
  return { h: L(SURF.h), s: L(SURF.s), k: L(SURF.k) };
}

// ------------------------------------------------------------------ the tops
// Four originals in the Metal Fight build: face bolt, tinted clear wheel, metal wheel, track, tip.
// They differ in looks only: you don't know your opponent when you choose, so there's nothing to
// counter, and the launch alone decides who has the edge. All of them handle the same way:
// grip: how hard the tip curls the path; drive: how much the tip pushes it along; drag: speed lost
// to the floor; decay: spin lost per second, as a share; smash: how hard its ring hits; guard: how
// well it soaks a hit
const HANDLING = { mass: 0.042, ring: 0.0215, grip: 4.0, drive: 0.6, drag: 1.1, decay: 0.022, smash: 1.3, guard: 1.0 };
const TOPS = [
  { id: 'fang', name: 'Crimson Fang', face: '#c8202a', ink: '#ffd23f', clear: 0xff4a3a, trail: 0xff5a2a, wheel: 'fang', tip: 'flat' },
  { id: 'shell', name: 'Iron Shell', face: '#1f7a46', ink: '#e8f5e9', clear: 0x3ddc84, trail: 0x3dff8a, wheel: 'shell', tip: 'ball' },
  { id: 'gale', name: 'Silver Gale', face: '#2f62b8', ink: '#ffffff', clear: 0x9ad8ff, trail: 0x6fc6ff, wheel: 'gale', tip: 'sharp' },
  { id: 'rook', name: 'Storm Rook', face: '#6a35a8', ink: '#ffcc33', clear: 0xb68cff, trail: 0xc28cff, wheel: 'rook', tip: 'semi' },
].map((T) => ({ ...HANDLING, ...T }));
const MODELLED = ['fang', 'shell', 'gale', 'rook'];   // tops with a Blender model in assets/tops/ (art/tops); the rest are built in code
const W_FULL = 620;                      // rad/s off a full pull (about 5900 rpm)
const G = 9.81;
// the top as a rigid body (Metal Fight sizes): centre of mass 17 mm above the tip, most of the mass
// out in the metal wheel. Spinning, it holds itself up while I3*w > sqrt(4*I1*m*g*l): about 84 rad/s
const BODY = (() => {
  const m = HANDLING.mass, l = 0.017, I3 = m * 0.014 * 0.014, I1 = m * (0.011 * 0.011 + l * l);
  return {
    l, I1, I3, ml: m * l,
    crit: Math.sqrt(4 * I1 * m * G * l) / I3,
    touch: Math.atan2(0.0165, 0.0205),  // leaning this far from the floor, the wheel's lower edge meets it
    rim: 0.0205,                         // that edge's radius
    lever: 0.012,                        // how far above the tip a knock on the ring tips the axis
  };
})();
const TIP_PULL = 0.3;
const W_RISE = 160, SINK = 0.9;         // the tip stands it up above W_RISE; under it, it sinks at up to SINK per second
const W_STOP = 16;                       // spinning slower than this, lying on its edge, it's over
// phones and tablets: a lighter build of the same scene (fewer smear copies, no refraction pass,
// smaller shadows, a resolution that drops if frames run long)
const LITE = matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('lite');   // (?lite: to try it on a desktop)
const SHUTTER = 1 / 110, GHOSTS = LITE ? 4 : 7;   // motion blur, as on the fan: copies smeared across the shutter's sweep
const BEAT = 0.8;                        // seconds between "3", "2", "1" and "Let it rip!"
const GAUGE_PERIOD = 1.3;                // the power gauge swings up and back in this long
// how a launch is graded: the gauge's height when you let go, and how far off "rip" your tap was
const POWER_GRADES = [[0.94, 'Max power', 1.0], [0.8, 'Strong', 0.88], [0.55, 'Good', 0.72], [0, 'Weak', 0.5]];
const RIP_GRADES = [[0.06, 'Perfect', 1.1], [0.13, 'Great', 1.05], [0.24, 'Good', 1.0], [9, 'Off beat', 0.93]];

// the metal wheel's outline by type, as a radius round the circle (m)
const WHEEL = {
  fang: (a) => { const f = ((a * 3) / (2 * Math.PI)) % 1; return 0.0158 + 0.0058 * (f < 0.78 ? Math.pow(f / 0.78, 1.7) : 1 - (f - 0.78) / 0.22); },
  shell: (a) => 0.0205 + 0.0007 * Math.cos(a * 8),
  gale: (a) => 0.0226 - 0.0006 * Math.pow(Math.abs(Math.cos(a)), 6),
  rook: (a) => { const c = Math.cos(a * 4); return 0.0183 + 0.0022 * Math.sign(c) * Math.pow(Math.abs(c), 0.35); },
};
const WHEEL_H = { fang: 0.0068, shell: 0.0078, gale: 0.0052, rook: 0.0070 };
const CLEAR = {          // the clear wheel's wings: count, how far they reach, their sweep
  fang: [3, 0.0062, 0.5], shell: [6, 0.0028, 0.0], gale: [2, 0.0055, 0.9], rook: [4, 0.0045, 0.2],
};

function outline(fn, steps = 180) {
  const s = new THREE.Shape();
  for (let i = 0; i <= steps; i++) { const a = (i / steps) * Math.PI * 2, r = fn(a); i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  return s;
}
function hole(r) { const p = new THREE.Path(); p.absarc(0, 0, r, 0, Math.PI * 2, true); return p; }
// a flat outline, given thickness upwards from y0, with softened edges
function slab(shape, y0, h, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: h - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0, y0 + bevel, 0);
  return g;
}
function faceTexture(T) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = T.face; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
  g.fillStyle = T.ink; g.strokeStyle = T.ink; g.translate(128, 128);
  if (T.id === 'fang') {           // three curved fangs
    for (let i = 0; i < 3; i++) { g.rotate((Math.PI * 2) / 3); g.beginPath(); g.moveTo(-14, -8); g.quadraticCurveTo(10, -60, 54, -86); g.quadraticCurveTo(26, -40, 22, 4); g.closePath(); g.fill(); }
  } else if (T.id === 'shell') {   // a hexagon of plates
    g.lineWidth = 12; g.lineJoin = 'round';
    const hex = (r) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); };
    hex(78); g.stroke(); hex(36); g.fill();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; g.beginPath(); g.moveTo(Math.cos(a) * 36, Math.sin(a) * 36); g.lineTo(Math.cos(a) * 78, Math.sin(a) * 78); g.stroke(); }
  } else if (T.id === 'gale') {    // three gusts
    g.lineWidth = 14; g.lineCap = 'round';
    for (let i = 0; i < 3; i++) { g.rotate((Math.PI * 2) / 3); g.beginPath(); g.arc(0, -30, 48, Math.PI * 0.95, Math.PI * 1.9); g.stroke(); }
  } else {                          // a tower
    g.beginPath(); g.moveTo(-46, 70); g.lineTo(-38, -20); g.lineTo(-56, -30); g.lineTo(-56, -76); g.lineTo(-30, -76); g.lineTo(-30, -56);
    g.lineTo(-12, -56); g.lineTo(-12, -76); g.lineTo(12, -76); g.lineTo(12, -56); g.lineTo(30, -56); g.lineTo(30, -76); g.lineTo(56, -76);
    g.lineTo(56, -30); g.lineTo(38, -20); g.lineTo(46, 70); g.closePath(); g.fill();
    g.fillStyle = T.face; g.beginPath(); g.arc(0, 6, 14, Math.PI, 0); g.lineTo(14, 34); g.lineTo(-14, 34); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// one top's parts, built in code: [geometry, material] pairs, the tip touching y = 0
function buildParts(T) {
  const metal = new THREE.MeshPhysicalMaterial({ color: 0xcfd1d6, metalness: 1, roughness: 0.2 });
  const darkMetal = new THREE.MeshPhysicalMaterial({ color: 0x8b8e94, metalness: 1, roughness: 0.32 });
  const clear = new THREE.MeshPhysicalMaterial({ color: T.clear, roughness: 0.1, transparent: true, opacity: 0.78, clearcoat: 1, clearcoatRoughness: 0.06 });
  const plastic = new THREE.MeshPhysicalMaterial({ color: 0x18181b, roughness: 0.45, clearcoat: 0.3 });
  const tipMat = new THREE.MeshPhysicalMaterial({ color: T.tip === 'sharp' ? 0xeceff1 : 0x202024, roughness: 0.35 });
  const face = new THREE.MeshPhysicalMaterial({ map: faceTexture(T), roughness: 0.3, clearcoat: 0.6 });
  const hW = WHEEL_H[T.wheel];
  const yTrack = 0.0058, yWheel = 0.0165, yClear = yWheel + hW, yFace = yClear + 0.0034;
  const tipPts = {
    sharp: [[0, 0], [0.0012, 0.0012], [0.0034, 0.0045], [0.0046, yTrack]],
    flat: [[0, 0], [0.0036, 0], [0.0042, 0.0006], [0.0046, 0.0025], [0.0048, yTrack]],
    ball: [[0, 0], [0.0018, 0.0003], [0.0032, 0.0012], [0.0042, 0.0028], [0.0048, yTrack]],
    semi: [[0, 0], [0.0022, 0], [0.003, 0.0008], [0.0042, 0.0028], [0.0048, yTrack]],
  }[T.tip].map(([x, y]) => new THREE.Vector2(x, y));
  return [
    [new THREE.LatheGeometry(tipPts, 40), tipMat],
    [new THREE.CylinderGeometry(0.0062, 0.0056, yWheel - yTrack, 40).translate(0, (yTrack + yWheel) / 2, 0), plastic],
    [slab((() => { const s = outline(WHEEL[T.wheel]); s.holes.push(hole(0.0068)); return s; })(), yWheel, hW, 0.0007), metal],
    [slab((() => { const [n, reach, sweep] = CLEAR[T.wheel]; const s = outline((a) => 0.0118 + reach * Math.pow(Math.max(0, Math.sin(a * n + sweep * Math.sin(a * n))), 0.7)); s.holes.push(hole(0.0068)); return s; })(), yClear, 0.0034, 0.0005), clear],
    [new THREE.CylinderGeometry(0.0074, 0.0078, 0.004, 48).translate(0, yFace + 0.002, 0), [darkMetal, face, darkMetal]],
  ];
}
// the parts of a top modelled in Blender (assets/tops/<id>.glb), if it's there
async function loadParts(T) {
  try {
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(`assets/tops/${T.id}.glb`);
    const parts = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      parts.push([g, topMaterial(o.material, T)]);
    });
    return parts.length ? parts : null;
  } catch { return null; }
}
// the materials, upgraded from what glTF carries: the baked colour (occlusion and edge wear) and,
// on the metal, the baked roughness stay; the plastics become real refracting plastic, tinted
// through their thickness; everything reflects the room properly (set in load: envMap)
const TOP_ENV = { metal: 0.42, plastic: 0.3 };   // how strongly they reflect the room: the stadium's scene runs it at 0.22
function topMaterial(src, T) {
  const n = src.name;
  let m;
  if (n.startsWith('face_sticker')) {        // the sticker on the face bolt carries the top's emblem, drawn here
    m = new THREE.MeshPhysicalMaterial({ map: faceTexture(T), color: 0xb0b0b0, roughness: 0.32, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
  } else if (n.endsWith('_metal') || n.startsWith('bolt_washer')) {
    m = src; m.envMapIntensity = TOP_ENV.metal; m.metalnessMap = null; m.metalness = 1;   // (the exporter packs the roughness map with an empty metal channel)
    m.userData.kind = 'metal';
    if (T.id === 'gale' && n.endsWith('_metal')) { m.color.setScalar(0.72); m.roughness = 1.45; }   // its broad flat face would mirror the lamp: a satin finish
  } else if (n.endsWith('_clear') || n.endsWith('_bolt') || n.endsWith('_track')) {
    const tint = new THREE.Color(T.clear);
    m = new THREE.MeshPhysicalMaterial({
      map: src.map, color: 0xffffff, roughness: n.endsWith('_track') ? 0.22 : 0.07, metalness: 0,
      transmission: 1, thickness: n.endsWith('_clear') ? 0.004 : 0.003, ior: 1.49,
      attenuationColor: n.endsWith('_track') ? new THREE.Color(src.color).lerp(new THREE.Color(0xffffff), 0.2) : tint,
      attenuationDistance: n.endsWith('_track') ? 0.02 : 0.01,
      clearcoat: 0.6, clearcoatRoughness: 0.06, envMapIntensity: TOP_ENV.plastic,
    });
    if (!src.map) m.color.copy(src.color);
    else if (!n.endsWith('_track')) m.color.copy(tint).lerp(new THREE.Color(0xffffff), 0.45);   // tinted all through, as dyed plastic is
    if (LITE) {                                 // refraction re-renders the whole scene every frame: see-through tinted plastic instead
      m.transmission = 0; m.transparent = true; m.opacity = n.endsWith('_track') ? 0.9 : 0.8;
      if (src.map && !n.endsWith('_track')) m.color.copy(tint).lerp(new THREE.Color(0xffffff), 0.3);
    }
  } else {                                     // the tip: solid moulded plastic
    m = new THREE.MeshPhysicalMaterial({ map: src.map, color: src.map ? 0xffffff : src.color, roughness: 0.38, clearcoat: 0.4, envMapIntensity: TOP_ENV.plastic });
  }
  m.side = THREE.FrontSide;
  return m;
}
// a top, solid, with its smeared copies; returns the pieces the loop moves
function assemble(parts) {
  const solid = new THREE.Group();
  for (const [g, m] of parts) { const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; solid.add(mesh); }
  const ghosts = [];
  for (let i = 0; i < GHOSTS; i++) {
    const f = i / (GHOSTS - 1), a = Math.min(0.85, 0.55 * 7 / GHOSTS) * Math.sin(Math.PI * (0.15 + 0.7 * f));
    const g = new THREE.Group();
    for (const [geo, m] of parts) {
      const mm = (Array.isArray(m) ? m : [m]).map((x) => { const c = x.clone(); c.transparent = true; c.opacity = a * (x.opacity ?? 1); c.depthWrite = false; return c; });
      g.add(new THREE.Mesh(geo, Array.isArray(m) ? mm : mm[0]));
    }
    g.visible = false; g.userData.frac = f;
    ghosts.push(g);
  }
  const spin = new THREE.Group(); spin.add(solid, ...ghosts);
  const body = new THREE.Group(); body.add(spin);           // tilted for the wobble and the fall
  const root = new THREE.Group(); root.add(body);
  return { root, body, spin, solid, ghosts };
}

// ------------------------------------------------------------------ sound
// Real recordings for everything physical (assets/sfx/bey/, all CC0 from Freesound: see CREDITS.md
// there): a real top's steady whirr with a dry metal top's whine over it, a Beyblade's ripcord
// launch, ring-on-ring hits, knocks on a plastic stadium heard from underneath, a top wobbling over
// and spinning down, clattering out. The countdown drums, the riser and the stingers are made here.
const CLIPS = ['spin_loop', 'whine_loop', 'rip', 'spindown', 'topple', 'ko_1', 'ko_2', 'grind_1', 'grind_2',
  ...[1, 2, 3, 4, 5, 6, 7].map((i) => `clash_${i}`), ...[1, 2, 3, 4, 5, 6].map((i) => `big_${i}`), ...[1, 2, 3, 4].map((i) => `wall_${i}`)];
let clipBank = null;
function loadClips(ctx) {
  clipBank ??= Promise.all(CLIPS.map(async (n) => {
    // the loops are WAV: MP3's encoder padding would tick every time they wrap
    const file = n.endsWith('_loop') ? `${n}.wav` : `${n}.mp3`;
    try { return [n, await ctx.decodeAudioData(await (await fetch(`assets/sfx/bey/${file}`)).arrayBuffer())]; } catch { return [n, null]; }
  })).then(Object.fromEntries);
  return clipBank;
}

function makeSound(audio) {
  const ctx = audio?.ctx, out = audio?.listener?.getInput?.();
  if (!ctx || !out) return null;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  const bus = ctx.createGain(); bus.gain.value = 1.5; bus.connect(comp).connect(out);
  // a short room echo for the big moments
  const echo = ctx.createDelay(0.5); echo.delayTime.value = 0.11;
  const fb = ctx.createGain(); fb.gain.value = 0.32;
  const wet = ctx.createGain(); wet.gain.value = 0.35;
  echo.connect(fb).connect(echo); echo.connect(wet).connect(bus);
  const noise = (() => { const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; })();
  const now = () => ctx.currentTime;
  const env = (g, t, peak, decay, attack = 0.002) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay); };
  const dest = (wetToo) => { const g = ctx.createGain(); g.connect(bus); if (wetToo) g.connect(echo); return g; };
  function burst(t, peak, decay, type, freq, q = 1, pan = 0, rate = 1, wetToo = false) {
    const s = ctx.createBufferSource(); s.buffer = noise; s.playbackRate.value = rate;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); env(g, t, peak, decay);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    s.connect(f).connect(g).connect(p).connect(dest(wetToo)); s.start(t, Math.random()); s.stop(t + decay + 0.1);
  }
  function tone(t, freq, peak, decay, type = 'sine', pan = 0, to = null, wetToo = false, attack = 0.002) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + decay);
    const g = ctx.createGain(); env(g, t, peak, decay, attack);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    o.connect(g).connect(p).connect(dest(wetToo)); o.start(t); o.stop(t + attack + decay + 0.1);
  }
  const kick = (t, k = 1) => { tone(t, 140, 0.9 * k, 0.28, 'sine', 0, 42); burst(t, 0.25 * k, 0.03, 'lowpass', 2500); };
  let clips = {};
  loadClips(ctx).then((c) => { clips = c; });
  // one recording, once; false if it isn't loaded (the made-up sound plays instead)
  function play(name, { gain = 1, rate = 1, pan = 0, offset = 0, wetToo = false, at = now() } = {}) {
    const b = clips[name]; if (!b) return false;
    const s = ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = gain;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    s.connect(g).connect(p).connect(dest(wetToo)); s.start(at, offset);
    return true;
  }
  const any = (kind, n) => `${kind}_${1 + Math.floor(Math.random() * n)}`;
  const vary = (k = 0.08) => 1 - k + Math.random() * 2 * k;
  // each top's whirr: the real top's hum and the metal whine, both pitched by the spin
  function recordedWhirr() {
    const loopOf = (name) => { const s = ctx.createBufferSource(); s.buffer = clips[name]; s.loop = true; s.start(now(), Math.random() * clips[name].duration); return s; };
    const hum = loopOf('spin_loop'), whine = loopOf('whine_loop');
    const hg = ctx.createGain(), wg = ctx.createGain(); hg.gain.value = wg.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
    const p = ctx.createStereoPanner();
    hum.connect(hg).connect(lp); whine.connect(wg).connect(lp); lp.connect(p).connect(bus);
    return {
      set(w, scrape, pan, rate = 1) {
        const k = Math.max(0, w / W_FULL), t = now();
        hum.playbackRate.setTargetAtTime(Math.max(0.2, (0.55 + 0.6 * k) * rate), t, 0.05);
        whine.playbackRate.setTargetAtTime(Math.max(0.2, (0.6 + 0.75 * k) * rate), t, 0.05);
        hg.gain.setTargetAtTime(1.1 * Math.pow(k, 1.0), t, 0.05);
        wg.gain.setTargetAtTime(0.55 * Math.pow(k, 1.6) * (1 + scrape), t, 0.05);
        lp.frequency.setTargetAtTime(1200 + 11000 * k * rate, t, 0.05);
        p.pan.setTargetAtTime(pan, t, 0.05);
      },
      stop() { const t = now(); hg.gain.setTargetAtTime(0, t, 0.06); wg.gain.setTargetAtTime(0, t, 0.06); hum.stop(t + 0.5); whine.stop(t + 0.5); },
    };
  }
  function whirr() {
    if (clips.spin_loop && clips.whine_loop) return recordedWhirr();
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 6;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const of = ctx.createBiquadFilter(); of.type = 'bandpass'; of.Q.value = 3;
    const og = ctx.createGain(); og.gain.value = 0.18;
    const g = ctx.createGain(); g.gain.value = 0;
    const p = ctx.createStereoPanner();
    s.connect(f).connect(g); o.connect(of).connect(og).connect(g); g.connect(p).connect(bus);
    s.start(); o.start();
    return {
      set(w, scrape, pan, rate = 1) {
        const k = Math.max(0, w / W_FULL), t = now();
        f.frequency.setTargetAtTime((700 + 4200 * k) * rate, t, 0.04);
        o.frequency.setTargetAtTime((120 + 420 * k) * rate, t, 0.04); of.frequency.setTargetAtTime((900 + 2400 * k) * rate, t, 0.04);
        g.gain.setTargetAtTime(0.16 * Math.pow(k, 1.2) * (1 + scrape), t, 0.04);
        p.pan.setTargetAtTime(pan, t, 0.05);
      },
      stop() { const t = now(); g.gain.setTargetAtTime(0, t, 0.05); s.stop(t + 0.4); o.stop(t + 0.4); },
    };
  }
  // two tops in contact: their edges grinding, short real grinds back to back while it lasts
  let grindUntil = 0;
  return {
    whirr,
    resume() { if (ctx.state !== 'running') ctx.resume(); },
    grind(level) {
      if (level <= 0.02 || now() < grindUntil) return;
      if (play(any('grind', 2), { gain: Math.min(0.9, level * 2.4), rate: vary(0.15), pan: 0 })) grindUntil = now() + 0.16 + Math.random() * 0.12;
    },
    beat(n) {              // the countdown: a drum hit, heavier each beat
      const t = now(); kick(t, 0.7 + 0.1 * n); tone(t, 220 * Math.pow(1.122, n), 0.12, 0.25, 'square', 0, null, true);
    },
    riser(dur) {           // air rushing up to "rip"
      const t = now(), s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(7000, t + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
      s.connect(f).connect(g).connect(bus); s.start(t); s.stop(t + dur + 0.2);
    },
    gaugeTick(k) { tone(now(), 600 + 900 * k, 0.05, 0.03, 'triangle'); },
    lock(k) { tone(now(), 400 + 700 * k, 0.25, 0.12, 'square'); if (k > 0.93) tone(now() + 0.05, 1600, 0.2, 0.3, 'sine', 0, null, true); },
    rip(pan, grade) {      // the ripcord tearing through the launcher, the top dropping in
      const t = now();
      if (!play('rip', { gain: 1.2, pan, rate: vary(0.04), wetToo: true })) {
        for (let i = 0; i < 22; i++) burst(t + 0.28 * Math.pow(i / 22, 0.7), 0.45, 0.012, 'bandpass', 3600, 3, pan);
        burst(t, 0.5, 0.45, 'bandpass', 1500, 0.7, pan, 1.4, true);
      }
      kick(t, 0.6);
      if (grade === 'Perfect') [0, 4, 7, 12].forEach((s, i) => tone(t + 0.04 * i, 880 * Math.pow(2, s / 12), 0.16, 0.6, 'triangle', 0, null, true));
      else if (grade === 'Great') [0, 7].forEach((s, i) => tone(t + 0.05 * i, 660 * Math.pow(2, s / 12), 0.14, 0.4, 'triangle', 0, null, true));
    },
    land(pan) {
      if (!play(any('wall', 4), { gain: 0.55, rate: vary(0.06) * 1.15, pan })) { burst(now(), 0.6, 0.06, 'lowpass', 1300, 0.7, pan); tone(now(), 110, 0.4, 0.15, 'sine', pan, 50); }
    },
    clash(power, pan) {    // ring on ring: a real metal hit, a heavier clang on top for the big ones, and a thump
      const t = now(), k = Math.min(1.4, power);
      const hit = play(any('clash', 7), { gain: 0.35 + 0.55 * Math.min(1, k), rate: vary(0.1), pan, wetToo: k > 0.6 });
      if (hit && k > 0.55) play(any('big', 6), { gain: 0.5 * Math.min(1.3, k), rate: vary(0.08), pan, wetToo: true });
      if (!hit) {
        for (const [f, d] of [[2370, 0.22], [3710, 0.16], [5240, 0.11], [7680, 0.07], [1180, 0.3]]) tone(t, f * (0.96 + Math.random() * 0.08), 0.2 * k, d, 'sine', pan, null, k > 0.6);
        burst(t, 0.9 * k, 0.04, 'highpass', 2200, 0.7, pan);
      }
      if (k > 0.6) tone(t, 90, 0.6 * Math.min(1, k), 0.3, 'sine', pan, 40, true);
    },
    wall(power, pan) {     // the ring knocking the plastic wall
      const k = Math.min(1, power);
      if (!play(any('wall', 4), { gain: 0.3 + 0.7 * k, rate: vary(0.08), pan })) { burst(now(), 0.8 * k, 0.07, 'lowpass', 1200, 0.8, pan); tone(now(), 180, 0.35 * k, 0.1, 'sine', pan, 90); }
    },
    whoosh(down = true) {  // into (or out of) slow motion
      const t = now(), s = ctx.createBufferSource(); s.buffer = noise;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.5;
      f.frequency.setValueAtTime(down ? 4000 : 500, t); f.frequency.exponentialRampToValueAtTime(down ? 300 : 4000, t + 0.5);
      const g = ctx.createGain(); env(g, t, 0.35, 0.5, 0.05);
      s.connect(f).connect(g).connect(bus); s.start(t); s.stop(t + 0.7);
    },
    knockout(pan) {        // flung out: a crack off the rim, then clattering onto the desk
      const t = now(); kick(t, 1.1);
      play(any('big', 6), { gain: 0.9, pan, wetToo: true });
      const out = play('ko_2', { gain: 0.9, pan, at: t + 0.28 }) | play('ko_1', { gain: 0.8, pan: pan * 0.7, offset: 0.3, at: t + 0.45 });
      if (!out) for (let i = 0; i < 8; i++) burst(t + 0.25 + 0.13 * i + Math.random() * 0.05, 0.6 * Math.pow(0.72, i), 0.05, 'bandpass', 2600, 1.5, pan);
    },
    topple(pan) {          // spun out: wobbling over, tapping faster and faster, then still
      const t = now();
      if (!play('topple', { gain: 1.1, pan })) for (let i = 0; i < 12; i++) burst(t + 0.7 * Math.pow(i / 12, 0.6), 0.4, 0.025, 'bandpass', 3000, 2, pan);
      play('spindown', { gain: 0.5, pan, offset: 2.5 });
    },
    grade(ok) { const t = now(); ok ? tone(t, 1320, 0.14, 0.25, 'triangle', 0, null, true) : tone(t, 160, 0.2, 0.25, 'sawtooth', 0, 110); },
    win() { const t = now(); [0, 4, 7, 12, 16].forEach((s, i) => { tone(t + 0.09 * i, 523 * Math.pow(2, s / 12), 0.18, 0.5, 'square', 0, null, true); tone(t + 0.09 * i, 262 * Math.pow(2, s / 12), 0.12, 0.6, 'triangle'); }); kick(t, 1); },
    lose() { const t = now(); [7, 3, 0, -5].forEach((s, i) => tone(t + 0.16 * i, 392 * Math.pow(2, s / 12), 0.16, 0.5, 'sawtooth', 0, null, true)); },
    close() { bus.gain.setTargetAtTime(0, now(), 0.05); setTimeout(() => bus.disconnect(), 400); },
  };
}

// ------------------------------------------------------------------ light trails
// a flat ribbon on the bowl behind each top, bright at the top and fading back
class Trail {
  constructor(color, n = 90) {
    this.n = n; this.pts = []; this.c = new THREE.Color(color); this.boost = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
  }
  clear() { this.pts.length = 0; }
  push(p, strength) {
    // a point every 3 mm along the path, filling in between frames so slow frames don't kink it
    const last = this.pts[0], step = 0.003;
    if (last) {
      const d = Math.hypot(p.x - last.x, p.z - last.z);
      if (d < step) { last.s = strength; return; }
      const n = Math.min(12, Math.floor(d / step));
      for (let i = 1; i <= n; i++) { const t = i / n; this.pts.unshift({ x: last.x + (p.x - last.x) * t, y: last.y + (p.y - last.y) * t, z: last.z + (p.z - last.z) * t, s: strength }); }
    } else this.pts.unshift({ x: p.x, y: p.y, z: p.z, s: strength });
    while (this.pts.length > this.n) this.pts.pop();
  }
  update() {
    const pos = this.mesh.geometry.attributes.position.array, col = this.mesh.geometry.attributes.color.array;
    const P = this.pts, n = this.n;
    for (let i = 0; i < n; i++) {
      const a = P[Math.min(i, P.length - 1)], b = P[Math.min(i + 1, P.length - 1)];
      if (!a) { for (let j = 0; j < 6; j++) { pos[i * 6 + j] = 0; col[i * 6 + j] = 0; } continue; }
      let dx = (b ? a.x - b.x : 0), dz = (b ? a.z - b.z : 0); const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const f = 1 - i / n, w = 0.0028 * (0.3 + 0.7 * f) * (1 + 0.5 * this.boost), k = f * f * a.s * 0.45 * (1 + 0.8 * this.boost);
      pos[i * 6] = a.x - dz * w; pos[i * 6 + 1] = a.y; pos[i * 6 + 2] = a.z + dx * w;
      pos[i * 6 + 3] = a.x + dz * w; pos[i * 6 + 4] = a.y; pos[i * 6 + 5] = a.z - dx * w;
      for (const o of [0, 3]) { col[i * 6 + o] = this.c.r * k; col[i * 6 + o + 1] = this.c.g * k; col[i * 6 + o + 2] = this.c.b * k; }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.color.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ the overlay
export function createBeyGame({ audio, onClose } = {}) {
  const root = document.createElement('div');
  root.id = 'bey';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Game');
  root.innerHTML = `<canvas aria-hidden="true"></canvas>
    <svg class="bey-cord" aria-hidden="true">
      <circle class="bey-target" r="26" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="3"/>
      <circle class="bey-ring" r="120" fill="none" stroke="#ffd23f" stroke-width="5"/>
    </svg>
    <div class="bey-gauge"><span>Power</span><b><i></i><em></em></b></div>
    <div class="bey-meters"><div class="bey-meter you"><span></span><b><i></i></b></div><div class="bey-meter cpu"><span></span><b><i></i></b></div></div>
    <div class="bey-call"></div>
    <div class="bey-grade"></div>
    <div class="bey-flash"></div>
    <div class="bey-prompt"></div>
    <div class="bey-tut" role="dialog" aria-label="How to play">
      <div class="bey-tut-card">
        <div class="bey-tut-art"></div>
        <div class="bey-tut-step"></div>
        <div class="bey-tut-title"></div>
        <div class="bey-tut-text"></div>
        <div class="inspect-actions"><button class="bey-tut-skip">Skip</button><button class="primary bey-tut-next">Next</button></div>
      </div>
    </div>
    <div class="inspect-card">
      <div class="inspect-title"></div>
      <div class="inspect-hint"></div>
      <div class="bey-tops"></div>
      <div class="inspect-actions"></div>
    </div>`;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const canvas = $('canvas'), call = $('.bey-call'), gradeEl = $('.bey-grade'), meters = $('.bey-meters'), flashEl = $('.bey-flash');
  const ringEl = $('.bey-ring'), targetEl = $('.bey-target'), gaugeEl = $('.bey-gauge'), gaugeFill = $('.bey-gauge i');
  const title = $('.inspect-title'), hint = $('.inspect-hint'), topsEl = $('.bey-tops'), actionsEl = $('.inspect-card .inspect-actions');
  const meterYou = $('.bey-meter.you'), meterCpu = $('.bey-meter.cpu');
  const promptEl = $('.bey-prompt'), tutEl = $('.bey-tut');
  const coarse = matchMedia('(pointer: coarse)').matches;

  let renderer, composer, scene, camera, stadium, sparks, flashes, open = false, ready = null, sound = null;
  const clock = new THREE.Clock();
  const parts = {};                        // each top's parts, loaded or built once
  const models = {};                       // and its model, assembled once
  let you = null, cpu = null, choice = 0, phase = 'idle', tRip = 0, battleT = 0, acc = 0;
  let launchState = null;                  // the player's launch in progress: { holding, holdT, power, locked, ... }
  let tGame = 0;                           // game time: runs slow in slow motion
  const tmp = new THREE.Vector3();

  // -------------------------------------------------- scene
  function build() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });   // (the composer draws into its own buffer: the canvas's antialiasing went unused)
    renderer.setPixelRatio(maxRatio());
    renderer.toneMapping = THREE.ACESFilmicToneMapping;   // as the inspect view; keeps the red deep where AgX turns it salmon
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = LITE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070605);
    scene.fog = new THREE.Fog(0x070605, 0.9, 2.6);
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.22;   // a dim room around it: the lamp does the work, the red stays deep
    // the desk lamp, up front and to the left, for the shadows in the bowl and a highlight on the rim
    const key = new THREE.SpotLight(0xffe2bf, 4.5, 2.5, 0.6, 0.75, 1.4);
    key.position.set(-0.28, 0.72, 0.42); key.castShadow = true;
    key.shadow.mapSize.setScalar(LITE ? 1024 : 2048); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.0015;
    key.shadow.camera.near = 0.3; key.shadow.camera.far = 1.6;
    scene.add(key, key.target);
    // a cool rim from behind, so the tops' edges catch light against the dark
    const rim = new THREE.SpotLight(0x9fc4ff, 2.2, 2.5, 0.7, 0.9, 1.4); rim.position.set(0.35, 0.45, -0.55); scene.add(rim, rim.target);
    camera = new THREE.PerspectiveCamera(32, 1, 0.005, 10);
    // the floor under the desk: speckled terrazzo tiles in the dark
    const fc = document.createElement('canvas'); fc.width = fc.height = 512;
    const fg = fc.getContext('2d'); fg.fillStyle = '#5d564d'; fg.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) { const v = 40 + Math.random() * 110; fg.fillStyle = `rgb(${v},${v * 0.95},${v * 0.88})`; fg.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5); }
    fg.strokeStyle = 'rgba(20,18,15,0.7)'; fg.lineWidth = 3; fg.strokeRect(0, 0, 512, 512);
    const ft = new THREE.CanvasTexture(fc); ft.colorSpace = THREE.SRGBColorSpace; ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(6, 6); ft.anisotropy = 8;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.55, color: 0x8a8580 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    // sparks off the metal wheels
    const N = 300;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    sparks = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.0032, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    sparks.userData = { v: new Float32Array(N * 3), life: new Float32Array(N), next: 0 };
    sparks.frustumCulled = false;
    scene.add(sparks);
    // flashes: a ring of light thrown out from each big hit
    const rc = document.createElement('canvas'); rc.width = rc.height = 128;
    const rg = rc.getContext('2d'), grd = rg.createRadialGradient(64, 64, 30, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,240,200,0)'); grd.addColorStop(0.6, 'rgba(255,230,180,0.9)'); grd.addColorStop(0.8, 'rgba(255,200,120,0.4)'); grd.addColorStop(1, 'rgba(255,180,90,0)');
    rg.fillStyle = grd; rg.fillRect(0, 0, 128, 128);
    const rtex = new THREE.CanvasTexture(rc);
    flashes = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: rtex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      m.rotation.x = -Math.PI / 2; m.visible = false; m.userData.life = 0; scene.add(m); flashes.push(m);
    }
    // bloom for the sparks, trails and glints, and a vignette
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.82));
    composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null }, amount: { value: 0.55 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv;
        void main() { vec4 c = texture2D(tDiffuse, vUv); float d = distance(vUv, vec2(0.5)); c.rgb *= 1.0 - amount * smoothstep(0.3, 0.85, d); gl_FragColor = c; }`,
    }));
    composer.addPass(new OutputPass());
    addEventListener('resize', resize);
  }

  // the stadium's red plastic, rebuilt from the same maps as in Blender (art/stadium)
  function stadiumMaterial(maps) {
    const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08 });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { wearMap: { value: maps.wear }, stickerMap: { value: maps.stickers }, logoMap: { value: maps.logo } });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 cyl; varying vec2 vTop; varying vec2 vCyl; varying float vUp;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTop = uv; vCyl = cyl; vUp = normalize(mat3(modelMatrix) * objectNormal).y;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D wearMap, stickerMap, logoMap; varying vec2 vTop; varying vec2 vCyl; varying float vUp;`)
        .replace('#include <map_fragment>', `
          vec3 wear = texture2D(wearMap, vTop).rgb;            // scratches, dust, smudges
          float flatness = smoothstep(0.55, 0.9, vUp);
          float scr = wear.r * flatness, dust = wear.g * flatness, smudge = wear.b;
          vec2 vinyl = texture2D(stickerMap, vCyl).rg;          // edge lift, sticker
          vec2 luv = (vTop - 0.5) * ${LOGO.toFixed(4)} + 0.5;
          float ink = all(greaterThan(luv, vec2(0.0))) && all(lessThan(luv, vec2(1.0))) ? texture2D(logoMap, luv).a : 0.0;
          vec3 col = vec3(0.42, 0.0035, 0.005);
          col = mix(col, vec3(0.008, 0.045, 0.42), ink);
          col = mix(col, vec3(0.07, 0.32, 0.86), vinyl.g);
          col = mix(col, vec3(0.8), vinyl.r * 0.25 * vinyl.g);
          col = mix(col, vec3(0.85, 0.42, 0.42), scr * 0.03);
          col = mix(col, vec3(0.36, 0.33, 0.30), dust * 0.55);
          diffuseColor.rgb *= col;`)
        .replace('#include <roughnessmap_fragment>', `
          float roughnessFactor = mix(0.06 + smudge * 0.16 + scr * 0.10 + dust * 0.55, 0.18 + vinyl.r * 0.4, vinyl.g);`);
    };
    return m;
  }

  async function load() {
    const tl = new THREE.TextureLoader();
    const tex = (f, srgb) => tl.loadAsync(`assets/stadium/${f}`).then((t) => {
      t.flipY = false; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
    });
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    const [gltf, wear, stickers, logo] = await Promise.all([loader.loadAsync('assets/stadium/stadium.glb'),
      tex('wear.jpg'), tex('stickers.png'), tex('swirl.png', true),
      loader.loadAsync('assets/launcher/launcher.glb').then((g) => { launcherSrc = g.scene; }).catch(() => {}),
      ...TOPS.map(async (T) => { parts[T.id] = (MODELLED.includes(T.id) && (await loadParts(T))) || buildParts(T); })]);
    logo.wrapS = logo.wrapT = THREE.ClampToEdgeWrapping;
    // the tops reflect the room at full strength (the stadium's own lighting keeps it dim)
    for (const id of MODELLED) for (const [, m] of parts[id] || []) if (m.isMeshStandardMaterial) m.envMap = scene.environment;
    stadium = gltf.scene;
    const mat = stadiumMaterial({ wear, stickers, logo });
    stadium.traverse((o) => {
      if (!o.isMesh) return;
      const uv1 = o.geometry.getAttribute('uv1'); if (uv1) o.geometry.setAttribute('cyl', uv1);
      o.material = mat; o.receiveShadow = true; o.castShadow = true;
    });
    stadium.scale.setScalar(SCALE);
    scene.add(stadium);
  }

  // the resolution: the screen's, up to 2x (1.5x on phones), stepped down while frames run long
  function maxRatio() { return Math.min(devicePixelRatio, LITE ? 1.5 : 2); }
  let ratio = maxRatio(), slowT = 0, frames = 0, spanT = 0, governing = false;   // (not while loading: compiling shaders stalls frames)
  function govern(realDt) {
    if (!governing) return;
    frames++; spanT += realDt;
    if (spanT < 1) return;
    const ms = spanT / frames * 1000; frames = 0; spanT = 0;
    if (ms > 24 && ratio > 1) { slowT++; if (slowT >= 2) { ratio = Math.max(1, ratio - 0.25); slowT = 0; resize(); } }
    else slowT = 0;
  }
  function resize() {
    if (!renderer) return;
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(ratio); composer.setPixelRatio(ratio);
    renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  // -------------------------------------------------- the camera: a director picking shots
  const cam = { pos: new THREE.Vector3(0, 0.5, 0.6), look: new THREE.Vector3(), fov: 32, k: 3 };
  const want = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 32 };
  let shot = 'wide', shotT = 0, shake = 0, punch = null;
  function setShot(s, k = 3) { if (shot !== s) { shot = s; shotT = 0; } cam.k = k; }
  // how far back to be for something `size` across to fill the frame, either way round
  const fit = (size, fov) => { const t = Math.tan(THREE.MathUtils.degToRad(fov / 2)); return size / 2 / Math.min(t, t * camera.aspect); };
  function direct(dt, realDt) {
    shotT += realDt;
    const narrow = camera.aspect < 1.2;
    if (shot === 'turntable') {              // the chosen top, close, turning
      const d = fit(0.07, 28), a = shotT * 0.35;
      want.look.set(0, 0.094, 0.02);
      want.pos.set(Math.sin(a) * d * 0.8, 0.094 + d * 0.45, 0.02 + Math.cos(a) * d * 0.8); want.fov = 28;
    } else if (shot === 'shoulder') {        // over your launcher, into the bowl
      want.look.set(0, 0.03, -0.03);
      const d = fit(narrow ? 0.4 : 0.34, 34);
      want.pos.set(0.03, 0.12 + d * 0.42, 0.082 + d * 0.78); want.fov = 34;
      want.pos.z -= Math.min(shotT, 2.4) * 0.02;      // creeping in with the beats
    } else if (shot === 'launch') {          // following your top down into the bowl
      const p = you.m.root.position;
      want.look.lerp(tmp.copy(p), 0.5);
      want.pos.set(p.x + 0.05, p.y + 0.09, p.z + 0.16); want.fov = 30;
    } else if (shot === 'battle') {          // broadcast: drifting round, keeping both tops in frame
      const ps = [you, cpu].filter((P) => P && P.state !== 'out').map((P) => P.m.root.position);
      const mid = ps.length ? ps.reduce((a, b) => a.clone().add(b)).multiplyScalar(1 / ps.length) : new THREE.Vector3();
      const spread = ps.length > 1 ? ps[0].distanceTo(ps[1]) : 0.05;
      want.look.lerpVectors(new THREE.Vector3(0, 0.02, 0), mid, 0.6);
      const size = THREE.MathUtils.clamp(spread * 1.6 + 0.16, 0.25, narrow ? 0.46 : 0.4);
      const d = fit(size, 32), a = 0.25 + battleT * 0.06, el = THREE.MathUtils.degToRad(48);
      want.pos.set(want.look.x + Math.sin(a) * Math.cos(el) * d, want.look.y + Math.sin(el) * d, want.look.z + Math.cos(a) * Math.cos(el) * d); want.fov = 32;
    } else if (shot === 'follow') {          // a top flying out of the stadium
      const P = [you, cpu].find((p) => p && p.state === 'out') || you;
      const p = P.m.root.position;
      want.look.lerp(p, 0.6);
      const back = tmp.set(p.x, 0, p.z).normalize();
      want.pos.set(p.x * 0.4 - back.x * 0.12, 0.2, p.z * 0.4 - back.z * 0.12 + 0.12); want.fov = 34;
    } else if (shot === 'winner') {          // round the one still standing
      const W = winner?.m.root.position ?? new THREE.Vector3();
      want.look.lerp(tmp.set(W.x, W.y + 0.015, W.z), 0.5);
      const a = shotT * 0.4, d = fit(0.12, 30);
      want.pos.set(W.x + Math.sin(a) * d * 0.85, W.y + d * 0.5, W.z + Math.cos(a) * d * 0.85); want.fov = 30;
    } else {                                 // wide: the whole stadium
      const d = fit(narrow ? 0.46 : 0.4, 32), a = shotT * 0.12, el = THREE.MathUtils.degToRad(50);
      want.look.set(0, 0.02, 0);
      want.pos.set(Math.sin(a) * Math.cos(el) * d, Math.sin(el) * d, Math.cos(a) * Math.cos(el) * d); want.fov = 32;
    }
    // a punch-in toward a big hit, briefly
    if (punch && performance.now() < punch.until) {
      want.look.lerp(punch.at, 0.6);
      want.pos.lerp(tmp.copy(punch.at).add(new THREE.Vector3(0.03, 0.08, 0.1)), 0.55);
    }
    const k = 1 - Math.exp(-realDt * cam.k);
    cam.pos.lerp(want.pos, k); cam.look.lerp(want.look, k); cam.fov += (want.fov - cam.fov) * k;
    shake *= Math.exp(-realDt * 12);
    camera.position.copy(cam.pos).add(tmp.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
    camera.lookAt(cam.look);
    if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
  }

  // -------------------------------------------------- slow motion
  let timeScale = 1;
  const slow = { to: 1, until: 0, back: 4 };
  function slowmo(scale, seconds, back = 4) {
    if (scale < slow.to || performance.now() > slow.until) { slow.to = scale; slow.until = performance.now() + seconds * 1000; slow.back = back; }
    sound?.whoosh(true);
  }
  function hitStop(ms) { timeScale = 0.02; slow.to = 0.02; slow.until = performance.now() + ms; slow.back = 30; }
  function updateTime(realDt) {
    const target = performance.now() < slow.until ? slow.to : 1;
    const k = target < timeScale ? 1 : 1 - Math.exp(-realDt * slow.back);
    timeScale += (target - timeScale) * k;
  }

  // -------------------------------------------------- the launcher
  // A Light Launcher, the ripcord launcher in the Metal Fight starter sets, modelled in Blender from
  // product photos (art/launcher/launcher.blend): a D-shaped housing, the launch disc whose two
  // C-shaped prongs hold the top by its face, and the toothed ripcord threaded right through it,
  // tail out of the round end, handle out of the flat end. It pulls along its own +x
  const PULL_LEN = 0.237;                       // the whole toothed length has to run through the gear
  let launcherSrc = null;
  const launchers = {};
  function getLauncher(side) {
    if (!launcherSrc) return null;
    if (launchers[side]) return launchers[side];
    const root = launcherSrc.clone(true), mats = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone(); o.material.transparent = true; mats.push(o.material);
      if (side === -1 && o.material.name === 'launcher_plastic') o.material.color.set(0xe8641c);   // theirs: the orange one
      o.castShadow = true;
    });
    root.visible = false;
    return (launchers[side] = { root, disc: root.getObjectByName('Launcher_Disc'), cord: root.getObjectByName('Ripcord'), mats });
  }
  const faceTop = (m) => {                      // how high the top stands: where the launcher's disc meets it
    if (m.faceTop) return m.faceTop;
    const q = m.body.quaternion.clone(), p = m.root.position.clone();
    m.body.quaternion.identity(); m.root.position.set(0, 0, 0); m.root.updateMatrixWorld(true);
    m.faceTop = new THREE.Box3().setFromObject(m.solid).max.y;
    m.body.quaternion.copy(q); m.root.position.copy(p); m.root.updateMatrixWorld(true);
    return m.faceTop;
  };
  // the launcher's recoil: a stiff, lightly damped spring (it's in a hand), kicked by the yank:
  // tipping about the ripcord's line and jerked along it, then shuddering back
  function recoil(L, P, yaw, dt) {
    const h = Math.min(dt, 1 / 60);
    L.kv += (-900 * L.kick - 16 * L.kv) * h; L.kick += L.kv * h;
    L.jv += (-1200 * L.jolt - 22 * L.jv) * h; L.jolt += L.jv * h;
    L.root.rotation.z = (L.tip || 0) + L.kick * 0.15;
    L.root.rotation.x = L.kick * 0.06;
    // jerked along the pull: applied as a change, since after release the position carries on by itself
    const off = L.jolt * 0.3, d = off - (L.off || 0); L.off = off;
    L.root.position.x += Math.cos(yaw) * d; L.root.position.z -= Math.sin(yaw) * d;
  }
  function drawLauncher(P, t, dt) {
    const L = P.ln; if (!L) return;
    const R = L.root, yaw = (P.side === 1 ? 0 : Math.PI) - 0.6;   // the ripcord out to the right, a little back towards you
    if (P.state === 'held' || P.state === 'pull') {
      R.visible = true; for (const m of L.mats) m.opacity = 1;
      const tp = P.m.root.position;
      R.position.set(tp.x, tp.y + faceTop(P.m), tp.z); L.off = 0;
      R.rotation.set(0, yaw, 0);
      let draw = 0;
      if (P.state === 'pull') {
        // the ripcord ripped out: a hand snapping back, at full speed almost at once
        const k = Math.min(1, P.pullT / P.pullDur);
        draw = 0.012 + PULL_LEN * (k < 0.15 ? (k / 0.15) * (k / 0.15) * 0.075 : 0.075 + (k - 0.15) / 0.85 * 0.925);
        if (!L.yanked) {                                     // the instant it goes: the launcher kicks
          L.yanked = true;
          L.kv = (14 + 30 * P.yank) * (Math.random() < 0.5 ? 1 : 0.8);
          L.jv = 0.25 + 0.9 * P.yank;
          if (fx.on) shake = Math.max(shake, 0.0015 + 0.005 * P.yank);
        }
      } else if (P === you && launchState) {
        // drawing the slack out, taut, as you build the power; held there once it's set
        draw = 0.012 * (launchState.holding ? gauge(t) : launchState.locked ? launchState.power : 0);
      } else if (P === cpu && P.cpuAt) {
        draw = 0.012 * THREE.MathUtils.clamp(1 - (P.cpuAt - t) / 1.2, 0, 1);
      }
      if (P.state === 'held') {
        L.yanked = false; L.kick = L.kv = L.jolt = L.jv = L.tip = L.off = 0; L.cord.rotation.set(0, 0, 0);
        if (draw > 0) R.position.x += (Math.random() - 0.5) * 0.0006 * draw / 0.012;   // a hand straining
      }
      recoil(L, P, yaw, dt);
      L.cord.position.x = draw;
      L.disc.rotation.y = P.m.solid.rotation.y;
      P.lt = 0;
    } else if (P.lt < 0.8) {
      // let go: the hand's follow-through carries launcher and ripcord up and away, the strip
      // whipping as it flies clear
      P.lt += dt; const k = Math.min(1, P.lt / 0.8), y = P.yank ?? 0.5;
      R.position.y += dt * (0.04 + 0.3 * k + 0.25 * y * (1 - k)); L.tip = (L.tip || 0) + dt * 0.6;
      R.position.x += Math.cos(yaw) * dt * (0.12 + 0.3 * y * (1 - k)); R.position.z -= Math.sin(yaw) * dt * (0.12 + 0.3 * y * (1 - k));
      recoil(L, P, yaw, dt);
      L.cord.position.x += dt * (0.3 + 3.2 * y) * Math.pow(1 - k, 3);
      L.cord.rotation.y = Math.sin(P.lt * 55) * 0.22 * y * Math.exp(-P.lt * 7);
      L.cord.rotation.z = Math.sin(P.lt * 41 + 1) * 0.12 * y * Math.exp(-P.lt * 7);
      L.disc.rotation.y -= dt * 80 * (1 - k);
      for (const m of L.mats) m.opacity = 1 - k * k;
    } else R.visible = false;
  }

  // -------------------------------------------------- a top in play
  function makePlayer(T, side) {
    if (!models[T.id]) models[T.id] = assemble(parts[T.id]);
    const m = models[T.id];
    scene.add(m.root);
    const trail = new Trail(T.trail); scene.add(trail.mesh);
    const ln = getLauncher(side); if (ln) scene.add(ln.root);
    return { T, m, trail, side, ln, lt: 1, pullT: 0, pullDur: 0.15, go: null, p: new THREE.Vector2(0, side * 0.082), v: new THREE.Vector2(), y: 0.07, vy: 0, w: 0, angle: 0,
      state: 'held', age: 0, tilt: 0, prec: Math.random() * 6, fall: 0, whirr: null, a: new THREE.Vector3(0, 1, 0), ad: new THREE.Vector3(), lean: 0, dying: false, scrapeT: 0, hitCool: 0, outV: new THREE.Vector3(), boost: 0, contact: 0 };
  }
  function place(P) {
    if (P.state === 'out') return;             // flying: the physics moves it
    const r = P.p.length(), s = surf(r);
    P.m.root.position.set(P.p.x, P.state === 'held' || P.state === 'pull' || P.state === 'drop' ? P.y : s.h, P.p.y);
  }

  // -------------------------------------------------- physics
  const STEP = 1 / 240;
  const fx = { on: true };                     // effects off while simulating unseen
  function stepTop(P, dt) {
    if (P.state === 'pull') {                  // in the launcher, spinning up as the ripcord runs through
      P.pullT += dt;
      const k = Math.min(1, P.pullT / P.pullDur);
      P.w = P.go.w * k;
      if (k >= 1) { P.state = 'drop'; P.vy = 0; P.v.set(P.go.vx, P.go.vz); }
      return;
    }
    if (P.state === 'drop') {                  // released: falling into the bowl
      P.vy -= G * dt; P.y += P.vy * dt; P.p.addScaledVector(P.v, dt);
      const rr = P.p.length();
      if (rr + P.T.ring > RIM) { const nx = P.p.x / rr, nz = P.p.y / rr, vr = P.v.x * nx + P.v.y * nz; if (vr > 0) { P.v.x -= 1.5 * vr * nx; P.v.y -= 1.5 * vr * nz; } }
      const s = surf(P.p.length());
      if (P.y <= s.h) { P.y = s.h; P.state = 'spin'; P.age = 0; kick(P, -P.v.x * HANDLING.mass * 0.5, -P.v.y * HANDLING.mass * 0.5); if (fx.on) { sound?.land(pan(P)); spark(tmp.set(P.p.x, s.h + 0.004, P.p.y), 0.6, 10); flash(tmp, 0.04); } }
      return;
    }
    if (P.state === 'out') {                   // over the rim and away
      P.outV.y -= G * dt; P.m.root.position.addScaledVector(P.outV, dt);
      if (P.m.root.position.y < 0.004) { P.m.root.position.y = 0.004; P.outV.multiplyScalar(0.35); P.outV.y = Math.abs(P.outV.y) * 0.3; }
      P.w = Math.max(0, P.w - 900 * dt);
      return;
    }
    if (P.state === 'down') {                  // on its side: rocking to rest on the wheel's edge
      P.v.multiplyScalar(Math.exp(-dt * 5)); P.p.addScaledVector(P.v, dt); P.w = Math.max(0, P.w - 120 * dt);
      const r = Math.max(P.p.length(), 1e-6); lean(P, dt, 0, 0, surf(r).s, P.p.x / r, P.p.y / r);
      P.ad.multiplyScalar(Math.exp(-dt * 3));
      return;
    }
    if (P.state !== 'spin') return;
    P.age += dt;
    const T = P.T, r = Math.max(P.p.length(), 1e-6), s = surf(r);
    const rx = P.p.x / r, rz = P.p.y / r;
    const vr = P.v.x * rx + P.v.y * rz;
    // down the slope (and the bowl's curve turning a top that runs up the wall)
    const ar = -(G * s.s + s.s * s.k * vr * vr) / (1 + s.s * s.s);
    const spinK = Math.min(1, P.w / W_FULL);
    const speed = P.v.length();
    let ax = ar * rx, az = ar * rz;
    if (speed > 1e-4) {
      // a right-spinning tip rolls the top anticlockwise round the bowl; a flat tip also drives it on
      const ux = P.v.x / speed, uz = P.v.y / speed;
      const curl = T.grip * spinK * Math.min(speed, 0.6) * 2.2;
      ax += uz * curl; az += -ux * curl;
      ax += ux * T.drive * spinK; az += uz * T.drive * spinK;
      ax -= P.v.x * T.drag; az -= P.v.y * T.drag;
    }
    // a leaning top's tip touches down off-centre and skates sideways on it
    if (P.tilt > 0.01) {
      const hx = P.a.x, hz = P.a.z, hl = Math.hypot(hx, hz) || 1, skate = 0.5 * G * 0.3 * Math.sin(P.tilt) * Math.min(1, P.w / 120);
      ax += (hz / hl) * skate; az += (-hx / hl) * skate;
    }
    P.v.x += ax * dt; P.v.y += az * dt;
    P.p.addScaledVector(P.v, dt);
    lean(P, dt, ax, az, s.s, rx, rz);
    // the ring against the wall: bounce off, or with enough speed outwards, over the rim
    const r2 = P.p.length();
    const ringReach = surf(Math.min(r2 + T.ring * 0.95, RIM)).h - surf(r2).h;
    const vr2 = (P.v.x * P.p.x + P.v.y * P.p.y) / Math.max(r2, 1e-6);
    if ((ringReach > 0.0165 || r2 + T.ring > RIM) && vr2 > 0) {
      const ang = Math.atan2(P.p.y, P.p.x);
      const nearNotch = NOTCHES.some((a) => Math.abs(Math.atan2(Math.sin(ang - a), Math.cos(ang - a))) < 0.14);
      if (P.age > 1.6 && vr2 > (nearNotch ? 0.8 : 0.95)) return knockOut(P, vr2);   // (not off its launch or the opening clash)
      const nx = P.p.x / r2, nz = P.p.y / r2;
      P.v.x -= (1 + 0.45) * vr2 * nx; P.v.y -= (1 + 0.45) * vr2 * nz;
      P.w -= vr2 * 30;
      kick(P, -nx * 1.45 * vr2 * T.mass, -nz * 1.45 * vr2 * T.mass);
      if (fx.on && vr2 > 0.12) { sound?.wall(vr2 / 0.8, pan(P)); spark(P.m.root.position.clone().add(tmp.set(nx, 0.012, nz).multiplyScalar(T.ring)), vr2 * 0.5, 6); }
    }
    // spin: a share to the air, a little to the tip, more to a tip that's skidding, and more again
    // as it leans and the tip rubs on its side
    P.w -= (T.decay * P.w + 2 + T.grip * speed * 1.5 + 40 * Math.sin(P.tilt)) * dt;
    if (P.w < W_STOP) { P.w = Math.max(P.w, 0); P.state = 'down'; }
  }
  // the axis: a heavy top on its tip, in the tip's own frame (so the bowl pushing the tip around is
  // felt as a force on the body, like braking in a car). With L = I1 a×ȧ + I3 w a:
  //   ä = gyroscope turning ȧ about a at I3*w/I1  +  the push on the centre of mass tipping it
  // The gyroscope part is applied as an exact rotation, in small enough steps to stay accurate
  const UP = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(), tv = new THREE.Vector3(), bv = new THREE.Vector3(), cv = new THREE.Vector3();
  function lean(P, dt, ax, az, slope, rx, rz) {
    const a = P.a, ad = P.ad, B = BODY;
    nrm.set(-slope * rx, 1, -slope * rz).normalize();          // the floor under the tip
    const spinning = P.state === 'spin';
    const w = spinning ? P.w : 0, Om = (B.I3 * w) / B.I1;
    const n = Math.max(1, Math.ceil((Om * dt) / 0.25)), h = dt / n;
    // fast enough to hold itself up, the tip's friction damps the nodding and stands the top back
    // up (the "rising top"); under that speed nothing holds it
    const hold = THREE.MathUtils.clamp((w / B.crit - 1) / 0.25, 0, 1);
    const damp = 1 - Math.exp(-h * (0.4 + 6 * hold));
    // ...but only while it's spinning fast enough: slower, the same friction does the opposite and the
    // top slowly sinks, its lean growing as it circles, until it's too slow to hold itself at all
    const rise = w > W_RISE ? Math.min(1, (w - W_RISE) / 60) * Math.min(4, (0.5 * W_FULL) / w)
      : -SINK * THREE.MathUtils.clamp((W_RISE - w) / (W_RISE - B.crit), 0, 1);
    // force per kg on the body, in the tip's frame: gravity, and the tip's sideways acceleration felt
    // backwards. Only part of that reaches the body: the tip is a small ball skidding on gloss, so it
    // slips rather than yanking the whole top over
    const gx = -ax * TIP_PULL, gy = -G, gz = -az * TIP_PULL;
    for (let i = 0; i < n; i++) {
      // the gyroscope: right spin is clockwise from above, so ȧ turns about a the other way
      const ph = -Om * h, c = Math.cos(ph), sn = Math.sin(ph);
      cv.crossVectors(a, ad);
      ad.multiplyScalar(c).addScaledVector(cv, sn);
      // the push tipping it: the part of it across the axis, times m*l/I1
      const ag = a.x * gx + a.y * gy + a.z * gz;
      tv.set(gx - a.x * ag, gy - a.y * ag, gz - a.z * ag);
      ad.addScaledVector(tv, (B.ml / B.I1) * h);
      // damping towards the slow precession it would settle into (τ / (I3*ω3), ω3 = -w)
      if (w > 1) { bv.crossVectors(a, tv).multiplyScalar(-B.ml / (B.I3 * w)); ad.lerp(bv, damp); }
      else ad.multiplyScalar(1 - damp);
      a.addScaledVector(ad, h).normalize();
      ad.addScaledVector(a, -ad.dot(a));
      // the rising top: the tip's friction stands it back up, towards upright
      if (rise > 0) { const k = Math.min(1, rise * h); a.lerp(UP, k).normalize(); }
      else if (rise < 0 && spinning) {
        tv.set(a.x, 0, a.z); const tl = tv.length();
        if (tl < 0.012) tv.set(Math.cos(P.prec), 0, Math.sin(P.prec)).multiplyScalar(0.012); // never perfectly true
        a.addScaledVector(tv, -rise * h).normalize();
      }
    }
    // leaning as far as the wheel's edge: it meets the floor, bounces off it, and scrapes
    P.tilt = Math.acos(THREE.MathUtils.clamp(a.y, -1, 1));     // off the vertical: how far it's actually leaning over
    const cosN = THREE.MathUtils.clamp(a.dot(nrm), -1, 1);  // off the floor under it: how near the edge is to touching
    P.lean = Math.acos(cosN);
    if (P.lean >= B.touch) {
      bv.copy(a).addScaledVector(nrm, -cosN).normalize();      // the way it leans
      a.copy(nrm).multiplyScalar(Math.cos(B.touch)).addScaledVector(bv, Math.sin(B.touch));
      const out = ad.dot(bv);
      if (out > 0) ad.addScaledVector(bv, -(1 + 0.35) * out);
      P.lean = B.touch;
      if (!spinning) return;
      // the edge is moving at w*R where it touches: friction there eats the spin, fast, and
      // shoves the top along sideways
      P.w -= ((0.4 * 0.5 * HANDLING.mass * G * B.rim) / B.I3 + 1.1 * Math.max(0, out)) * dt;
      cv.crossVectors(a, bv); const cl = Math.hypot(cv.x, cv.z) || 1;
      P.v.x += (cv.x / cl) * 0.4 * 0.5 * G * dt; P.v.y += (cv.z / cl) * 0.4 * 0.5 * G * dt;
      if (P.w < B.crit * 1.05 && !P.dying) {                  // the death wobble: it isn't getting up from this
        P.dying = true;
        if (fx.on) { sound?.topple(pan(P)); finishCam(P); }
      }
      if (fx.on && (P.scrapeT -= dt) <= 0) {
        P.scrapeT = 0.09;
        const e = tmp.set(bv.x * B.rim, 0.002, bv.z * B.rim).add(P.m.root.position);
        spark(e, 0.25 + Math.min(1, out * 0.1), 4);
        if (!P.dying) sound?.wall(0.25, pan(P));
      }
    }
  }
  // a knock on the ring (an impulse, kg m/s, across the floor) tips the axis: ΔL = lever * a × J
  function kick(P, jx, jz) {
    const a = P.a, k = BODY.lever / BODY.I1;
    cv.set(a.y * jz, a.z * jx - a.x * jz, -a.y * jx).multiplyScalar(k);   // (a × J) * lever / I1
    P.ad.add(tv.crossVectors(cv, a));
  }
  function knockOut(P, vr) {
    P.state = 'out';
    const r = P.p.length(), nx = P.p.x / r, nz = P.p.y / r;
    P.m.root.position.y = surf(r).h;
    P.outV.set(nx * vr * 0.8 + P.v.x * 0.3, 0.9 + vr * 0.5, nz * vr * 0.8 + P.v.y * 0.3);
    if (!fx.on) return;
    sound?.knockout(pan(P));
    shake = Math.max(shake, 0.006);
    spark(P.m.root.position.clone().add(tmp.set(nx * 0.02, 0.015, nz * 0.02)), 2, 40);
    flash(P.m.root.position, 0.09);
    hitStop(90); setTimeout(() => slowmo(0.22, 1.4, 2), 90);
    setShot('follow', 5);
  }
  function finishCam(P) {                       // the finish in slow motion, on the one going down
    if (phase !== 'battle') return;
    slowmo(0.3, 1.2, 2);
    punch = { at: P.m.root.position.clone(), until: performance.now() + 1100 };
  }
  function collide(a, b) {
    if (a.state !== 'spin' || b.state !== 'spin') { a.contact = b.contact = 0; return; }
    const dx = b.p.x - a.p.x, dz = b.p.y - a.p.y, d = Math.hypot(dx, dz), min = a.T.ring + b.T.ring;
    if (d >= min + 0.001 || d < 1e-6) { a.contact = Math.max(0, a.contact - 0.05); return; }
    a.contact = 1;
    if (d >= min) return;
    const nx = dx / d, nz = dz / d, ma = a.T.mass, mb = b.T.mass;
    const push = (min - d) / (ma + mb);           // pull them apart, the lighter one further
    a.p.x -= nx * push * mb; a.p.y -= nz * push * mb; b.p.x += nx * push * ma; b.p.y += nz * push * ma;
    const rel = (b.v.x - a.v.x) * nx + (b.v.y - a.v.y) * nz;
    const mEff = 1 / (1 / ma + 1 / mb);
    const J = rel < 0 ? -1.45 * rel * mEff : 0;
    let Js = 0, shareA = 1, shareB = 1;
    if (a.hitCool <= 0) {
      // the spinning edges meeting: both right-spinning, they grind against each other. How hard is
      // down to what you can see: how fast they close and how much spin they carry, give or take a
      // little for where on the wheels they catch
      const smash = (a.T.smash + b.T.smash) / 2;
      const closing = THREE.MathUtils.clamp(0.35 + Math.max(0, -rel) / 0.4, 0.35, 1.3);
      Js = smash * ((a.w + b.w) / (2 * W_FULL)) * 0.011 * closing * (0.85 + Math.random() * 0.3);
      a.hitCool = b.hitCool = 0.12;
      // who comes off worse, by physics, not a coin flip:
      // - the faster spinner keeps more (its edge is moving faster where they meet)
      // - the one driving into the hit deals it; the one it lands on takes it
      const spinA = Math.sqrt(Math.max(b.w, 1) / Math.max(a.w, 1));
      const inA = Math.max(0, a.v.x * nx + a.v.y * nz), inB = Math.max(0, -(b.v.x * nx + b.v.y * nz));
      const lean = (inB - inA) / (inA + inB + 0.05);
      const fa = spinA * (1 + 0.5 * lean), fb = (1 / spinA) * (1 - 0.5 * lean);
      shareA = 2 * fa / (fa + fb); shareB = 2 - shareA;
    }
    const total = J + Js;
    if (total <= 0) return;
    const ka = 1 / (ma * a.T.guard), kb = 1 / (mb * b.T.guard);
    a.v.x -= nx * total * ka; a.v.y -= nz * total * ka;
    b.v.x += nx * total * kb; b.v.y += nz * total * kb;
    // and sideways, each carried along the other's turning edge
    const tx = -nz, tz = nx, side = Js * 0.4;
    a.v.x -= tx * side * ka; a.v.y -= tz * side * ka; b.v.x += tx * side * kb; b.v.y += tz * side * kb;
    // and the knock, landing on the rings above the tips, sets both axes nodding
    const jx = nx * total + tx * side, jz = nz * total + tz * side;
    kick(a, -jx / a.T.guard, -jz / a.T.guard); kick(b, jx / b.T.guard, jz / b.T.guard);
    // no single hit takes more than a fifth of a top's spin: a top dies by slowing and wobbling,
    // which you can watch coming, or by being knocked out of the bowl
    a.w -= Math.min(a.w * 0.2, total * 420 * shareA * (b.T.smash / a.T.guard));
    b.w -= Math.min(b.w * 0.2, total * 420 * shareB * (a.T.smash / b.T.guard));
    if (fx.on && total > 0.004) {
      const at = new THREE.Vector3((a.p.x + b.p.x) / 2, 0, (a.p.y + b.p.y) / 2);
      at.y = surf(Math.hypot(at.x, at.z)).h + 0.02;
      const k = total / 0.025;
      spark(at, k, Math.round(8 + total * 900));
      sound?.clash(k, at.x / 0.18);
      shake = Math.max(shake, Math.min(0.008, total * 0.16));
      if (total > 0.016) flash(at, 0.035 + total * 1.5);
      if (total > 0.022 && phase === 'battle' && performance.now() > lastBig + 1800) {   // the big ones: a beat of stillness, then slow
        lastBig = performance.now();
        hitStop(70); setTimeout(() => slowmo(0.3, 0.55, 3), 70);
        punch = { at: at.clone(), until: performance.now() + 700 };
        flashScreen(0.35);
      }
    }
  }
  let lastBig = 0;
  function spark(at, power, n) {
    const d = sparks.userData, pos = sparks.geometry.attributes.position.array;
    const N = d.life.length;
    for (let i = 0; i < n; i++) {
      const k = d.next = (d.next + 1) % N;
      pos[k * 3] = at.x; pos[k * 3 + 1] = at.y; pos[k * 3 + 2] = at.z;
      const a = Math.random() * Math.PI * 2, s = (0.4 + Math.random() * 1.4) * Math.min(2.2, 0.5 + power);
      d.v[k * 3] = Math.cos(a) * s; d.v[k * 3 + 1] = 0.3 + Math.random() * 1.2; d.v[k * 3 + 2] = Math.sin(a) * s;
      d.life[k] = 0.2 + Math.random() * 0.3;
    }
  }
  function updateSparks(dt) {
    const d = sparks.userData, pos = sparks.geometry.attributes.position.array, col = sparks.geometry.attributes.color.array;
    for (let k = 0; k < d.life.length; k++) {
      if (d.life[k] <= 0) { col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = 0; continue; }
      d.life[k] -= dt; d.v[k * 3 + 1] -= G * 0.5 * dt;
      for (let j = 0; j < 3; j++) pos[k * 3 + j] += d.v[k * 3 + j] * dt;
      if (pos[k * 3 + 1] < 0.002) { pos[k * 3 + 1] = 0.002; d.v[k * 3 + 1] *= -0.4; }
      const f = Math.max(0, d.life[k] / 0.35);
      col[k * 3] = 3.0 * f; col[k * 3 + 1] = 1.9 * f * f; col[k * 3 + 2] = 0.8 * f * f * f;
    }
    sparks.geometry.attributes.position.needsUpdate = true; sparks.geometry.attributes.color.needsUpdate = true;
  }
  function flash(at, size) {
    const m = flashes.find((f) => f.userData.life <= 0) || flashes[0];
    m.position.set(at.x, at.y + 0.001, at.z); m.userData.life = 1; m.userData.size = size; m.visible = true;
  }
  function updateFlashes(dt) {
    for (const m of flashes) {
      if (m.userData.life <= 0) { m.visible = false; continue; }
      m.userData.life -= dt * 3.5;
      const k = 1 - m.userData.life;
      m.scale.setScalar(m.userData.size * (0.3 + k * 1.2)); m.material.opacity = Math.max(0, m.userData.life) * 1.5;
    }
  }
  function flashScreen(a) { flashEl.style.transition = 'none'; flashEl.style.opacity = a; requestAnimationFrame(() => { flashEl.style.transition = 'opacity .35s'; flashEl.style.opacity = 0; }); }
  const pan = (P) => THREE.MathUtils.clamp(P.p.x / 0.16, -1, 1);

  // -------------------------------------------------- drawing a top
  const axis = new THREE.Vector3();
  function drawTop(P, dt) {
    place(P);
    const m = P.m;
    // the spin: really that fast, smeared across what the shutter would see
    const dir = -1;                                   // right spin: clockwise from above
    P.angle = (P.angle + dir * P.w * dt) % (Math.PI * 2);
    const sweep = P.w * SHUTTER * Math.max(timeScale, 0.15);
    const blur = sweep > 0.3;
    m.solid.visible = !blur;
    m.solid.rotation.y = P.angle;
    for (const g of m.ghosts) { g.visible = blur; g.rotation.y = P.angle - dir * sweep * g.userData.frac; }
    // the wobble as it slows, leaning round faster and faster; then over onto its side
    // the lean: straight from the physics, its axis as it is; flying out of the bowl, tumbling
    if (P.state === 'out') {
      P.fall = Math.min(1, P.fall + dt * 1.6);
      P.prec += dt * 3;
      axis.set(Math.cos(P.prec), 0, Math.sin(P.prec));
      m.body.quaternion.setFromAxisAngle(axis, P.fall * 1.9);
    } else m.body.quaternion.setFromUnitVectors(UP, P.a);
    m.body.position.y = 0;
    // its light trail on the bowl
    if (P.state === 'spin') P.trail.push(tmp.set(P.m.root.position.x, P.m.root.position.y + 0.0015, P.m.root.position.z), Math.min(1, P.w / W_FULL) * (0.4 + P.boost));
    else if (P.trail.pts.length) P.trail.pts.pop();
    P.trail.boost = P.boost; P.trail.update();
  }

  // -------------------------------------------------- the match
  let callTimer = 0;
  function setCall(text, ms = 0) {
    call.textContent = text; call.classList.toggle('on', !!text);
    if (text) { call.classList.remove('pop'); void call.offsetWidth; call.classList.add('pop'); }
    clearTimeout(callTimer); if (text && ms) callTimer = setTimeout(() => call.classList.remove('on'), ms);
  }
  let gradeTimer = 0;
  function showGrade(text, good) {
    gradeEl.textContent = text; gradeEl.className = 'bey-grade on ' + (good ? 'good' : 'bad');
    void gradeEl.offsetWidth; gradeEl.classList.add('pop');
    clearTimeout(gradeTimer); gradeTimer = setTimeout(() => gradeEl.classList.remove('on'), 1100);
  }
  function setActions(list) {
    actionsEl.innerHTML = '';
    for (const a of list) {
      const b = document.createElement('button'); b.textContent = a.label;
      if (a.primary) b.className = 'primary';
      b.addEventListener('click', a.run);
      actionsEl.appendChild(b);
    }
    actionsEl.querySelector('.primary')?.focus({ preventScroll: true });
  }
  function card(t, h) { title.textContent = t; hint.textContent = h; root.classList.toggle('slim', !t); }
  function clearTops() {
    for (const P of [you, cpu]) if (P) { scene.remove(P.m.root); scene.remove(P.trail.mesh); if (P.ln) scene.remove(P.ln.root); P.whirr?.stop(); }
    you = cpu = null; winner = null; sound?.grind(0);
  }
  let winner = null;
  // how to play: three cards, shown the first time and from the choose screen
  const GUIDE = [
    { title: '1 · Power', art: 'power',
      text: () => `${coarse ? 'Press and hold anywhere' : 'Click and hold anywhere (or hold Space)'} to pull the ripcord. That starts the count. The power bar swings up and down: <b>let go when it's right at the top</b>, in the gold band, for full power.` },
    { title: '2 · Let it rip', art: 'rip',
      text: () => `Then a yellow ring closes in on your top. <b>${coarse ? 'Tap' : 'Click (or press Space)'} the moment it meets the white circle</b>, right as “Let it rip!” appears. Spot on is a Perfect launch: the most spin there is.` },
    { title: '3 · Win', art: 'win',
      text: () => `Knock the other top out of the stadium, or keep spinning after it stops. Every top handles the same, so <b>it all comes down to your launch</b>: full power and a Perfect rip give you the most spin and the hardest hits.` },
  ];
  const ART = {
    power: `<div class="art-gauge"><i></i><em></em></div><div class="art-hand">hold</div>`,
    rip: `<div class="art-rip"><b></b><i></i><span>Let it rip!</span></div>`,
    win: `<div class="art-win"><span>Ring out</span><em>or</em><span>Spin finish</span></div>`,
  };
  let guideAt = 0, guideDone = null;
  function guide(then) {
    guideAt = 0; guideDone = then; tutEl.classList.add('on'); showGuide();
  }
  function showGuide() {
    const g = GUIDE[guideAt];
    $('.bey-tut-art').innerHTML = ART[g.art];
    $('.bey-tut-step').textContent = `How to play · ${guideAt + 1} of ${GUIDE.length}`;
    $('.bey-tut-title').textContent = g.title;
    $('.bey-tut-text').innerHTML = g.text();
    $('.bey-tut-next').textContent = guideAt === GUIDE.length - 1 ? 'Got it' : 'Next';
    $('.bey-tut-next').focus({ preventScroll: true });
  }
  function endGuide() {
    tutEl.classList.remove('on');
    try { localStorage.setItem('bey-guide', '1'); } catch {}
    const f = guideDone; guideDone = null; f?.();
  }
  $('.bey-tut-next').addEventListener('click', () => { if (++guideAt >= GUIDE.length) endGuide(); else showGuide(); });
  $('.bey-tut-skip').addEventListener('click', endGuide);
  const seenGuide = () => { try { return localStorage.getItem('bey-guide') === '1'; } catch { return false; } };

  // each top's picture, rendered once from its own model: the choose buttons and the spin meters
  // show the tops themselves, never their names
  const thumbs = {};
  function renderThumbs() {
    if (Object.keys(thumbs).length) return;
    const S = 192, rt = new THREE.WebGLRenderTarget(S, S, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const ts = new THREE.Scene();
    ts.environment = scene.environment; ts.environmentIntensity = 0.16;
    const key = new THREE.DirectionalLight(0xffffff, 1.3); key.position.set(-0.4, 1, 0.5); ts.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.8); rim.position.set(0.6, 0.3, -0.8); ts.add(rim);
    const cam = new THREE.PerspectiveCamera(26, 1, 0.01, 2);
    cam.position.set(0, 0.078, 0.088); cam.lookAt(0, 0.017, 0);
    const px = new Uint8Array(S * S * 4), c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), img = g.createImageData(S, S);
    const clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    for (const T of TOPS) {
      const m = assemble(parts[T.id]);
      m.body.rotation.set(0.12, 0, -0.1); m.solid.rotation.y = 0.6;
      ts.add(m.root);
      renderer.setRenderTarget(rt); renderer.clear(); renderer.render(ts, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, S, S, px);
      for (let y = 0; y < S; y++) img.data.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);   // rows come bottom-up
      g.putImageData(img, 0, 0);
      thumbs[T.id] = c.toDataURL();
      ts.remove(m.root);
    }
    renderer.setRenderTarget(null); renderer.setClearColor(clear, alpha);
    rt.dispose();
  }

  // choosing: the four tops, the chosen one turning in close-up
  function pick() {
    clearTops();
    phase = 'pick'; launchState = null; hideLaunchUI();
    setCall(''); meters.classList.remove('on');
    card('Choose your top', 'They all handle the same: pick the one you like');
    renderThumbs();
    topsEl.innerHTML = TOPS.map((T, i) => `<button class="${i === choice ? 'on' : ''}" aria-label="${T.name}"><img src="${thumbs[T.id]}" alt=""></button>`).join('');
    topsEl.querySelectorAll('button').forEach((b, i) => b.addEventListener('click', () => { choice = i; pick(); }));
    setActions([{ label: 'Ready', primary: true, run: countdown }, { label: 'How to play', run: () => guide() }, { label: 'Close', run: close }]);
    you = makePlayer(TOPS[choice], 1);
    setShot('turntable', 3);
  }
  // 3, 2, 1, let it rip: power first, then the rip on the beat
  function countdown() {
    sound?.resume();
    phase = 'count'; topsEl.innerHTML = '';
    const pool = TOPS.filter((_, i) => i !== choice);
    cpu = makePlayer(pool[Math.floor(Math.random() * pool.length)], -1);
    card('', '');
    hint.textContent = '';
    setActions([{ label: 'Give up', run: () => { clearTops(); pick(); } }]);
    meterYou.querySelector('span').innerHTML = `<img src="${thumbs[you.T.id]}" alt="">`; meterCpu.querySelector('span').innerHTML = `<img src="${thumbs[cpu.T.id]}" alt="">`;
    // nothing moves until you start pulling: that starts the count
    launchState = { waiting: true, holding: false, holdT: 0, power: 0, locked: false, ripped: false };
    tRip = Infinity; cpu.cpuAt = Infinity;
    setShot('shoulder', 2.5);
  }
  function startBeats() {
    const t0 = performance.now() / 1000 + 0.3;
    tRip = t0 + BEAT * 3;
    ['3', '2', '1'].forEach((n, i) => later(t0 + i * BEAT, () => { setCall(n); sound?.beat(i); shake = Math.max(shake, 0.0015 + i * 0.001); }));
    later(tRip - 1.0, () => sound?.riser(1.0));
    later(tRip, () => { setCall('Let it rip!', 900); flashScreen(0.18); });
    // the computer: its gauge and its rip, a little off at random
    const cpuPower = 0.62 + Math.random() * 0.38, cpuOff = (Math.random() - 0.4) * 0.22;
    cpu.cpuAt = tRip + cpuOff; cpu.cpuAim = steady();
    cpu.cpuGrade = { power: cpuPower, rip: gradeOf(RIP_GRADES, Math.abs(cpuOff)) };
  }
  const timers = [];
  function later(atSec, fn) { timers.push(setTimeout(() => { if (open && (phase === 'count' || phase === 'battle')) fn(); }, Math.max(0, atSec * 1000 - performance.now()))); }
  const gradeOf = (list, v, up = false) => list.find(([lim]) => (up ? v >= lim : v <= lim));
  function gauge(t) { return 0.5 - 0.5 * Math.cos(((t - launchState.holdT) / GAUGE_PERIOD) * Math.PI * 2); }
  function launch(P, aim, power, ripMul, label) {
    // the rip: the ripcord tears through the gear for a moment (faster, the harder you pulled),
    // spinning the top up in the launcher; then the prongs let go and it drops
    // how violent the yank is: the power you built and how cleanly you hit the beat. A perfect,
    // full-power rip tears the whole ripcord through in 40 ms; a weak, late one drags for 110
    P.yank = Math.pow(THREE.MathUtils.clamp(power, 0, 1), 0.7) * THREE.MathUtils.clamp((ripMul - 0.85) / 0.25, 0.15, 1);
    P.state = 'pull'; P.pullT = 0; P.pullDur = 0.13 - 0.09 * P.yank; P.vy = 0;
    P.a.set(0, 1, 0); P.ad.set(0, 0, 0); P.lean = 0; P.dying = false;
    const dirx = Math.sin(aim) * -P.side, dirz = -Math.cos(aim) * P.side;
    const v = Math.min(0.8, (0.22 + 0.5 * power) * (0.85 + 0.15 * ripMul));
    P.go = { vx: dirx * v, vz: dirz * v, w: W_FULL * (0.74 + 0.26 * power) * ripMul };
    P.v.set(0, 0); P.w = 0;
    P.boost = label === 'Perfect' ? 1.2 : label === 'Great' ? 0.5 : 0;
    P.whirr = sound?.whirr() ?? null;
    if (fx.on) sound?.rip(pan(P), label);
  }
  // no aiming: every launch goes straight in, give or take a hand that's never perfectly steady
  const steady = () => (Math.random() - 0.5) * 0.2;
  // the player's two skills
  function startHold() {
    const L = launchState; if (!L || L.locked || phase !== 'count') return;
    sound?.resume();
    if (L.waiting) { L.waiting = false; startBeats(); }
    L.holding = true; L.holdT = performance.now() / 1000; lastTickHalf = 0;
  }
  function lockPower() {
    const L = launchState; if (!L || !L.holding || L.locked) return;
    L.holding = false; L.locked = true; L.power = gauge(performance.now() / 1000);
    const [, label] = gradeOf(POWER_GRADES, L.power, true);
    sound?.lock(L.power); showGrade(label, L.power >= 0.8);
    if (L.power >= 0.94) flashScreen(0.12);
  }
  function tryRip() {
    const L = launchState; if (!L || !L.locked || L.ripped) return;
    const off = performance.now() / 1000 - tRip;
    if (off < -0.45) return;                     // far too soon: ignore, it isn't the beat yet
    L.ripped = true;
    const [, label, mul] = gradeOf(RIP_GRADES, Math.abs(off));
    launch(you, steady(), L.power, mul, label);
    showGrade(label === 'Off beat' ? (off < 0 ? 'Too early' : 'Too late') : label, mul >= 1.05);
    if (label === 'Perfect') { flashScreen(0.4); shake = Math.max(shake, 0.004); }
    setTimeout(() => sound?.grade(mul >= 1.05), 60);
    hideLaunchUI();
    setTimeout(() => slowmo(0.28, 0.9, 2.2), you.pullDur * 1000 + 30); setShot('launch', 6);   // the yank at full speed, then slow
  }
  function hideLaunchUI() { ringEl.style.display = targetEl.style.display = 'none'; gaugeEl.classList.remove('on'); promptEl.classList.remove('on'); }
  function prompt(text, x, y, kind) {
    if (promptEl.dataset.text !== text) { promptEl.innerHTML = text; promptEl.dataset.text = text; promptEl.classList.remove('pop'); void promptEl.offsetWidth; promptEl.classList.add('pop'); }
    promptEl.className = `bey-prompt on ${kind || ''}` + (promptEl.classList.contains('pop') ? ' pop' : '');
    promptEl.style.left = `${x}px`; promptEl.style.top = `${y}px`;
  }
  let lastTickHalf = 0;
  function launchUI(t) {
    const L = launchState; if (!L || !you) return hideLaunchUI();
    const sp = you.m.root.position.clone().project(camera);
    const x = (sp.x * 0.5 + 0.5) * innerWidth, y = (-sp.y * 0.5 + 0.5) * innerHeight;
    const above = y - Math.min(innerHeight * 0.16, 120);
    const press = coarse ? 'Press and hold' : 'Click and hold (or Space)';
    if (L.waiting) prompt(`${press}<small>to pull the ripcord</small>`, x, above, 'wait');
    else if (L.holding) prompt(`Let go at the top!<small>watch the power bar →</small>`, x, above, 'hold');
    else if (L.locked && !L.ripped) prompt(`${coarse ? 'Tap' : 'Click'} when the ring hits!<small>right on “Let it rip!”</small>`, x, above, 'rip');
    else promptEl.classList.remove('on');
    // the gauge, swinging while you hold
    if (!L.locked) {
      gaugeEl.classList.add('on');
      const g = L.holding ? gauge(t) : 0;
      gaugeFill.style.transform = `scaleY(${g})`;
      gaugeEl.classList.toggle('hot', g >= 0.94);
      const half = Math.floor((t - L.holdT) / (GAUGE_PERIOD / 2));
      if (L.holding && half !== lastTickHalf) { lastTickHalf = half; if (half % 2 === 1) sound?.gaugeTick(1); }
    } else gaugeEl.classList.remove('on');
    // the ring closing on your top, meeting it on "rip"
    if (L.locked && !L.ripped) {
      const left = tRip - t;
      const r = 26 + Math.max(-0.4, left) / 1.2 * 150;
      targetEl.setAttribute('cx', x); targetEl.setAttribute('cy', y);
      ringEl.setAttribute('cx', x); ringEl.setAttribute('cy', y); ringEl.setAttribute('r', Math.max(4, r));
      ringEl.setAttribute('stroke', Math.abs(left) < 0.06 ? '#7dff9a' : '#ffd23f');
      ringEl.style.display = targetEl.style.display = left < 1.2 ? '' : 'none';
    } else { ringEl.style.display = targetEl.style.display = 'none'; }
  }
  function onKey(e) {
    if (!open) return;
    if (tutEl.classList.contains('on')) {
      if (e.type === 'keydown' && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endGuide(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (phase === 'pick' && e.type === 'keydown' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); choice = (choice + (e.key === 'ArrowLeft' ? -1 : 1) + TOPS.length) % TOPS.length; pick(); return; }
    if (phase !== 'count' || !launchState) return;
    const L = launchState;
    if (e.key !== ' ') return;
    e.preventDefault();
    if (e.type === 'keydown' && !e.repeat) { if (!L.locked) startHold(); else tryRip(); }
    if (e.type === 'keyup' && L.holding) lockPower();
  }
  addEventListener('keydown', onKey, true); addEventListener('keyup', onKey, true);
  canvas.addEventListener('pointerdown', (e) => {
    if (phase !== 'count' || !launchState) return;
    if (!launchState.locked) { startHold(); canvas.setPointerCapture(e.pointerId); } else tryRip();
  });
  canvas.addEventListener('pointerup', () => lockPower()); canvas.addEventListener('pointercancel', () => lockPower());

  function finish(text, sub, won) {
    phase = 'over';
    setCall(text, 2200);
    won === true ? sound?.win() : won === false ? sound?.lose() : null;
    setTimeout(() => {
      if (phase !== 'over') return;
      card(text, sub);
      setActions([{ label: 'Rematch', primary: true, run: () => { const c = choice; clearTops(); choice = c; pick(); countdown(); } },
        { label: 'Change top', run: pick }, { label: 'Close', run: close }]);
    }, 1400);
    winner = won === true ? you : won === false ? cpu : null;
    setTimeout(() => { if (phase === 'over') setShot(winner && winner.state === 'spin' ? 'winner' : 'wide', 1.5); }, 1300);
  }
  function judge() {
    if (phase !== 'battle') return;
    const yo = you.state === 'out', co = cpu.state === 'out', yd = you.state === 'down', cd = cpu.state === 'down';
    if ((yo || yd) && (co || cd)) return finish('Draw', '', null);
    if (co) return finish('You win', '', true);
    if (yo) return finish('You lose', '', false);
    if (cd) return finish('You win', '', true);
    if (yd) return finish('You lose', '', false);
    if (battleT > 75) return you.w >= cpu.w ? finish('You win', '', true) : finish('You lose', '', false);
  }

  // -------------------------------------------------- the loop
  function frame() {
    const realDt = Math.min(clock.getDelta(), 0.05), t = performance.now() / 1000;
    updateTime(realDt);
    const dt = realDt * timeScale;
    tGame += dt;
    if (phase === 'pick' && you) {             // held up over the stadium, turning to show itself
      you.m.root.position.set(0, 0.09 + Math.sin(t * 1.4) * 0.002, 0.02);
      // turning slowly on its own axis, face tipped towards the camera wherever it is
      const toCam = tmp.set(camera.position.x, 0, camera.position.z - 0.02).normalize();
      you.m.root.rotation.y = 0; you.m.body.quaternion.setFromAxisAngle(axis.set(toCam.z, 0, -toCam.x), 0.5);
      you.m.solid.visible = true; you.m.ghosts.forEach((g) => (g.visible = false)); you.m.solid.rotation.y = t * 0.5;
      if (you.ln) you.ln.root.visible = false;
    } else if (you) {
      you.m.root.rotation.y = 0;
      for (const P of [you, cpu]) {
        if (!P || P.state !== 'held') continue;
        // held in the launcher, trembling a little as you pull
        const pulling = P === you && launchState?.holding ? gauge(t) : 0;
        P.p.set((Math.random() - 0.5) * 0.0008 * pulling, P.side * 0.082); P.y = surf(0.082).h + 0.05 + pulling * 0.004;
        P.m.body.quaternion.identity(); P.m.solid.visible = true; P.m.ghosts.forEach((g) => (g.visible = false));
      }
      if (phase === 'count' && launchState) {
        const L = launchState;
        // never locked: it locks itself, weakly, in time for the rip
        if (!L.locked && t > tRip - 0.5) { if (!L.holding) { L.holding = true; L.holdT = t - GAUGE_PERIOD * 0.22; } lockPower(); }
        // never ripped: it goes on its own, late and weak
        if (L.locked && !L.ripped && t > tRip + 0.45) { L.ripped = true; launch(you, steady(), L.power, 0.9, 'Miss'); showGrade('Missed the beat', false); hideLaunchUI(); setTimeout(() => slowmo(0.3, 0.7), you.pullDur * 1000 + 30); setShot('launch', 6); }
      }
      if (cpu && cpu.state === 'held' && t >= cpu.cpuAt && phase === 'count') launch(cpu, cpu.cpuAim, cpu.cpuGrade.power, cpu.cpuGrade.rip[2], cpu.cpuGrade.rip[1]);
      if (phase === 'count' && you.state !== 'held' && cpu && cpu.state !== 'held' && you.state === 'spin' && cpu.state !== 'drop' && cpu.state !== 'pull') {
        phase = 'battle'; battleT = 0; meters.classList.add('on'); setShot('battle', 2);
        hint.textContent = '';
      }
      // physics in fixed steps, in game time
      acc += dt;
      while (acc >= STEP) {
        acc -= STEP;
        for (const P of [you, cpu]) if (P) { stepTop(P, STEP); P.hitCool -= STEP; }
        if (you && cpu) collide(you, cpu);
      }
      if (phase === 'battle') { battleT += dt; judge(); }
      for (const P of [you, cpu]) if (P) {
        drawTop(P, dt); drawLauncher(P, t, dt);
        P.whirr?.set(P.state === 'spin' || P.state === 'drop' || P.state === 'pull' ? P.w : 0, P.T.grip / 8 * Math.min(1, P.v.length() * 2), pan(P), 0.55 + 0.45 * timeScale);
      }
      if (you && cpu) sound?.grind(you.contact && you.state === 'spin' && cpu.state === 'spin' ? 0.25 * Math.min(1, (you.w + cpu.w) / W_FULL) : 0);
      if (cpu) {
        meterYou.querySelector('i').style.transform = `scaleX(${Math.max(0, you.state === 'out' ? 0 : you.w / (W_FULL * 1.25))})`;
        meterCpu.querySelector('i').style.transform = `scaleX(${Math.max(0, cpu.state === 'out' ? 0 : cpu.w / (W_FULL * 1.25))})`;
      }
      // after your launch has landed, cut to the battle camera even before the computer's lands
      if (shot === 'launch' && you.state === 'spin' && you.age > 0.35) setShot('battle', 2);
      if (shot === 'follow' && timeScale > 0.9) setShot('battle', 2);
    }
    launchUI(t);
    updateSparks(dt); updateFlashes(realDt);
    direct(dt, realDt);
    composer.render(realDt);
    govern(realDt);
  }

  // -------------------------------------------------- open, close
  async function show() {
    if (open) return;
    open = true;
    if (!renderer) build();
    root.classList.add('on');
    document.body.classList.add('bey-open');      // the room's speaker button stays on top, to unmute from here
    card('', 'Loading…'); topsEl.innerHTML = ''; setActions([{ label: 'Close', run: close }]);
    resize();
    setShot('wide', 1.5);
    renderer.setAnimationLoop(frame);
    clock.getDelta();
    sound = makeSound(audio); sound?.resume();
    if (audio?.ctx) loadClips(audio.ctx);
    if (!ready) ready = load();
    await ready;
    if (!open) return;
    frames = 0; spanT = 0; slowT = 0; governing = true;
    pick();
    if (!seenGuide()) guide();                 // the first time: how to play, before anything else
  }
  function close() {
    if (!open) return;
    open = false; phase = 'idle'; launchState = null; governing = false;
    timers.forEach(clearTimeout); timers.length = 0;
    root.classList.remove('on');
    document.body.classList.remove('bey-open');
    clearTops(); setCall(''); hideLaunchUI(); meters.classList.remove('on');
    sound?.close(); sound = null;
    setTimeout(() => { if (!open) renderer.setAnimationLoop(null); }, 400);
    onClose?.();
  }

  // for tuning: play a whole match instantly, unseen ({ you, cpu: top indices, power, rip })
  function simulate({ you: a = 0, cpu: b = 1, power = 0.8, cpuPower = 0.8, aim = 0, cpuAim = 0.3, rip = 1.12, cpuRip = 1.12, trace = null } = {}) {
    const keep = sound; sound = null; fx.on = false;
    const A = makePlayer(TOPS[a], 1), B = makePlayer(TOPS[b], -1);
    launch(A, aim, power, rip, ''); launch(B, cpuAim, cpuPower, cpuRip, ''); A.whirr = B.whirr = null;
    A.y = B.y = surf(0.082).h + 0.05;
    let t = 0, hits = 0, end = '';
    const wob = [null, null], maxLean = [0, 0];      // when each first leaned past 6 degrees, and its most at full-ish spin
    while (t < 90 && !end) {
      for (const P of [A, B]) { stepTop(P, STEP); P.hitCool -= STEP; }
      [A, B].forEach((P, i) => { if (wob[i] === null && P.state === 'spin' && P.tilt > 0.1 && P.w < BODY.crit * 1.3) wob[i] = t; if (P.w > 250) maxLean[i] = Math.max(maxLean[i], P.tilt); });
      if (trace && Math.round(t / STEP) % 12 === 0) trace.push([+t.toFixed(2), Math.round(A.w), +A.tilt.toFixed(3), +A.lean.toFixed(3), +A.p.length().toFixed(3), +A.ad.length().toFixed(2), A.state]);
      const before = A.w + B.w; collide(A, B); if (A.w + B.w < before - 1) hits++;
      t += STEP;
      const ao = A.state === 'out' || A.state === 'down', bo = B.state === 'out' || B.state === 'down';
      if (ao || bo) end = ao && bo ? 'draw' : ao ? `cpu wins (${A.state})` : `you win (${B.state})`;
    }
    for (const P of [A, B]) { scene.remove(P.m.root); scene.remove(P.trail.mesh); if (P.ln) scene.remove(P.ln.root); }
    sound = keep; fx.on = true;
    const lost = end.startsWith('you') ? 1 : 0;
    return { end: end || 'time', t: +t.toFixed(1), hits, wobble: wob[lost] === null ? null : +(t - wob[lost]).toFixed(2), maxLean: +Math.max(...maxLean).toFixed(3) };
  }
  // for checking from the console: average ms per frame as it stands, each frame waited on (readPixels)
  function bench(n = 30, blur = false, at = 0) {   // blur: as mid-battle, both tops drawn as their smeared copies; at: at this resolution
    const gl = renderer.getContext(), px = new Uint8Array(4);
    const tops = blur ? [you, cpu].filter((P) => P?.m) : [], was = tops.map((P) => P.m.solid.visible);
    for (const P of tops) { P.m.solid.visible = false; P.m.ghosts.forEach((g) => (g.visible = true)); }
    const keep = ratio; if (at) { ratio = at; resize(); }
    const draw = () => { composer.render(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
    for (let i = 0; i < 3; i++) draw();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) draw();
    const ms = +((performance.now() - t0) / n).toFixed(2);
    renderer.info.autoReset = false; renderer.info.reset(); draw(); renderer.info.autoReset = true;
    tops.forEach((P, i) => { P.m.solid.visible = was[i]; P.m.ghosts.forEach((g) => (g.visible = !was[i])); });
    if (at) { ratio = keep; resize(); }
    return { ms, ratio: at || ratio, lite: LITE, phase, calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  }
  return { open: show, close, get isOpen() { return open; }, simulate, bench, TOPS };
}
