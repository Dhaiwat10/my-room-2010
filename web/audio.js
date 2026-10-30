// Sound for the room. Everything the PC plays (Winamp, system sounds, videos) arrives here
// as a stereo stream: the left channel comes out of the left speaker and the right out of the
// right, each as a 3D source (HRTF, best on headphones). What makes it feel like it's in a
// room rather than in your head:
//   - each speaker also has its own early reflections, off the wall right behind it and off
//     the desk under it, placed in 3D where those reflections really come from;
//   - a short, soft room tail behind everything;
//   - the speakers sit a little wider than they physically are, for a fuller stereo image.
// The tone is a decent budget 2.0 set from 2010: a bit of port warmth, slightly soft top,
// no deep bass. Nostalgic, not tinny. Plus the PC's fan, humming under the desk.
import * as THREE from 'three';

const WIDEN = 1.6;          // how much further apart the speakers sound than they are

function fanBuffer(ctx) {
  // live-context buffers use the device's sample rate (a ConvolverNode insists on it)
  const SR = ctx.sampleRate;
  const len = SR * 4, b = ctx.createBuffer(1, len, SR), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {                       // brown noise + a faint motor hum
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.2 + 0.02 * Math.sin(2 * Math.PI * 100 * i / SR);
  }
  const f = SR / 10;                                    // crossfade the ends: no click on loop
  for (let i = 0; i < f; i++) { const a = i / f; d[i] = d[i] * a + d[len - f + i] * (1 - a); }
  return b;
}

// a small, furnished bedroom: ~0.45 s tail, darker as it decays, different in each ear
function roomIR(ctx) {
  const SR = ctx.sampleRate, len = Math.floor(SR * 0.6), pre = Math.floor(SR * 0.012);
  const b = ctx.createBuffer(2, len, SR);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / SR;
      const k = 0.35 + 0.6 * Math.min(1, t / 0.4);    // highs die faster than lows
      lp += (1 - k) * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * Math.exp(-t * 6.9 / 0.45);
    }
  }
  return b;
}

function eq(ctx, type, f, q, g) {
  const b = ctx.createBiquadFilter();
  b.type = type; b.frequency.value = f; b.Q.value = q;
  if (g !== undefined) b.gain.value = g;
  return b;
}

// one budget satellite: returns [input, output]
function budgetSpeaker(ctx) {
  const chain = [
    eq(ctx, 'highpass', 70, 0.7),          // small cabinet: the deepest bass just isn't there
    eq(ctx, 'peaking', 115, 0.9, 3),       // the bass port: a warm, slightly boomy bump
    eq(ctx, 'peaking', 750, 1.0, 1.2),     // a touch of plastic-box character
    eq(ctx, 'highshelf', 9000, 0.7, -3),   // no fancy tweeter: soft, never harsh
    eq(ctx, 'lowpass', 15500, 0.7),
  ];
  const out = ctx.createGain(); out.gain.value = 0.9;
  for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
  chain[chain.length - 1].connect(out);
  return [chain[0], out];
}

export class RoomAudio {
  constructor(camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.ctx = this.listener.context;
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = roomIR(this.ctx);
    this.wet = this.ctx.createGain(); this.wet.gain.value = 0.16;
    this.reverb.connect(this.wet); this.wet.connect(this.listener.getInput());
    this.streams = new Set();
  }

  positional(parent, at, volume, ref = 0.5) {
    const a = new THREE.PositionalAudio(this.listener);
    a.panner.panningModel = 'HRTF';
    a.panner.distanceModel = 'inverse';
    a.setRefDistance(ref); a.setRolloffFactor(1.0); a.setVolume(volume);
    a.position.copy(at); parent.add(a);
    return a;
  }

  // a copy of a speaker's sound arriving a moment later from a mirror position
  reflection(scene, from, mirrorAt, delayMs, gain, lowpass) {
    const d = this.ctx.createDelay(0.05); d.delayTime.value = delayMs / 1000;
    const lp = eq(this.ctx, 'lowpass', lowpass, 0.7);
    from.connect(d); d.connect(lp);
    const r = this.positional(scene, mirrorAt, gain);
    r.setNodeSource(lp);
    return r;
  }

  // wallZ / deskY: the back wall and desk top in three.js coordinates
  attach(scene, speakerL, speakerR, tower, { wallZ, deskY }) {
    const mid = speakerL.clone().add(speakerR).multiplyScalar(0.5);
    const spread = (p) => mid.clone().add(p.clone().sub(mid).setY(0).multiplyScalar(WIDEN)).setY(p.y);

    // the PC's stereo output splits into left and right, each through its own speaker
    this.split = this.ctx.createChannelSplitter(2);
    this.speakers = [speakerL, speakerR].map((at, ch) => {
      const [inp, out] = budgetSpeaker(this.ctx);
      this.split.connect(inp, ch);
      const p = spread(at);
      const direct = this.positional(scene, p, 1.0);
      direct.setNodeSource(out);
      // early reflections: off the wall behind (mirror the speaker through the wall) and off
      // the desk below it; the extra path length sets the delay
      const behind = p.clone().setZ(2 * wallZ - p.z);
      const below = p.clone().setY(2 * deskY - p.y);
      const ms = (q) => (q.distanceTo(p) / 343) * 1000 + 0.6;
      this.reflection(scene, out, behind, ms(behind), 0.42, 5000);
      this.reflection(scene, out, below, ms(below), 0.3, 6500);
      out.connect(this.reverb);
      return direct;
    });

    // fan: a barely-there low hum from the tower under the desk, dry
    this.fan = this.positional(scene, tower, 0.045, 0.3);
    this.fan.setRolloffFactor(1.6);
    this.fan.setFilter(eq(this.ctx, 'lowpass', 320, 0.5));
    this.fan.setBuffer(fanBuffer(this.ctx)).setLoop(true);
  }

  // the pedestal fan: a soft whoosh of moving air with a faint motor hum, from where it stands.
  // It's what you'd hear in the room all night, so it starts with the rest of the sound.
  addPedestalFan(scene, at) {
    const ctx = this.ctx, SR = ctx.sampleRate, len = SR * 6;
    const b = ctx.createBuffer(1, len, SR), d = b.getChannelData(0);
    let pink = [0, 0, 0];
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;                   // pinkish noise: air
      pink[0] = 0.997 * pink[0] + 0.03 * w; pink[1] = 0.985 * pink[1] + 0.08 * w; pink[2] = 0.9 * pink[2] + 0.2 * w;
      const air = pink[0] + pink[1] + pink[2] * 0.6;
      const beat = 1 + 0.08 * Math.sin(2 * Math.PI * 7.8 * i / SR);   // blades passing: a slow throb
      d[i] = air * 0.5 * beat + 0.012 * Math.sin(2 * Math.PI * 50 * i / SR);   // 50 Hz mains hum
    }
    const f = SR / 4;                                    // seamless loop
    for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[len - f + i] * (1 - k); }
    const s = this.positional(scene, at, 0.07, 0.6);
    s.setRolloffFactor(1.0);
    const tone = eq(ctx, 'bandpass', 700, 0.45);
    s.setFilter(tone);
    s.setBuffer(b).setLoop(true);
    s.panner.coneInnerAngle = 120; s.panner.coneOuterAngle = 260; s.panner.coneOuterGain = 0.5;
    this.pedestal = s;
    if (ctx.state === 'running') s.play();
  }

  // a MediaStream from the PC page (one per audio graph it creates)
  addStream(stream) {
    if (!this.split || this.streams.has(stream)) return;
    this.streams.add(stream);
    const src = this.ctx.createMediaStreamSource(stream);
    // mono sources (system sounds) still reach both speakers
    const up = this.ctx.createGain();
    up.channelCountMode = 'explicit'; up.channelCount = 2; up.channelInterpretation = 'speakers';
    src.connect(up); up.connect(this.split);
  }

  // browsers only start sound after a click or key press
  async unlock() {
    if (this.ctx.state !== 'running') await this.ctx.resume();
    if (this.fan && !this.fan.isPlaying) this.fan.play();
    if (this.pedestal && !this.pedestal.isPlaying) this.pedestal.play();
  }

  toggleFan() {
    if (!this.fan) return;
    if (this.fan.isPlaying) this.fan.stop(); else this.fan.play();
  }
}
