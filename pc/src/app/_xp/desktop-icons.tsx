"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { APPS, DESKTOP_IDS, type AppDef, type AppId } from "./apps";
import { RecycleBinEmptyIcon, ShortcutArrow } from "./icons";
import { useXpSettings } from "./settings";
import { playSound } from "./sounds";
import { useWm } from "./window-manager";

// XP's hover tip for a shortcut: the folder its target lives in.
function location(target: string) {
  const dir = target.slice(0, target.lastIndexOf("\\"));
  const cut = dir.lastIndexOf("\\");
  return `Location: ${dir.slice(cut + 1)} (${dir.slice(0, cut)})`;
}

// Icons sit on a grid, filled top to bottom then left to right, and snap
// back to it when dropped (XP's "Align to Grid").
const CELL_W = 76;
const CELL_H = 72;
const PAD = 4;
// How far the pointer moves before a press becomes a drag.
const SLOP = 4;
// The part of a cell an icon actually covers, for the selection rectangle.
const HIT = { x: 10, y: 2, w: CELL_W - 20, h: CELL_H - 18 };

type Pos = { x: number; y: number };

const ICON_IDS = DESKTOP_IDS;
// Everything flows down the left in columns; the Recycle Bin starts in the
// bottom-right corner, where XP put it.
const FLOW = ICON_IDS.filter((id) => id !== "recycle");
type Rect = { x: number; y: number; w: number; h: number };
type Gesture = {
  kind: "icon" | "band";
  id?: AppId;
  pointerId: number;
  cx: number;
  cy: number;
  scale: number;
  origin: Pos; // band start, in desktop pixels
  base: Set<AppId>; // selection to add the band to (with Ctrl)
  toggle: boolean;
  moved: boolean;
  delta: Pos;
};

const cellKey = (p: Pos) => `${p.x},${p.y}`;

function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function DesktopIcons({ onBackgroundClick }: { onBackgroundClick: () => void }) {
  const { open: openApp, area, getScale } = useWm();
  const [moved, setMoved] = useState<Partial<Record<AppId, Pos>>>({});
  const [selected, setSelected] = useState<Set<AppId>>(() => new Set());
  const [drag, setDrag] = useState<Pos | null>(null);
  const [band, setBand] = useState<Rect | null>(null);
  const gesture = useRef<Gesture | null>(null);

  const rows = Math.max(1, Math.floor((area.h - PAD) / CELL_H));
  const cols = Math.max(1, Math.floor((area.w - PAD) / CELL_W));
  const posOf = (id: AppId): Pos => {
    if (moved[id]) return moved[id];
    if (id === "recycle") return { x: PAD + (cols - 1) * CELL_W, y: PAD + (rows - 1) * CELL_H };
    const i = FLOW.indexOf(id);
    return { x: PAD + Math.floor(i / rows) * CELL_W, y: PAD + (i % rows) * CELL_H };
  };
  const { binEmpty } = useXpSettings();

  const open = (id: AppId) => {
    playSound("click");
    openApp(id);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const additive = e.ctrlKey || e.metaKey;
    const icon = (e.target as HTMLElement).closest<HTMLElement>("[data-icon]");
    const base = {
      pointerId: e.pointerId,
      cx: e.clientX,
      cy: e.clientY,
      scale: getScale(),
      moved: false,
      delta: { x: 0, y: 0 },
    };
    if (icon) {
      const id = icon.dataset.icon as AppId;
      if (additive) {
        setSelected((s) => {
          const next = new Set(s);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      } else if (!selected.has(id)) {
        setSelected(new Set([id]));
      }
      gesture.current = { ...base, kind: "icon", id, origin: { x: 0, y: 0 }, base: new Set(), toggle: additive };
      return;
    }
    if (e.target !== e.currentTarget) return;
    onBackgroundClick();
    const keep = additive ? new Set(selected) : new Set<AppId>();
    if (!additive) setSelected(keep);
    const origin = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
    gesture.current = { ...base, kind: "band", origin, base: keep, toggle: additive };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointerId) return;
    // A release that went missing (over an iframe, outside the browser).
    if (!(e.buttons & 1)) return end(e);
    const dx = (e.clientX - g.cx) / g.scale;
    const dy = (e.clientY - g.cy) / g.scale;
    if (!g.moved) {
      if (Math.hypot(dx, dy) < SLOP) return;
      g.moved = true;
      // Only capture once it's a drag, so clicks and double-clicks still
      // land on the icon.
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    g.delta = { x: dx, y: dy };
    if (g.kind === "icon") {
      setDrag(g.delta);
      return;
    }
    const x = Math.min(g.origin.x, g.origin.x + dx);
    const y = Math.min(g.origin.y, g.origin.y + dy);
    const rect = { x, y, w: Math.abs(dx), h: Math.abs(dy) };
    setBand(rect);
    const next = new Set(g.base);
    ICON_IDS.forEach((id) => {
      const p = posOf(id);
      if (overlaps(rect, { x: p.x + HIT.x, y: p.y + HIT.y, w: HIT.w, h: HIT.h })) next.add(id);
    });
    setSelected(next);
  };

  // Drop the dragged icons on the nearest free grid cells.
  const drop = (delta: Pos) => {
    const taken = new Set(ICON_IDS.filter((id) => !selected.has(id)).map((id) => cellKey(posOf(id))));
    const next = { ...moved };
    for (const id of ICON_IDS.filter((i) => selected.has(i))) {
      const p = posOf(id);
      const want = {
        col: Math.min(cols - 1, Math.max(0, Math.round((p.x + delta.x - PAD) / CELL_W))),
        row: Math.min(rows - 1, Math.max(0, Math.round((p.y + delta.y - PAD) / CELL_H))),
      };
      let best: Pos | null = null;
      let bestD = Infinity;
      for (let c = 0; c < cols; c++)
        for (let r = 0; r < rows; r++) {
          const cell = { x: PAD + c * CELL_W, y: PAD + r * CELL_H };
          const d = (c - want.col) ** 2 + (r - want.row) ** 2;
          if (d < bestD && !taken.has(cellKey(cell))) {
            best = cell;
            bestD = d;
          }
        }
      if (!best) continue;
      taken.add(cellKey(best));
      next[id] = best;
    }
    setMoved(next);
  };

  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointerId) return;
    gesture.current = null;
    if (g.kind === "icon" && g.moved) drop(g.delta);
    // A plain click on one of several selected icons leaves just that one.
    if (g.kind === "icon" && !g.moved && !g.toggle && g.id) setSelected(new Set([g.id]));
    setDrag(null);
    setBand(null);
  };

  return (
    <div
      className="xp-icons"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      {ICON_IDS.map((id) => {
        const def: AppDef = APPS[id];
        const Icon = id === "recycle" && binEmpty ? RecycleBinEmptyIcon : def.icon;
        const p = posOf(id);
        const isSelected = selected.has(id);
        const dragging = Boolean(drag) && isSelected;
        return (
          <button
            key={id}
            type="button"
            data-icon={id}
            className={`xp-icon${isSelected ? " xp-icon-selected" : ""}${dragging ? " xp-icon-dragging" : ""}`}
            style={{ left: p.x + (dragging ? drag!.x : 0), top: p.y + (dragging ? drag!.y : 0) }}
            title={def.target ? location(def.target) : undefined}
            onDoubleClick={() => open(id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") open(id);
            }}
          >
            <span className="xp-icon-art">
              <Icon />
              {def.target ? <ShortcutArrow /> : null}
            </span>
            <span>{def.label}</span>
          </button>
        );
      })}
      {band ? (
        <div className="xp-band" style={{ left: band.x, top: band.y, width: band.w, height: band.h }} aria-hidden="true" />
      ) : null}
    </div>
  );
}
