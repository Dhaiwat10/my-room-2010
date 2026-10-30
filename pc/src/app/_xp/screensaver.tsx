"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useXpSettings, type ScreenSaver as Kind } from "./settings";

// XP's screensavers, drawn over the whole screen until the mouse or a key
// moves. 3D Pipes uses three.js (loaded only when it starts); the others
// are plain canvas.

type Stop = () => void;

function mystify(canvas: HTMLCanvasElement): Stop {
  const ctx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  const shapes = [0, 1].map((k) => ({
    hue: k * 160,
    pts: Array.from({ length: 4 }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6 })),
    trail: [] as { x: number; y: number }[][],
  }));
  let raf = 0;
  const frame = () => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    for (const s of shapes) {
      for (const p of s.pts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
      }
      s.trail.unshift(s.pts.map((p) => ({ x: p.x, y: p.y })));
      s.trail.length = Math.min(s.trail.length, 8);
      s.hue = (s.hue + 0.4) % 360;
      s.trail.forEach((poly, i) => {
        if (i % 2) return;
        ctx.strokeStyle = `hsla(${s.hue}, 100%, 60%, ${1 - i / 9})`;
        ctx.beginPath();
        poly.forEach((p, j) => (j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.stroke();
      });
    }
    raf = requestAnimationFrame(frame);
  };
  frame();
  return () => cancelAnimationFrame(raf);
}

function starfield(canvas: HTMLCanvasElement): Stop {
  const ctx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  const stars = Array.from({ length: 300 }, () => ({ x: (Math.random() - 0.5) * w, y: (Math.random() - 0.5) * h, z: Math.random() * w }));
  let raf = 0;
  const frame = () => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    for (const s of stars) {
      s.z -= 4;
      if (s.z <= 1) {
        s.x = (Math.random() - 0.5) * w;
        s.y = (Math.random() - 0.5) * h;
        s.z = w;
      }
      const k = 128 / s.z;
      const x = s.x * k + w / 2;
      const y = s.y * k + h / 2;
      const r = Math.max(0.4, 2.2 - s.z / (w / 2));
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, 1.4 - s.z / w)})`;
      ctx.fillRect(x, y, r, r);
    }
    raf = requestAnimationFrame(frame);
  };
  frame();
  return () => cancelAnimationFrame(raf);
}

function marquee(canvas: HTMLCanvasElement, text: string): Stop {
  const ctx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  const size = Math.round(h / 8);
  ctx.font = `${size}px "Times New Roman", serif`;
  const tw = ctx.measureText(text).width;
  let x = w;
  let y = h / 2;
  let raf = 0;
  const frame = () => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    ctx.fillText(text, x, y);
    x -= 2;
    if (x < -tw) {
      x = w;
      y = size + Math.random() * (h - size * 2);
    }
    raf = requestAnimationFrame(frame);
  };
  frame();
  return () => cancelAnimationFrame(raf);
}

// 3D Pipes: pipes grow a segment at a time through a lattice, turning at
// random with a ball at each joint, until the screen fills and it starts over.
function pipes(canvas: HTMLCanvasElement): Stop {
  let stop = false;
  let cleanup: Stop = () => {};
  void import("three").then((THREE) => {
    if (stop) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(canvas.width, canvas.height, false);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 1, 200);
    camera.position.set(0, 0, 38);
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-20, 30, 30);
    scene.add(sun);

    const N = 7; // lattice runs -N..N
    const STEP = 2.4;
    const R = 0.42;
    const DIRS = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    const cylinder = new THREE.CylinderGeometry(R, R, STEP, 16);
    const ball = new THREE.SphereGeometry(R * 1.35, 16, 12);
    let used = new Set<string>();
    let group = new THREE.Group();
    scene.add(group);
    type Pipe = { at: number[]; dir: number[]; mat: InstanceType<typeof THREE.MeshPhongMaterial> };
    let live: Pipe[] = [];
    let segments = 0;
    const key = (p: number[]) => p.join(",");
    const inside = (p: number[]) => p.every((v) => Math.abs(v) <= N);

    const spawn = () => {
      for (let tries = 0; tries < 30; tries++) {
        const at = [0, 0, 0].map(() => Math.floor(Math.random() * (2 * N + 1)) - N);
        if (used.has(key(at))) continue;
        used.add(key(at));
        const mat = new THREE.MeshPhongMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.85, 0.5), shininess: 90, specular: 0x888888 });
        const b = new THREE.Mesh(ball, mat);
        b.position.set(at[0] * STEP, at[1] * STEP, at[2] * STEP);
        group.add(b);
        live.push({ at, dir: DIRS[Math.floor(Math.random() * 6)], mat });
        return;
      }
    };
    const reset = () => {
      scene.remove(group);
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) (o.material as InstanceType<typeof THREE.Material>).dispose();
      });
      group = new THREE.Group();
      scene.add(group);
      used = new Set();
      live = [];
      segments = 0;
      for (let i = 0; i < 3; i++) spawn();
    };
    reset();

    const grow = () => {
      for (const p of live) {
        const options = DIRS.filter((d) => {
          const n = p.at.map((v, i) => v + d[i]);
          return inside(n) && !used.has(key(n));
        });
        if (!options.length) continue;
        const keep = options.some((d) => d === p.dir) && Math.random() > 0.25;
        const dir = keep ? p.dir : options[Math.floor(Math.random() * options.length)];
        if (dir !== p.dir) {
          const j = new THREE.Mesh(ball, p.mat);
          j.position.set(p.at[0] * STEP, p.at[1] * STEP, p.at[2] * STEP);
          group.add(j);
        }
        const next = p.at.map((v, i) => v + dir[i]);
        const c = new THREE.Mesh(cylinder, p.mat);
        c.position.set(((p.at[0] + next[0]) / 2) * STEP, ((p.at[1] + next[1]) / 2) * STEP, ((p.at[2] + next[2]) / 2) * STEP);
        if (dir[0]) c.rotation.z = Math.PI / 2;
        if (dir[2]) c.rotation.x = Math.PI / 2;
        group.add(c);
        used.add(key(next));
        p.at = next;
        p.dir = dir;
        segments++;
      }
      live = live.filter((p) => DIRS.some((d) => {
        const n = p.at.map((v, i) => v + d[i]);
        return inside(n) && !used.has(key(n));
      }));
      if (live.length < 3) spawn();
      if (segments > 420) reset();
    };

    let raf = 0;
    let last = 0;
    const frame = (t: number) => {
      if (t - last > 45) {
        grow();
        last = t;
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    cleanup = () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
    };
  });
  return () => {
    stop = true;
    cleanup();
  };
}

function start(kind: Kind, canvas: HTMLCanvasElement, text: string): Stop {
  if (kind === "pipes") return pipes(canvas);
  if (kind === "mystify") return mystify(canvas);
  if (kind === "starfield") return starfield(canvas);
  if (kind === "marquee") return marquee(canvas, text);
  return () => {};
}

export function ScreenSaver() {
  const { saver, hideSaver, settings } = useXpSettings();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!saver || !canvas) return;
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    const stop = start(saver, canvas, settings.marquee || " ");
    // Any key or click ends it; the mouse has to actually move, not twitch.
    let origin: { x: number; y: number } | null = null;
    const end = () => hideSaver();
    const move = (e: PointerEvent) => {
      origin ??= { x: e.clientX, y: e.clientY };
      if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 12) end();
    };
    // Give the click that started a preview a moment to land.
    const t = setTimeout(() => {
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerdown", end);
      window.addEventListener("keydown", end);
      window.addEventListener("wheel", end);
    }, 400);
    return () => {
      clearTimeout(t);
      stop();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", end);
      window.removeEventListener("keydown", end);
      window.removeEventListener("wheel", end);
    };
  }, [saver, hideSaver, settings.marquee]);

  if (!saver) return null;
  return <canvas ref={canvasRef} className="xp-saver" aria-hidden="true" />;
}

// Starts the chosen screensaver after the configured idle time, unless
// something is playing or the visitor is inside a game frame.
export function useIdleScreensaver(rootRef: RefObject<HTMLElement | null>, enabled: boolean) {
  const { settings, saver, showSaver } = useXpSettings();
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled || settings.screensaver === "none") return;
    let last = Date.now();
    const poke = () => (last = Date.now());
    const events = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, poke, { passive: true }));
    const id = setInterval(() => {
      if (saver || document.hidden) return poke();
      // A game or video keeps the screen awake, as on XP.
      const busy =
        document.activeElement?.tagName === "IFRAME" ||
        [...root.querySelectorAll("video")].some((v) => !v.paused);
      if (busy) return poke();
      if (Date.now() - last > settings.wait * 60_000) showSaver();
    }, 1000);
    return () => {
      clearInterval(id);
      events.forEach((e) => window.removeEventListener(e, poke));
    };
  }, [rootRef, enabled, settings.screensaver, settings.wait, saver, showSaver]);
}
