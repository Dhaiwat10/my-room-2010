"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { APPS, type AppDef } from "./apps";
import { useWm, type Win } from "./window-manager";

// Every edge and corner resizes, as on XP. Each letter is an edge it moves.
const EDGES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;
type Edge = (typeof EDGES)[number];
const MIN_W = 220;
const MIN_H = 140;

export function Window({ win }: { win: Win }) {
  const { dispatch, active, area, compact, getScale } = useWm();
  const def: AppDef = APPS[win.id];
  const Body = def.component;
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; scale: number } | null>(null);
  const sizing = useRef<{ edge: Edge; x: number; y: number; start: Win; scale: number } | null>(null);

  const onTitleDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (win.maximized || compact) return;
    if ((e.target as HTMLElement).closest("button")) return;
    drag.current = { x: e.clientX, y: e.clientY, ox: win.x, oy: win.y, scale: getScale() };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onTitleMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    // The release can go missing (let go over an iframe or outside the
    // browser), so a move with no button held ends the drag too.
    if (!(e.buttons & 1)) return endTitleDrag();
    const x = d.ox + (e.clientX - d.x) / d.scale;
    const y = d.oy + (e.clientY - d.y) / d.scale;
    dispatch({
      type: "move",
      id: win.id,
      x: Math.max(-win.w + 60, Math.min(x, area.w - 60)),
      y: Math.max(0, Math.min(y, area.h - 24)),
    });
  };
  const endTitleDrag = () => {
    drag.current = null;
  };

  const onResizeDown = (edge: Edge) => (e: ReactPointerEvent<HTMLDivElement>) => {
    sizing.current = { edge, x: e.clientX, y: e.clientY, start: win, scale: getScale() };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();
  };
  const onResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = sizing.current;
    if (!r) return;
    if (!(e.buttons & 1)) return endResize();
    const dx = (e.clientX - r.x) / r.scale;
    const dy = (e.clientY - r.y) / r.scale;
    let { x, y, w, h } = r.start;
    if (r.edge.includes("e")) w = Math.max(MIN_W, w + dx);
    if (r.edge.includes("s")) h = Math.max(MIN_H, h + dy);
    if (r.edge.includes("w")) {
      w = Math.max(MIN_W, w - dx);
      x = r.start.x + r.start.w - w;
    }
    if (r.edge.includes("n")) {
      // The title bar can't go above the top of the screen.
      h = Math.max(MIN_H, Math.min(h - dy, r.start.y + r.start.h));
      y = r.start.y + r.start.h - h;
    }
    dispatch({ type: "resize", id: win.id, x, y, w, h });
  };
  const endResize = () => {
    sizing.current = null;
  };

  // Phones keep every window maximized, bar the small dialogs.
  const maximized = win.maximized || (compact && !def.game);
  const style = maximized
    ? { left: 0, top: 0, width: area.w, height: area.h, zIndex: win.z }
    : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z };

  return (
    <div
      className={`window xp-window${active === win.id ? "" : " xp-window-inactive"}${maximized ? " xp-window-max" : ""}`}
      style={style}
      hidden={win.minimized}
      onPointerDownCapture={() => {
        if (active !== win.id) dispatch({ type: "focus", id: win.id });
      }}
    >
      <div
        className="title-bar"
        onPointerDown={onTitleDown}
        onPointerMove={onTitleMove}
        onPointerUp={endTitleDrag}
        onPointerCancel={endTitleDrag}
        onLostPointerCapture={endTitleDrag}
        onDoubleClick={() => !compact && dispatch({ type: "toggleMax", id: win.id })}
      >
        <div className="title-bar-text">
          <def.icon size={16} />
          <span>{def.title}</span>
        </div>
        <div className="title-bar-controls">
          <button type="button" aria-label="Minimize" onClick={() => dispatch({ type: "minimize", id: win.id })} />
          <button
            type="button"
            aria-label={win.maximized ? "Restore" : "Maximize"}
            onClick={() => dispatch({ type: "toggleMax", id: win.id })}
          />
          <button type="button" aria-label="Close" onClick={() => dispatch({ type: "close", id: win.id })} />
        </div>
      </div>
      <div className="window-body">
        <Body />
      </div>
      {maximized
        ? null
        : EDGES.map((edge) => (
            <div
              key={edge}
              className={`xp-edge xp-edge-${edge}`}
              onPointerDown={onResizeDown(edge)}
              onPointerMove={onResizeMove}
              onPointerUp={endResize}
              onPointerCancel={endResize}
              onLostPointerCapture={endResize}
            />
          ))}
    </div>
  );
}
