"use client";

import { useState } from "react";
import { PICTURES as WALL, type WallItem } from "../../../content";

// Placeholder tiles for frames that have no image yet.
const HUES = [24, 200, 140, 330, 50];

export function Picture({ item, index, className }: { item: WallItem; index: number; className?: string }) {
  if (item.src) {
    // Plain <img>: these are the user's own files served from /public.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.src} alt={item.title} className={className} />;
  }
  const hue = HUES[index % HUES.length];
  return (
    <div
      className={className}
      style={{
        background: `linear-gradient(160deg, hsl(${hue} 60% 78%), hsl(${hue + 30} 50% 55%))`,
        display: "grid",
        placeItems: "center",
        color: "rgba(0,0,0,.45)",
        fontSize: 11,
      }}
    >
      {item.title}
    </div>
  );
}

export function Pictures() {
  const [current, setCurrent] = useState(0);
  const item = WALL[current];

  return (
    <div className="xp-app xp-explorer">
      <div className="xp-menubar">
        {["File", "Edit", "View", "Favorites", "Tools", "Help"].map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <div className="xp-addressbar">
        <span>Address</span>
        <div className="xp-address">C:\Documents and Settings\Dhaiwat\My Pictures</div>
      </div>
      <div className="xp-pictures">
        <div className="xp-pictures-view">
          <Picture item={item} index={current} className="xp-pictures-big" />
          <div className="xp-pictures-caption">
            {item.title} ({current + 1} of {WALL.length})
          </div>
        </div>
        <div className="xp-pictures-strip">
          {WALL.map((w, i) => (
            <button
              key={w.id}
              type="button"
              className={`xp-thumb${i === current ? " xp-thumb-active" : ""}`}
              onClick={() => setCurrent(i)}
              aria-label={w.title}
            >
              <Picture item={w} index={i} className="xp-thumb-img" />
            </button>
          ))}
        </div>
      </div>
      <div className="status-bar">
        <p className="status-bar-field">{WALL.length} pictures</p>
        <p className="status-bar-field">{item.kind === "poster" ? "Poster" : "Photograph"}</p>
      </div>
    </div>
  );
}
