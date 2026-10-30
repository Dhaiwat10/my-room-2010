"use client";

import { useEffect, useState } from "react";

// µTorrent 2.0, 2010: toolbar, the category tree, the torrent list with its
// green bars, detail tabs, and the DHT/transfer status bar. The downloads
// creep along while the window is open.

type Torrent = {
  name: string;
  size: number; // MB
  done: number; // 0..1
  seeds: string;
  peers: string;
  down: number; // kB/s while downloading
};

const START: Torrent[] = [
  { name: "ubuntu-10.04-desktop-i386.iso", size: 699, done: 1, seeds: "0 (1840)", peers: "3 (212)", down: 0 },
  { name: "vroom.mp4", size: 4.1, done: 1, seeds: "0 (2)", peers: "1 (1)", down: 0 },
  { name: "Counter-Strike 1.6 Maps Pack (dust2, aztec, inferno, nuke)", size: 86.4, done: 1, seeds: "0 (96)", peers: "0 (14)", down: 0 },
  { name: "Bollywood Hits 2009 [128kbps]", size: 412, done: 0.634, seeds: "7 (54)", peers: "2 (31)", down: 38.2 },
  { name: "Formula 1 2010 - Round 01 - Bahrain GP - Full Race", size: 1433.6, done: 0.121, seeds: "4 (22)", peers: "1 (40)", down: 21.7 },
];

const MENUS = ["File", "Options", "Help"];

// Add, add from URL, create, | remove, | start, pause, stop, | queue up, down.
const TOOLBAR: ({ d: string; fill: string } | null)[] = [
  { d: "M3 1h7l3 3v11H3zM7 6h2v2h2v2H9v2H7v-2H5V8h2z", fill: "#3a8a2a" },
  { d: "M2 9l4-4h3L5 9h3l-2 2H2zM14 7l-4 4H7l4-4H8l2-2h4z", fill: "#2f6fcf" },
  { d: "M3 1h7l3 3v11H3zM8 5l1 2.2 2.4.3-1.8 1.6.5 2.4L8 10.3 5.9 11.5l.5-2.4L4.6 7.5 7 7.2z", fill: "#d99a1e" },
  null,
  { d: "M3.5 2L8 6.5 12.5 2 14 3.5 9.5 8l4.5 4.5-1.5 1.5L8 9.5 3.5 14 2 12.5 6.5 8 2 3.5z", fill: "#c8322a" },
  null,
  { d: "M4 2l10 6-10 6z", fill: "#3a9a2a" },
  { d: "M3 2h4v12H3zM9 2h4v12H9z", fill: "#3b6ec2" },
  { d: "M3 3h10v10H3z", fill: "#555" },
  null,
  { d: "M8 2l6 7h-4v5H6V9H2z", fill: "#3b6ec2" },
  { d: "M8 14L2 7h4V2h4v5h4z", fill: "#3b6ec2" },
];
const CATEGORIES = ["Torrents", "Downloading", "Seeding", "Completed", "Active", "Inactive"];
const TABS = ["General", "Trackers", "Peers", "Pieces", "Files", "Speed", "Logger"];

function size(mb: number) {
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

function eta(t: Torrent) {
  if (t.done >= 1 || !t.down) return "∞";
  const s = ((1 - t.done) * t.size * 1024) / t.down;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${Math.floor(s % 60)}s`;
}

export function UTorrent() {
  const [torrents, setTorrents] = useState(START);
  const [selected, setSelected] = useState(3);

  useEffect(() => {
    const id = setInterval(() => {
      setTorrents((list) =>
        list.map((t) => {
          if (t.done >= 1) return t;
          // Speeds wander like a real swarm's.
          const down = Math.max(4, t.down + (Math.random() - 0.5) * 8);
          const done = Math.min(1, t.done + down / 1024 / t.size);
          return { ...t, down: done >= 1 ? 0 : down, done };
        }),
      );
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const downloading = torrents.filter((t) => t.done < 1);
  const totalDown = downloading.reduce((s, t) => s + t.down, 0);
  const counts = [torrents.length, downloading.length, torrents.length - downloading.length, torrents.length - downloading.length, downloading.length, 0];
  const current = torrents[selected];

  return (
    <div className="xp-app ut">
      <div className="xp-menubar">
        {MENUS.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <div className="ut-toolbar" aria-hidden="true">
        {TOOLBAR.map((t, i) =>
          t ? (
            <svg key={i} className="ut-tb" width={16} height={16} viewBox="0 0 16 16">
              <path d={t.d} fill={t.fill} />
            </svg>
          ) : (
            <span key={i} className="ut-tb-sep" />
          ),
        )}
        <span className="ut-search">Search</span>
      </div>
      <div className="ut-main">
        <ul className="ut-side">
          {CATEGORIES.map((c, i) => (
            <li key={c} className={i === 0 ? "ut-side-on" : undefined}>
              {c} ({counts[i]})
            </li>
          ))}
          <li className="ut-side-head">Labels</li>
          <li className="ut-side-head">Feeds (0)</li>
        </ul>
        <div className="ut-list">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Size</th>
                <th>Done</th>
                <th>Status</th>
                <th>Seeds</th>
                <th>Peers</th>
                <th>Down Speed</th>
                <th>ETA</th>
              </tr>
            </thead>
            <tbody>
              {torrents.map((t, i) => (
                <tr key={t.name} className={i === selected ? "ut-row-on" : undefined} onClick={() => setSelected(i)}>
                  <td>{t.done < 1 ? i + 1 : "*"}</td>
                  <td className="ut-name">{t.name}</td>
                  <td>{size(t.size)}</td>
                  <td>
                    <span className="ut-bar">
                      <span style={{ width: `${t.done * 100}%` }} />
                      <b>{(t.done * 100).toFixed(1)}%</b>
                    </span>
                  </td>
                  <td>{t.done >= 1 ? "Seeding" : "Downloading"}</td>
                  <td>{t.seeds}</td>
                  <td>{t.peers}</td>
                  <td>{t.done < 1 ? `${t.down.toFixed(1)} kB/s` : ""}</td>
                  <td>{eta(t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="ut-tabs">
        {TABS.map((t, i) => (
          <span key={t} className={i === 0 ? "ut-tab-on" : undefined}>
            {t}
          </span>
        ))}
      </div>
      <div className="ut-general">
        <span>Downloaded: {size(current.size * current.done)}</span>
        <span>Remaining: {size(current.size * (1 - current.done))}</span>
        <span>Time Elapsed: 2h 14m</span>
        <span>Share Ratio: {current.done >= 1 ? "1.412" : "0.087"}</span>
      </div>
      <div className="status-bar">
        <p className="status-bar-field">DHT: 312 nodes</p>
        <p className="status-bar-field">D: {totalDown.toFixed(1)} kB/s T: 1.3 GB</p>
        <p className="status-bar-field">U: 12.4 kB/s T: 2.1 GB</p>
      </div>
    </div>
  );
}
