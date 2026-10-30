"use client";

import { useState } from "react";
import { LATELY } from "../../../content";
import { GlobeIcon } from "../icons";
import { playSound } from "../sounds";

export function Projects() {
  const [selected, setSelected] = useState<string | null>(null);
  const openLink = (href: string) => {
    playSound("click");
    window.open(href, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="xp-app xp-explorer">
      <div className="xp-menubar">
        {["File", "Edit", "View", "Favorites", "Tools", "Help"].map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <div className="xp-addressbar">
        <span>Address</span>
        <div className="xp-address">C:\Documents and Settings\Dhaiwat\Projects</div>
      </div>
      <div className="xp-tiles" onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}>
        {LATELY.map((item) => (
          <button
            key={item.href}
            type="button"
            className={`xp-tile${selected === item.href ? " xp-tile-selected" : ""}`}
            onClick={() => setSelected(item.href)}
            onDoubleClick={() => openLink(item.href)}
            onKeyDown={(e) => e.key === "Enter" && openLink(item.href)}
          >
            <span className="xp-shortcut">
              <GlobeIcon />
            </span>
            <span>{item.title}</span>
          </button>
        ))}
      </div>
      <div className="status-bar">
        <p className="status-bar-field">{LATELY.length} objects</p>
        <p className="status-bar-field">Double-click a shortcut to open it</p>
      </div>
    </div>
  );
}
