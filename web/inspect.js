// Picking something up for a close look: a disc, or a game's box, centred over the blurred room,
// that you can turn over with a finger or the mouse, with a button or two for what to do with it.
// It can also lay out a whole collection (the games on the desk) to flick through. It has its own
// little renderer and studio light: the room's baked look is made for the room, not for a shiny
// thing held up in front of your face.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const R = 0.06, HOLE = 0.0075, T = 0.0012;      // a CD: 120 mm across, 15 mm hole, 1.2 mm thick
// a game box, and how its print is laid out: [spine | front | spine | back] across, the top and
// bottom flaps above and below the front (tools: art/boxes, made at 76 px per cm)
const BOX = { w: 0.135, h: 0.19, d: 0.036 }, PX = { w: 1026, h: 1444, d: 274 };
const PRINT = { w: 2 * PX.d + 2 * PX.w, h: PX.h + 2 * PX.d };
const BOX_SCALE = 0.112 / BOX.h;                 // held up, a box looks about as big as a disc
const FILL = 0.56, FILL_TALL = 0.72;             // how much of the shorter side the disc takes up
const KEY = new THREE.Vector3(-0.4, 0.6, 0.8).normalize(), RIM = new THREE.Vector3(0.7, 0.3, 0.5).normalize();

// The data side's rainbow is diffraction: its tracks, 1.6 microns apart, split light that hits
// them into spectra along the radius, where the light, the eye and the tracks line up. Added to
// the silver as light of its own, from the same two lamps as the studio light.
const GRATING = `
uniform vec3 discCentre, lightA, lightB;
vec3 spectrum(float nm) {
  float x = (nm - 400.0) / 300.0;
  vec3 hue = clamp(abs(fract((1.0 - x) * 0.78 + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  return hue * smoothstep(0.0, 0.12, x) * smoothstep(1.0, 0.85, x);
}
vec3 grating(vec3 L, vec3 V, vec3 n, vec3 r) {
  vec3 t = normalize(cross(n, r)), lv = L + V;
  float along = abs(dot(lv, r)), across = dot(lv, t);
  vec3 c = vec3(0.0);
  for (int m = 1; m <= 3; m++) c += spectrum(1600.0 * along / float(m)) / float(m);
  return c * exp(-across * across * 60.0);
}
`;

export function createInspector() {
  const root = document.createElement('div');
  root.id = 'inspect';
  root.setAttribute('role', 'dialog');
  root.innerHTML = `<canvas aria-hidden="true"></canvas>
    <button class="inspect-nav prev" aria-label="Previous game">‹</button>
    <button class="inspect-nav next" aria-label="Next game">›</button>
    <div class="inspect-card">
      <div class="inspect-title"></div>
      <div class="inspect-badge"></div>
      <div class="inspect-hint"></div>
      <div class="inspect-shelf"></div>
      <div class="inspect-actions"></div>
    </div>`;
  document.body.appendChild(root);
  const canvas = root.querySelector('canvas');
  const title = root.querySelector('.inspect-title'), hint = root.querySelector('.inspect-hint');
  const actionsEl = root.querySelector('.inspect-actions'), shelfEl = root.querySelector('.inspect-shelf');
  const badgeEl = root.querySelector('.inspect-badge');
  const [prevEl, nextEl] = root.querySelectorAll('.inspect-nav');
  const coarse = matchMedia('(pointer: coarse)').matches;

  let renderer = null, scene, camera, disc, label, box, boxPrint, model;
  const discCentre = { value: new THREE.Vector3() };   // in view space, for the rainbow
  function build() {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    scene = new THREE.Scene();
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    const key = new THREE.DirectionalLight(0xfff1dc, 1.6);   // a warm lamp up and to the left, for a glint
    key.position.copy(KEY);
    const fill = new THREE.DirectionalLight(0xdce8ff, 0.6);  // and a cooler one low on the right
    fill.position.copy(RIM);
    scene.add(key, fill);
    camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10);

    // printed side: the label photo, under a thin lacquer
    label = new THREE.MeshPhysicalMaterial({ roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.3 });
    const ring = (inner, outer, z, back) => {
      const g = new THREE.RingGeometry(inner, outer, 160, 1);   // its uv spans the full disc
      if (back) g.rotateY(Math.PI);
      g.translate(0, 0, z);
      return g;
    };
    // the data side: a silver mirror that splits the light into rainbows, round a clear hub
    const data = new THREE.MeshPhysicalMaterial({ color: 0xeeeef2, metalness: 1, roughness: 0.08,
      iridescence: 0.35, iridescenceIOR: 1.6, iridescenceThicknessRange: [300, 700] });
    data.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { discCentre, lightA: { value: KEY }, lightB: { value: RIM } });
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>' + GRATING)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          vec3 gp = -vViewPosition - discCentre, gr = normalize(gp - dot(gp, normal) * normal), gv = normalize(vViewPosition);
          totalEmissiveRadiance += grating(lightA, gv, normal, gr) * 1.1 + grating(lightB, gv, normal, gr) * 0.6;`);
    };
    const hub = new THREE.MeshPhysicalMaterial({ color: 0xd8dce0, metalness: 0, roughness: 0.15,
      transmission: 0.6, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    const band = new THREE.MeshPhysicalMaterial({ color: 0x9a9da2, metalness: 0.6, roughness: 0.35 });
    const edge = new THREE.MeshPhysicalMaterial({ color: 0xc9ccd0, metalness: 0.3, roughness: 0.3 });
    disc = new THREE.Group();
    disc.add(new THREE.Mesh(ring(HOLE, R, T / 2, false), label));
    disc.add(new THREE.Mesh(ring(HOLE, 0.0165, -T / 2, true), hub));
    disc.add(new THREE.Mesh(ring(0.0165, 0.0225, -T / 2, true), band));
    disc.add(new THREE.Mesh(ring(0.0225, R - 0.0006, -T / 2, true), data));
    disc.add(new THREE.Mesh(ring(R - 0.0006, R, -T / 2, true), hub));
    const rim = new THREE.CylinderGeometry(R, R, T, 160, 1, true).rotateX(Math.PI / 2);
    disc.add(new THREE.Mesh(rim, edge));
    const hole = new THREE.CylinderGeometry(HOLE, HOLE, T, 64, 1, true).rotateX(Math.PI / 2);
    disc.add(new THREE.Mesh(hole, new THREE.MeshPhysicalMaterial({ color: 0xc9ccd0, roughness: 0.3, side: THREE.BackSide })));
    scene.add(disc);

    // the box: six faces, each mapped onto its part of the print
    const x = BOX.w / 2, y = BOX.h / 2, z = BOX.d / 2, { w, h, d } = PX;
    const faces = [   // corners (outward, anticlockwise) and where they sit on the print, in px
      [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]], [[d, d + h], [d + w, d + h], [d + w, d], [d, d]],
      [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]], [[2 * d + w, d + h], [2 * d + 2 * w, d + h], [2 * d + 2 * w, d], [2 * d + w, d]],
      [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]], [[0, d + h], [d, d + h], [d, d], [0, d]],
      [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]], [[d + w, d + h], [2 * d + w, d + h], [2 * d + w, d], [d + w, d]],
      [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]], [[d, d], [d + w, d], [d + w, 0], [d, 0]],
      [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]], [[d, 2 * d + h], [d + w, 2 * d + h], [d + w, d + h], [d, d + h]],
    ];
    const pos = [], uvs = [], idx = [];
    for (let f = 0; f < faces.length; f += 2) {
      const n = pos.length / 3;
      faces[f].forEach((c, i) => { pos.push(...c); uvs.push(faces[f + 1][i][0] / PRINT.w, 1 - faces[f + 1][i][1] / PRINT.h); });
      idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    bg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    bg.setIndex(idx); bg.computeVertexNormals();
    boxPrint = new THREE.MeshPhysicalMaterial({ roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35 });
    box = new THREE.Group();
    box.add(new THREE.Mesh(bg, boxPrint));
    box.visible = false;
    scene.add(box);
    model = disc;
    addEventListener('resize', resize);
  }
  let lift = 0;                                    // how far up the disc sits, out of the card's way
  function resize() {
    if (!renderer) return;
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.set(0, 0, (2 * R) / ((camera.aspect < 1 ? FILL_TALL : FILL) * 2 * tan * Math.min(1, camera.aspect)));
    lift = camera.position.z * tan * 0.12;
    camera.updateProjectionMatrix();
  }

  // turning it: drag to spin it about the screen's axes, and it carries on a little when let go
  const turn = new THREE.Quaternion(), spin = new THREE.Vector2(), axis = new THREE.Vector3();
  const tmp = new THREE.Quaternion();
  let drag = null, lastTouch = 0, zoom = 1, zoomTo = 1;
  // until you touch it, it floats at an angle, turning a little each way, so it reads as a thing
  // you can turn over rather than a picture of one
  let touched = false;
  const showcase = (q, s) => q.setFromEuler(new THREE.Euler(-0.32 + Math.sin(s * 0.37) * 0.07, 0.55 + Math.sin(s * 0.5) * 0.3, 0.06, 'YXZ'));
  function rotateBy(dx, dy) {
    tmp.setFromAxisAngle(axis.set(0, 1, 0), dx); turn.premultiply(tmp);
    tmp.setFromAxisAngle(axis.set(1, 0, 0), dy); turn.premultiply(tmp);
  }
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, t: performance.now() };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('held');
    touched = true;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const k = 5 / Math.min(innerWidth, innerHeight), now = performance.now();
    const dx = (e.clientX - drag.x) * k, dy = (e.clientY - drag.y) * k, dt = Math.max(now - drag.t, 1) / 1000;
    rotateBy(dx, dy);
    spin.set(dx / dt, dy / dt).clampLength(0, 12);
    drag = { x: e.clientX, y: e.clientY, t: now };
    lastTouch = now;
  });
  const release = () => { drag = null; canvas.classList.remove('held'); };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomTo = THREE.MathUtils.clamp(zoomTo * Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0015)), 0.7, 1.45);
  }, { passive: false });

  let open = false, t0 = 0, buttons = [];
  const from = new THREE.Quaternion(), clock = new THREE.Clock();
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05), now = performance.now();
    zoom += (zoomTo - zoom) * (1 - Math.exp(-dt * 9));   // eases in, like the room's zoom
    if (!touched) showcase(tmp, clock.elapsedTime), turn.slerp(tmp, 1 - Math.exp(-dt * 3));
    else if (!drag) {
      if (spin.lengthSq() > 1e-4) {
        rotateBy(spin.x * dt, spin.y * dt);
        spin.multiplyScalar(Math.exp(-dt * 3));
      } else if (now - lastTouch > 1500) {
        // left alone, it settles back face-on, so the label is there to read
        turn.slerp(tmp.identity(), 1 - Math.exp(-dt * 1.2));
      }
    }
    // it comes up out of the tray: lying flat, then turning to face you as it rises
    const k = Math.min((now - t0) / 650, 1), e = 1 - Math.pow(1 - k, 3);
    const s = clock.elapsedTime;
    model.quaternion.slerpQuaternions(from, turn, e);
    model.rotateY(Math.sin(s * 0.7) * 0.06 * e);  // held in a hand: never quite still
    model.rotateX(Math.sin(s * 0.9 + 1) * 0.04 * e);
    model.position.set(0, lift + (1 - e) * -0.03 + Math.sin(s * 1.1) * 0.0015, 0);
    model.scale.setScalar((0.75 + 0.25 * e) * zoom * (model === box ? BOX_SCALE : 1));
    disc.updateMatrixWorld();
    discCentre.value.setFromMatrixPosition(disc.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
    renderer.render(scene, camera);
  }

  function onKey(e) {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (items && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); step(e.key === 'ArrowLeft' ? -1 : 1); return; }
    const a = 0.35;
    const keys = { ArrowLeft: [-a, 0], ArrowRight: [a, 0], ArrowUp: [0, -a], ArrowDown: [0, a] };
    if (keys[e.key]) { e.preventDefault(); touched = true; spin.set(keys[e.key][0] * 6, keys[e.key][1] * 6); lastTouch = performance.now(); }
  }
  addEventListener('keydown', onKey, true);

  const prints = {};
  const printFor = (url) => {
    if (!prints[url]) {
      const t = prints[url] = new THREE.TextureLoader().load(url);
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    }
    return prints[url];
  };
  // a fresh look: it comes up from lying flat (out of the tray, off the desk), or, flicking
  // through a collection, turns in from the side it came from
  function pickUp(dir = 0) {
    touched = false; spin.set(0, 0); zoom = zoomTo = 1;
    showcase(turn, clock.elapsedTime);
    if (dir) from.setFromAxisAngle(axis.set(0, 1, 0), dir * 1.1);
    else from.setFromAxisAngle(axis.set(1, 0, 0), -1.3);
    t0 = performance.now(); lastTouch = t0;
  }
  function setModel(kind, item) {
    model = kind === 'box' ? box : disc;
    box.visible = kind === 'box'; disc.visible = kind !== 'box';
    if (kind === 'box') { boxPrint.map = printFor(item.box); boxPrint.needsUpdate = true; }
    else { label.map = item.disc; label.needsUpdate = true; }
  }
  // the buttons: { label, primary, disabled, keep, run }; all but `keep` ones close the view
  function setActions(actions) {
    actionsEl.innerHTML = '';
    buttons = actions.map((a) => {
      const b = document.createElement('button');
      b.textContent = a.label;
      if (a.primary) b.className = 'primary';
      b.disabled = !!a.disabled;
      b.addEventListener('click', () => { if (!a.keep) close(); a.run?.(); });
      actionsEl.appendChild(b);
      return b;
    });
  }
  function begin() {
    if (!renderer) build();
    resize();
    clock.getDelta();
    open = true;
    root.classList.add('on');
    renderer.setAnimationLoop(frame);
  }
  const focusMain = () => (buttons.find((b) => b.className === 'primary' && !b.disabled) || buttons.at(-1))?.focus({ preventScroll: true });
  const turnHint = () => (coarse ? 'Drag to turn it over' : 'Drag to turn it over · scroll to look closer');

  // one disc: what you can do with it, plus a button that just puts it down again
  let items = null;
  function show(texture, name, actions, putDown = 'Back') {
    items = null; root.classList.remove('browse');
    begin();
    setModel('disc', { disc: texture });
    title.textContent = name; badgeEl.textContent = '';
    hint.textContent = turnHint();
    shelfEl.innerHTML = '';
    setActions([...actions, { label: putDown }]);
    pickUp();
    focusMain();
  }

  // a collection to flick through: items [{ id, name, box, disc, badge }], starting at `start`,
  // as boxes or discs; `actions(item)` gives each one's buttons
  let index = 0, view = 'box', actionsFor = null, putDownLabel = 'Close';
  function render(dir) {
    const it = items[index];
    setModel(view, it);
    title.textContent = it.name;
    badgeEl.textContent = it.badge?.() || '';
    shelfEl.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === index));
    const other = view === 'box' ? 'See the disc' : 'See the box';
    setActions([...actionsFor(it), { label: other, keep: true, run: () => { view = view === 'box' ? 'disc' : 'box'; render(0); } }, { label: putDownLabel }]);
    pickUp(dir);
  }
  function step(dir) {
    index = (index + dir + items.length) % items.length;
    render(-dir);
  }
  function browse(list, start, { actions, as = 'box', putDown = 'Close' }) {
    items = list; actionsFor = actions; putDownLabel = putDown; view = as;
    index = Math.max(0, list.findIndex((it) => it.id === start));
    root.classList.add('browse');
    begin();
    hint.textContent = turnHint() + (coarse ? '' : ' · ← → for the next game');
    shelfEl.innerHTML = list.map((it) => `<button aria-label="${it.name}" style="background-image:url('${it.box}')"></button>`).join('');
    shelfEl.querySelectorAll('button').forEach((b, i) => b.addEventListener('click', () => { if (i !== index) { const dir = i > index ? 1 : -1; index = i; render(-dir); } }));
    render(0);
    pickUp();
    focusMain();
  }
  prevEl.addEventListener('click', () => step(-1));
  nextEl.addEventListener('click', () => step(1));

  function close() {
    if (!open) return;
    open = false;
    root.classList.remove('on');
    release();
    setTimeout(() => { if (!open) renderer.setAnimationLoop(null); }, 400);   // after the fade
  }
  return { show, browse, close, get open() { return open; } };
}
