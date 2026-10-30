"use client";

import { useEffect, useRef, useState } from "react";
import { SONGS } from "../../../content";
import { NeroIcon } from "../icons";
import { playSound } from "../sounds";

// Nero Burning ROM 6, mid-way through an MP3 CD for the car: the songs in
// the compilation, the capacity bar, and a burn that runs at 48x and ends
// with the "Burn process completed successfully" box.

// Made-up but plausible MP3 sizes.
const TRACKS = SONGS.map((s, i) => ({ ...s, mb: [4.8, 3.9, 4.4, 5.1, 4.6, 3.7][i % 6] }));
const TOTAL_MB = TRACKS.reduce((n, t) => n + t.mb, 0);
const CD_MB = 700;

const MENUS = ["File", "Edit", "View", "Recorder", "Extras", "Window", "Help"];

type Burn = { stage: "writing" | "done"; pct: number; track: number; log: string[] };

export function Nero() {
  const [burn, setBurn] = useState<Burn | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (burn?.stage !== "writing") return;
    const id = setInterval(() => {
      setBurn((b) => {
        if (!b || b.stage !== "writing") return b;
        const pct = Math.min(100, b.pct + 1.6 + Math.random() * 1.4);
        const track = Math.min(TRACKS.length - 1, Math.floor((pct / 100) * TRACKS.length));
        const log = track !== b.track ? [...b.log, `Writing file ${TRACKS[track].artist} - ${TRACKS[track].title}.mp3`] : b.log;
        if (pct >= 100) {
          playSound("ding");
          return { ...b, pct, track, stage: "done", log: [...log, "Burn process completed successfully at 48x (7,200 KB/s)"] };
        }
        return { ...b, pct, track, log };
      });
    }, 120);
    return () => clearInterval(id);
  }, [burn?.stage]);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [burn?.log.length]);

  const start = () =>
    setBurn({
      stage: "writing",
      pct: 0,
      track: 0,
      log: [
        "Burn process started at 48x (7,200 KB/s)",
        "Caching of files started",
        "Caching of files completed",
        `Writing file ${TRACKS[0].artist} - ${TRACKS[0].title}.mp3`,
      ],
    });

  return (
    <div className="xp-app nero">
      <div className="xp-menubar">
        {MENUS.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <div className="nero-toolbar">
        <span className="nero-new">New</span>
        <span className="nero-sep" />
        <span className="nero-drive">_NEC DVD_RW ND-3550A</span>
        <button type="button" className="nero-burn-btn" onClick={start} disabled={burn?.stage === "writing"}>
          <NeroIcon size={16} /> Burn
        </button>
      </div>
      <div className="nero-split">
        <div className="nero-pane">
          <div className="nero-pane-head">ISO1 — MP3 CD for the car</div>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Size</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {TRACKS.map((t, i) => (
                <tr key={t.src} className={burn && burn.stage === "writing" && burn.track === i ? "nero-row-on" : undefined}>
                  <td>
                    {t.artist} - {t.title}.mp3
                  </td>
                  <td>{(t.mb * 1024).toLocaleString("en-US", { maximumFractionDigits: 0 })} KB</td>
                  <td>MP3 Format Sound</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="nero-pane nero-browser">
          <div className="nero-pane-head">File Browser</div>
          <ul>
            <li>Desktop</li>
            <li>My Documents</li>
            <li>My Computer</li>
            <li className="nero-indent">Local Disk (C:)</li>
            <li className="nero-indent">Local Disk (D:)</li>
            <li className="nero-indent2">songs</li>
            <li className="nero-indent">CD Drive (F:)</li>
          </ul>
        </div>
      </div>
      {/* Nero's capacity bar: the ruler, then green filling toward the 700MB mark. */}
      <div className="nero-capacity">
        <div className="nero-ruler">
          {[0, 100, 200, 300, 400, 500, 600, 700, 800].map((m) => (
            <span key={m} style={{ left: `${(m / 800) * 100}%` }}>
              {m}MB
            </span>
          ))}
        </div>
        <div className="nero-bar">
          <i style={{ width: `${(TOTAL_MB / 800) * 100}%` }} />
          <b style={{ left: `${(CD_MB / 800) * 100}%` }} />
        </div>
      </div>
      <div className="status-bar">
        <p className="status-bar-field">Total size on disc: {TOTAL_MB.toFixed(1)} MB</p>
        <p className="status-bar-field">_NEC DVD_RW ND-3550A</p>
      </div>
      {burn ? (
        <div className="xp-msg-backdrop">
          <div className="window nero-dialog" role="dialog" aria-label="Burn Compilation">
            <div className="title-bar">
              <div className="title-bar-text">Writing Process - _NEC DVD_RW ND-3550A</div>
            </div>
            <div className="window-body">
              <div className="nero-log" ref={logRef}>
                {burn.log.map((l, i) => (
                  <div key={i}>
                    <span className="nero-time">{`20:${String(14 + Math.floor(i / 2)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`}</span>
                    {l}
                  </div>
                ))}
              </div>
              <div className="nero-progress-row">
                <span>Written:</span>
                <progress max={100} value={burn.pct} />
                <span>{Math.floor(burn.pct)}%</span>
              </div>
              <div className="nero-progress-row">
                <span>Buffer level:</span>
                <progress max={100} value={burn.stage === "done" ? 0 : 97} />
                <span>{burn.stage === "done" ? "0%" : "97%"}</span>
              </div>
              <p className="nero-status">
                {burn.stage === "done"
                  ? "Burn process completed successfully at 48x (7,200 KB/s)"
                  : `Writing track ${burn.track + 1} of ${TRACKS.length} at 48x (7,200 KB/s)`}
              </p>
              <div className="xp-dialog-buttons">
                <button type="button" disabled={burn.stage !== "done"} onClick={() => setBurn(null)}>
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
