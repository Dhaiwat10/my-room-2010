"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { CLIPS, PICTURES, SONGS } from "../../../content";
import { MusicFileIcon } from "../icons";
import { playSound } from "../sounds";
import { MsgBox, type Msg } from "./msgbox";

// Windows Movie Maker 2.1: Movie Tasks on the left, the Collection, the
// preview monitor, and the Storyboard along the bottom. It really plays:
// a title, your clips and photos (fading in from black, photos slowly
// zooming), the chosen effect, and a song underneath.

type Media = { id: string; kind: "video" | "picture" | "audio"; name: string; src: string };

const COLLECTION: Media[] = [
  ...CLIPS.map((c) => ({ id: c.src, kind: "video" as const, name: c.title, src: c.src })),
  ...PICTURES.filter((p) => p.src).map((p) => ({ id: p.src, kind: "picture" as const, name: p.title, src: p.src })),
  ...SONGS.map((s) => ({ id: s.src, kind: "audio" as const, name: `${s.artist} - ${s.title}`, src: s.src })),
];
const byId = new Map(COLLECTION.map((m) => [m.id, m]));

const EFFECTS = {
  None: "none",
  "Sepia Tone": "sepia(1)",
  Grayscale: "grayscale(1)",
  "Film Age, Old": "sepia(0.7) contrast(1.15) brightness(0.95)",
  "Blur": "blur(2px)",
  "Brightness, Increase": "brightness(1.35)",
} as const;
type Effect = keyof typeof EFFECTS;

const TITLE_S = 3;
const PICTURE_S = 4;
const FADE_S = 0.6;

type Segment = { kind: "title" | "video" | "picture"; start: number; dur: number; media?: Media };

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `0:${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

function Thumb({ m }: { m: Media }) {
  if (m.kind === "audio") return <MusicFileIcon size={36} />;
  if (m.kind === "picture")
    // eslint-disable-next-line @next/next/no-img-element -- small local thumbnail
    return <img src={m.src} alt="" draggable={false} />;
  return <video src={`${m.src}#t=1`} muted preload="metadata" />;
}

export function MovieMaker() {
  const [story, setStory] = useState<string[]>([]);
  const [music, setMusic] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [effect, setEffect] = useState<Effect>("None");
  const [pane, setPane] = useState<"tasks" | "title" | "effects">("tasks");
  const [selected, setSelected] = useState<string | null>(null);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [saving, setSaving] = useState<number | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const clock = useRef({ t: 0, last: 0 });

  // Learn each clip's length so the storyboard can be timed.
  useEffect(() => {
    for (const m of COLLECTION) {
      if (m.kind !== "video") continue;
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => setDurations((d) => ({ ...d, [m.id]: v.duration }));
      v.src = m.src;
    }
  }, []);

  const segments: Segment[] = [];
  let at = 0;
  if (title.trim()) {
    segments.push({ kind: "title", start: 0, dur: TITLE_S });
    at = TITLE_S;
  }
  for (const id of story) {
    const media = byId.get(id)!;
    const dur = media.kind === "video" ? (durations[id] ?? 5) : PICTURE_S;
    segments.push({ kind: media.kind === "video" ? "video" : "picture", start: at, dur, media });
    at += dur;
  }
  const total = at;
  const seg = segments.find((s) => t >= s.start && t < s.start + s.dur) ?? null;
  const local = seg ? t - seg.start : 0;

  // The playback clock. Video and music follow it, nudged back if they drift.
  useEffect(() => {
    if (!playing) return;
    clock.current.last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      clock.current.t += (now - clock.current.last) / 1000;
      clock.current.last = now;
      if (clock.current.t >= total) {
        clock.current.t = 0;
        setT(0);
        setPlaying(false);
        return;
      }
      setT(clock.current.t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (seg?.kind !== "video" || !playing) {
      v.pause();
      if (seg?.kind === "video") v.currentTime = local;
      return;
    }
    if (Math.abs(v.currentTime - local) > 0.4) v.currentTime = local;
    if (v.paused) void v.play().catch(() => {});
  }, [seg?.kind, seg?.media?.id, playing, local]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!playing || !music) return a.pause();
    if (Math.abs(a.currentTime - t) > 0.5) a.currentTime = t;
    if (a.paused) void a.play().catch(() => {});
  }, [playing, music, t]);

  const seek = (to: number) => {
    clock.current.t = Math.max(0, Math.min(total, to));
    setT(clock.current.t);
  };
  const stop = () => {
    setPlaying(false);
    seek(0);
  };

  const add = (id: string) => {
    const m = byId.get(id);
    if (!m) return;
    playSound("click");
    if (m.kind === "audio") setMusic(id);
    else setStory((s) => [...s, id]);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    add(e.dataTransfer.getData("text/plain"));
  };

  const finish = () => {
    if (!story.length) {
      setMsg({ title: "Windows Movie Maker", text: "The storyboard is empty. Drag clips and pictures to the storyboard to make a movie.", kind: "warning" });
      return;
    }
    setPlaying(false);
    setSaving(0);
  };
  useEffect(() => {
    if (saving === null || saving >= 100) return;
    const id = setTimeout(() => {
      const next = Math.min(100, saving + 4 + Math.random() * 6);
      if (next >= 100) playSound("ding");
      setSaving(next);
    }, 140);
    return () => clearTimeout(id);
  }, [saving]);

  // Fade in from black at the start of every segment.
  const fade = seg ? Math.min(1, local / FADE_S) : 0;

  return (
    <div className="xp-app wmm">
      <div className="xp-menubar">
        {["File", "Edit", "View", "Tools", "Clip", "Play", "Help"].map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <div className="wmm-top">
        <div className="wmm-tasks">
          {pane === "tasks" ? (
            <>
              <h4>Movie Tasks</h4>
              <section>
                <h5>1. Capture Video</h5>
                <p onClick={() => setMsg({ title: "Video Capture Wizard", text: "No video capture device was detected. Connect your Handycam and try again.", kind: "error" })}>
                  Capture from video device
                </p>
                <p onClick={() => selected && add(selected)}>Add selected item to storyboard</p>
              </section>
              <section>
                <h5>2. Edit Movie</h5>
                <p onClick={() => setPane("effects")}>View video effects</p>
                <p onClick={() => setPane("title")}>Make titles or credits</p>
              </section>
              <section>
                <h5>3. Finish Movie</h5>
                <p onClick={finish}>Save to my computer</p>
                <p onClick={() => setMsg({ title: "Save Movie Wizard", text: "No recordable CD was found in drive F:.", kind: "error" })}>
                  Save to CD
                </p>
              </section>
            </>
          ) : null}
          {pane === "title" ? (
            <div className="wmm-form">
              <h4>Enter text for title</h4>
              <textarea value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="My Movie" />
              <button type="button" onClick={() => setPane("tasks")}>
                Done, add title to movie
              </button>
              <button
                type="button"
                onClick={() => {
                  setTitle("");
                  setPane("tasks");
                }}
              >
                Cancel
              </button>
            </div>
          ) : null}
          {pane === "effects" ? (
            <div className="wmm-form">
              <h4>Video Effects</h4>
              {(Object.keys(EFFECTS) as Effect[]).map((name) => (
                <label key={name}>
                  <input type="radio" name="wmm-effect" checked={effect === name} onChange={() => setEffect(name)} />
                  {name}
                </label>
              ))}
              <button type="button" onClick={() => setPane("tasks")}>
                Done
              </button>
            </div>
          ) : null}
        </div>
        <div className="wmm-collection">
          <div className="wmm-head">Collection: My Videos</div>
          <div className="wmm-items">
            {COLLECTION.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`wmm-item${selected === m.id ? " wmm-item-on" : ""}`}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", m.id)}
                onClick={() => setSelected(m.id)}
                onDoubleClick={() => add(m.id)}
                title="Double-click or drag to the storyboard"
              >
                <span className="wmm-thumb">
                  <Thumb m={m} />
                </span>
                <span className="wmm-name">{m.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="wmm-preview">
          <div className="wmm-screen" style={{ filter: EFFECTS[effect] }}>
            <div className="wmm-layer" style={{ opacity: fade }}>
              {seg?.kind === "title" ? <div className="wmm-title">{title}</div> : null}
              {seg?.kind === "picture" ? (
                // eslint-disable-next-line @next/next/no-img-element -- the photo being shown
                <img src={seg.media!.src} alt="" style={{ transform: `scale(${1 + 0.08 * (local / seg.dur)})` }} />
              ) : null}
              <video ref={videoRef} src={seg?.kind === "video" ? seg.media!.src : undefined} muted={Boolean(music)} playsInline hidden={seg?.kind !== "video"} />
            </div>
            {effect === "Film Age, Old" ? <div className="wmm-grain" /> : null}
            {!seg && !playing ? <span className="wmm-empty">{total ? "" : "Drag clips to the storyboard"}</span> : null}
          </div>
          <input
            type="range"
            className="wmm-seek"
            min={0}
            max={total || 1}
            step={0.05}
            value={t}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Seek"
          />
          <div className="wmm-controls">
            <button type="button" onClick={() => total && setPlaying((p) => !p)} disabled={!total}>
              {playing ? "❚❚" : "►"}
            </button>
            <button type="button" onClick={stop} disabled={!total}>
              ■
            </button>
            <span>
              {fmt(t)} / {fmt(total)}
            </span>
          </div>
        </div>
      </div>
      <div className="wmm-board">
        <div className="wmm-board-head">
          <span>Storyboard</span>
          {story.length ? (
            <button
              type="button"
              onClick={() => {
                stop();
                setStory([]);
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
        <div className="wmm-strip" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          {title.trim() ? (
            <div className="wmm-cell wmm-cell-title">
              <span>{title}</span>
            </div>
          ) : null}
          {story.map((id, i) => {
            const m = byId.get(id)!;
            return (
              <div key={`${id}-${i}`} className="wmm-cell-wrap">
                {i || title.trim() ? <span className="wmm-trans" title="Fade in from black" /> : null}
                <div className={`wmm-cell${seg?.media?.id === id && segments.indexOf(seg) === i + (title.trim() ? 1 : 0) ? " wmm-cell-on" : ""}`}>
                  <Thumb m={m} />
                  <button
                    type="button"
                    aria-label={`Remove ${m.name}`}
                    onClick={() => {
                      stop();
                      setStory((s) => s.filter((_, j) => j !== i));
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
          {!story.length ? <span className="wmm-hint">Drag media to the storyboard to begin making a movie.</span> : null}
        </div>
        <div className="wmm-audio" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          Audio/Music: {music ? byId.get(music)!.name : <i>drag a song here</i>}
          {music ? (
            <button type="button" aria-label="Remove music" onClick={() => setMusic(null)}>
              ×
            </button>
          ) : null}
        </div>
      </div>
      <audio ref={audioRef} src={music ? byId.get(music)!.src : undefined} />
      <div className="status-bar">
        <p className="status-bar-field">{playing ? "Playing" : "Ready"}</p>
        <p className="status-bar-field">Effect: {effect}</p>
      </div>
      {saving !== null ? (
        <div className="xp-msg-backdrop">
          <div className="window wmm-save" role="dialog" aria-label="Save Movie Wizard">
            <div className="title-bar">
              <div className="title-bar-text">Save Movie Wizard</div>
            </div>
            <div className="window-body">
              <p>
                <b>{saving < 100 ? "Saving Movie..." : "Completing the Save Movie Wizard"}</b>
              </p>
              <p>{saving < 100 ? "Dhaiwat's Movie.wmv" : "You have successfully saved your movie to My Videos\\Dhaiwat's Movie.wmv."}</p>
              <progress max={100} value={saving} />
              <p>{saving < 100 ? `${Math.floor(saving)}% complete` : "Play movie when I click Finish"}</p>
              <div className="xp-dialog-buttons">
                <button
                  type="button"
                  disabled={saving < 100}
                  onClick={() => {
                    setSaving(null);
                    seek(0);
                    setPlaying(true);
                  }}
                >
                  Finish
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {msg ? <MsgBox msg={msg} onClose={() => setMsg(null)} /> : null}
    </div>
  );
}
