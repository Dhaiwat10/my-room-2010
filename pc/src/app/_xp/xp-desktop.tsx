"use client";

import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import "./xp.css";
import { APPS, type AppDef } from "./apps";
import { ScreenSaver, useIdleScreensaver } from "./screensaver";
import { XpSettingsProvider, useXpSettings, wallpaperBackground } from "./settings";
import { DesktopIcons } from "./desktop-icons";
import { StartMenu, Taskbar } from "./taskbar";
import { Window } from "./window";
import { WindowManager, useWm } from "./window-manager";
import { toggleMusic } from "../../room-bridge";
import { DISCS, onDisc } from "../../disc";

export type Phase = "off" | "bios" | "boot" | "welcome" | "desktop";

// How long each boot phase lasts before moving on.
const PHASE_MS: Partial<Record<Phase, number>> = { bios: 1300, boot: 4200, welcome: 2000 };
const NEXT: Partial<Record<Phase, Phase>> = { bios: "boot", boot: "welcome", welcome: "desktop" };

// A 17" CRT ran 640×480 or 800×600; the smaller one keeps the UI readable
// when the screen is scaled down to fit a browser window.
export const XP_WIDTH = 640;
export const XP_HEIGHT = 480;

export type XpDesktopProps = {
  mode: "embedded" | "fullscreen";
  // Start booting on mount (after a beat) instead of waiting for a click.
  autoBoot?: boolean;
  // Receives a function that turns the machine on, for a host that wants to
  // react to clicks on the monitor body.
  powerRef?: MutableRefObject<(() => void) | null>;
  onPhase?: (phase: Phase) => void;
};

export function XpDesktop({ mode, autoBoot = true, powerRef, onPhase }: XpDesktopProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("off");
  const [area, setArea] = useState({ w: XP_WIDTH, h: XP_HEIGHT });
  const [turnedOff, setTurnedOff] = useState(false);

  useEffect(() => {
    onPhase?.(phase);
  }, [phase, onPhase]);

  // XP's startup sound plays at logon. Browsers refuse audio before the
  // visitor has clicked or typed on the page, so an auto-boot may stay silent.
  const startupSound = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (phase === "bios") {
      startupSound.current = new Audio("/pc/xp/sounds/startup.mp3");
      startupSound.current.preload = "auto";
    }
    if (phase === "welcome") void startupSound.current?.play().catch(() => {});
    if (phase === "off") startupSound.current?.pause();
  }, [phase]);

  useEffect(() => {
    if (!powerRef) return;
    powerRef.current = () => {
      setTurnedOff(false);
      setPhase((p) => (p === "off" ? "bios" : p));
    };
    return () => {
      powerRef.current = null;
    };
  }, [powerRef]);

  useEffect(() => {
    if (phase === "off") {
      if (!autoBoot || turnedOff) return;
      const id = setTimeout(() => setPhase("bios"), 250);
      return () => clearTimeout(id);
    }
    const next = NEXT[phase];
    const ms = PHASE_MS[phase];
    if (!next || !ms) return;
    const id = setTimeout(() => setPhase(next), ms);
    return () => clearTimeout(id);
  }, [phase, autoBoot, turnedOff]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || mode !== "fullscreen") return;
    const update = () => setArea({ w: root.clientWidth, h: root.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(root);
    return () => ro.disconnect();
  }, [mode]);

  const getScale = () => {
    const root = rootRef.current;
    if (!root || root.offsetWidth === 0) return 1;
    return root.getBoundingClientRect().width / root.offsetWidth;
  };

  const powerOn = () => {
    setTurnedOff(false);
    setPhase("bios");
  };

  return (
    <div ref={rootRef} className="xp-screen" data-mode={mode} data-phase={phase}>
      {/* xp.css (MIT) is served from /public: its CSS trips Turbopack's parser when bundled. */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/pc/xp/XP.css" precedence="xp" />
      <XpSettingsProvider>
      {phase === "off" ? (
        <button type="button" className="xp-off" onClick={powerOn} aria-label="Turn on">
          {turnedOff ? <span>Click here to turn on the computer.</span> : null}
        </button>
      ) : null}
      {phase === "bios" ? <Bios /> : null}
      {phase === "boot" ? <Boot /> : null}
      {phase === "welcome" ? <Welcome /> : null}
      {phase === "desktop" ? (
        <WindowManager area={area} getScale={getScale}>
          <Desktop
            onTurnOff={() => {
              setTurnedOff(true);
              setPhase("off");
            }}
          />
        </WindowManager>
      ) : null}
      <SaverHost rootRef={rootRef} awake={phase === "desktop"} />
      </XpSettingsProvider>
      {mode === "embedded" ? <div className="xp-crt" aria-hidden="true" /> : null}
    </div>
  );
}

function SaverHost({ rootRef, awake }: { rootRef: RefObject<HTMLDivElement | null>; awake: boolean }) {
  useIdleScreensaver(rootRef, awake);
  return awake ? <ScreenSaver /> : null;
}

function Desktop({ onTurnOff }: { onTurnOff: () => void }) {
  const { wins, open } = useWm();
  const { settings } = useXpSettings();
  const [menuOpen, setMenuOpen] = useState(false);

  // the room asks for music when you tap one of the desk speakers
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "speakers") toggleMusic(() => openRef.current("winamp"));
    };
    addEventListener("message", onMessage);
    // AutoPlay: a disc going into the drive starts its game once it has spun up
    let spinUp = 0;
    const offDisc = onDisc((d) => {
      clearTimeout(spinUp);
      if (d) spinUp = window.setTimeout(() => openRef.current(DISCS[d].app), 3200);
    });
    return () => {
      removeEventListener("message", onMessage);
      offDisc();
      clearTimeout(spinUp);
    };
  }, []);
  return (
    <div className="xp-desktop" style={{ background: wallpaperBackground(settings.wallpaper) }}>
      <DesktopIcons onBackgroundClick={() => setMenuOpen(false)} />
      {wins.map((w) => {
        const def: AppDef = APPS[w.id];
        return def.skinned ? <def.component key={w.id} /> : <Window key={w.id} win={w} />;
      })}
      {menuOpen ? <StartMenu onClose={() => setMenuOpen(false)} onTurnOff={onTurnOff} /> : null}
      <Taskbar menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((v) => !v)} />
    </div>
  );
}

const BIOS_LINES = [
  "DP BIOS v2.04, An Energy Star Ally",
  "Copyright (C) 2001, Dhaiwat Pandya",
  "",
  "Main Processor : Intel(R) Pentium(R) 4 CPU 1.70GHz",
  "Memory Testing : 262144K OK",
  "",
  "Detecting IDE Primary Master   ... ST340016A",
  "Detecting IDE Secondary Master ... HL-DT-ST DVDRAM GSA-H62N",
  "",
  "Booting from Hard Disk...",
];

function Bios() {
  const [count, setCount] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setCount((c) => Math.min(c + 1, BIOS_LINES.length)), 70);
    return () => clearInterval(id);
  }, []);
  return <pre className="xp-bios">{BIOS_LINES.slice(0, count).join("\n")}</pre>;
}

function Boot() {
  return (
    <div className="xp-boot">
      <div className="xp-boot-screen">
        <div className="xp-boot-bar">
          <i />
        </div>
      </div>
    </div>
  );
}

function Welcome() {
  return (
    <div className="xp-welcome">
      <span>welcome</span>
    </div>
  );
}
