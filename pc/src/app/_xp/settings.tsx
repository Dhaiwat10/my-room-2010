"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { PICTURES } from "../../content";

// Machine-wide state the apps share: what Display Properties sets (kept
// across visits), the screensaver that's showing, and the Recycle Bin.

export type ScreenSaver = "none" | "pipes" | "mystify" | "starfield" | "marquee";

export const SCREENSAVERS: { id: ScreenSaver; label: string }[] = [
  { id: "none", label: "(None)" },
  { id: "pipes", label: "3D Pipes" },
  { id: "mystify", label: "Mystify" },
  { id: "starfield", label: "Starfield" },
  { id: "marquee", label: "Marquee" },
];

export const WALLPAPERS: { id: string; label: string; background: string }[] = [
  { id: "bliss", label: "Bliss", background: "#5a8ed8 url(/pc/xp/bliss.jpg) center / cover no-repeat" },
  { id: "none", label: "(None)", background: "#004e98" },
  ...PICTURES.filter((p) => p.src).map((p) => ({
    id: p.id,
    label: p.title,
    background: `#000 url("${p.src}") center / cover no-repeat`,
  })),
];

export type Settings = { wallpaper: string; screensaver: ScreenSaver; wait: number; marquee: string };

const DEFAULTS: Settings = { wallpaper: "bliss", screensaver: "pipes", wait: 2, marquee: "Dhaiwat Pandya" };
const KEY = "xp-settings:v1";

type Ctx = {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  saver: ScreenSaver | null;
  showSaver: (kind?: ScreenSaver) => void;
  hideSaver: () => void;
  binEmpty: boolean;
  emptyBin: () => void;
};

const SettingsContext = createContext<Ctx | null>(null);

export function useXpSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useXpSettings outside XpSettingsProvider");
  return ctx;
}

export function wallpaperBackground(id: string) {
  return (WALLPAPERS.find((w) => w.id === id) ?? WALLPAPERS[0]).background;
}

export function XpSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [saver, setSaver] = useState<ScreenSaver | null>(null);
  const [binEmpty, setBinEmpty] = useState(false);

  // Read after mount so server and client render the same first frame.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from storage
      if (saved) setSettings((s) => ({ ...s, ...(JSON.parse(saved) as Partial<Settings>) }));
    } catch {}
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const fallback = settings.screensaver;
  const showSaver = useCallback((kind?: ScreenSaver) => setSaver(kind ?? fallback), [fallback]);
  const hideSaver = useCallback(() => setSaver(null), []);
  const emptyBin = useCallback(() => setBinEmpty(true), []);

  const value: Ctx = { settings, update, saver, showSaver, hideSaver, binEmpty, emptyBin };
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
