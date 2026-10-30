// The XP machine on its own page, shown inside the monitor in the room.
// It boots by itself as soon as the room has loaded, and tells the room which phase it's
// in (BIOS, boot screen, welcome, desktop) so the monitor and its glow can follow along.
import { installAudioTap } from "./room-bridge";
installAudioTap();   // before anything creates an AudioContext

import { useCallback, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { XpDesktop, type Phase } from "./app/_xp/xp-desktop";

function Machine() {
  const powerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "power") powerRef.current?.();
    };
    addEventListener("message", onMessage);
    parent.postMessage({ type: "pc-ready" }, "*");
    return () => removeEventListener("message", onMessage);
  }, []);

  const onPhase = useCallback((phase: Phase) => parent.postMessage({ type: "pc-phase", phase }, "*"), []);

  return <XpDesktop mode="fullscreen" autoBoot={false} powerRef={powerRef} onPhase={onPhase} />;
}

createRoot(document.getElementById("root")!).render(<Machine />);
