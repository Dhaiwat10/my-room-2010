"use client";

import { useEffect, useRef } from "react";
import { SONGS } from "../../../content";
import { useWm } from "../window-manager";
import { registerWebamp } from "../../../room-bridge";

// Winamp 2.9, by way of Webamp (MIT): the original skin, main window,
// equalizer and playlist. It draws its own windows, so it sits on the desktop
// directly instead of inside an XP frame; the window manager still tracks it
// for the taskbar, focus and minimize.
export function Winamp() {
  const { wins, dispatch } = useWm();
  const win = wins.find((w) => w.id === "winamp");
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let instance: { dispose(): void } | null = null;
    void import("webamp").then(({ default: Webamp }) => {
      if (disposed) return;
      const webamp = new Webamp({
        initialTracks: SONGS.map((s) => ({ url: s.src, metaData: { artist: s.artist, title: s.title } })),
        windowLayout: {
          main: { position: { top: 0, left: 0 } },
          equalizer: { position: { top: 116, left: 0 } },
          playlist: { position: { top: 232, left: 0 }, size: { extraHeight: 0, extraWidth: 0 } },
        },
      });
      instance = webamp;
      webamp.onClose(() => dispatch({ type: "close", id: "winamp" }));
      webamp.onMinimize(() => dispatch({ type: "minimize", id: "winamp" }));
      void webamp.renderInto(host).then(() => registerWebamp(webamp));
    });
    return () => {
      disposed = true;
      instance?.dispose();
    };
  }, [dispatch]);

  return (
    <div
      ref={hostRef}
      className="xp-winamp"
      style={{ zIndex: win?.z, visibility: win?.minimized ? "hidden" : undefined }}
      onPointerDownCapture={() => dispatch({ type: "focus", id: "winamp" })}
    />
  );
}
