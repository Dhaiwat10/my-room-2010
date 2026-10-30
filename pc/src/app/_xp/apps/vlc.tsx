"use client";

import { useEffect, useRef, useState } from "react";
import { CLIPS } from "../../../content";

// VLC media player as it looked on XP around 2.0: native menu bar, black
// video area, a seek bar with times either side, flat toolbar icons with the
// bigger round Play, and the wedge-shaped volume slider.

function fmt(s: number) {
  if (!Number.isFinite(s)) return "--:--";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

// VLC 2.0's own toolbar art (GPL, modules/gui/qt4/pixmaps at the 2.0 release).
const ICONS = {
  play: "play.png",
  pause: "pause.png",
  stop: "stop.png",
  prev: "previous.png",
  next: "next.png",
  fullscreen: "fullscreen.png",
  extended: "extended_16px.png",
  playlist: "playlist.png",
  loop: "repeat_off.png",
  loopOn: "repeat_all.png",
  random: "shuffle_off.png",
  speaker: "volume-high.png",
  muted: "volume-muted.png",
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  // eslint-disable-next-line @next/next/no-img-element -- tiny toolbar bitmap
  return <img src={`/pc/xp/vlc/${ICONS[name]}`} alt="" aria-hidden="true" draggable={false} />;
}

const MENUS = ["Media", "Playback", "Audio", "Video", "Subtitle", "Tools", "View", "Help"];

export function Vlc() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const clip = CLIPS[index];

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
    v.loop = loop;
  }, [volume, muted, loop, index]);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  };
  const stop = () => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
  };
  const select = (i: number) => {
    setIndex(i);
    setTime(0);
    setShowPlaylist(false);
    requestAnimationFrame(() => void videoRef.current?.play().catch(() => {}));
  };
  const setVolumeFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setVolume(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
    setMuted(false);
  };
  const shown = muted ? 0 : volume;

  return (
    <div className="xp-app vlc">
      <div className="xp-menubar">
        {MENUS.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <div className="vlc-stage">
        <video
          ref={videoRef}
          src={clip.src}
          playsInline
          hidden={showPlaylist}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
          onEnded={() => !loop && CLIPS.length > 1 && select((index + 1) % CLIPS.length)}
          onClick={toggle}
          onDoubleClick={() => void videoRef.current?.requestFullscreen?.().catch(() => {})}
        />
        {showPlaylist ? (
          <div className="vlc-playlist">
            <div className="vlc-playlist-head">
              <span>Title</span>
              <span>Duration</span>
            </div>
            {CLIPS.map((c, i) => (
              <button
                key={c.src}
                type="button"
                className={`vlc-playlist-row${i === index ? " vlc-playlist-row-current" : ""}`}
                onDoubleClick={() => select(i)}
              >
                <span>{c.title}</span>
                <span>{i === index ? fmt(duration) : "--:--"}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="vlc-seekrow">
        <span className="vlc-time">{fmt(time)}</span>
        <input
          type="range"
          className="vlc-seek"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(time, duration || 0)}
          style={{ ["--fill" as string]: `${duration ? (time / duration) * 100 : 0}%` }}
          onChange={(e) => {
            const v = videoRef.current;
            if (v) v.currentTime = Number(e.target.value);
          }}
          aria-label="Seek"
        />
        <span className="vlc-time">{fmt(duration)}</span>
      </div>
      <div className="vlc-controls">
        <button type="button" className="vlc-btn vlc-play" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
          <Icon name={playing ? "pause" : "play"} />
        </button>
        <span className="vlc-sep" />
        <button type="button" className="vlc-btn" onClick={() => select((index - 1 + CLIPS.length) % CLIPS.length)} aria-label="Previous">
          <Icon name="prev" />
        </button>
        <button type="button" className="vlc-btn" onClick={stop} aria-label="Stop">
          <Icon name="stop" />
        </button>
        <button type="button" className="vlc-btn" onClick={() => select((index + 1) % CLIPS.length)} aria-label="Next">
          <Icon name="next" />
        </button>
        <span className="vlc-sep" />
        <button
          type="button"
          className="vlc-btn"
          onClick={() => void videoRef.current?.requestFullscreen?.().catch(() => {})}
          aria-label="Fullscreen"
        >
          <Icon name="fullscreen" />
        </button>
        <button type="button" className="vlc-btn" aria-label="Extended settings">
          <Icon name="extended" />
        </button>
        <button
          type="button"
          className={`vlc-btn${showPlaylist ? " vlc-btn-on" : ""}`}
          onClick={() => setShowPlaylist((v) => !v)}
          aria-label="Playlist"
        >
          <Icon name="playlist" />
        </button>
        <span className="vlc-sep" />
        <button type="button" className={`vlc-btn${loop ? " vlc-btn-on" : ""}`} onClick={() => setLoop((v) => !v)} aria-label="Loop">
          <Icon name={loop ? "loopOn" : "loop"} />
        </button>
        <button type="button" className="vlc-btn" aria-label="Random">
          <Icon name="random" />
        </button>
        <span className="vlc-spacer" />
        <button type="button" className="vlc-btn" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute" : "Mute"}>
          <Icon name={muted ? "muted" : "speaker"} />
        </button>
        <div
          className="vlc-volume"
          role="slider"
          aria-label="Volume"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(shown * 100)}
          tabIndex={0}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setVolumeFromPointer(e);
          }}
          onPointerMove={(e) => e.buttons & 1 && setVolumeFromPointer(e)}
          style={{ ["--vol" as string]: `${shown * 100}%` }}
        >
          <span className="vlc-volume-label">{Math.round(shown * 100)}%</span>
        </div>
      </div>
      <div className="status-bar">
        <p className="status-bar-field">{playing ? "Playing" : time > 0 ? "Paused" : "Stopped"}</p>
        <p className="status-bar-field">{clip.caption}</p>
      </div>
    </div>
  );
}
