"use client";

import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import { APPS, type AppDef, type AppId } from "./apps";

export type Win = {
  id: AppId;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
};

type State = { wins: Win[]; nextZ: number; opened: number };

type Action =
  | { type: "open"; id: AppId; area: { w: number; h: number }; compact: boolean }
  | { type: "close"; id: AppId }
  | { type: "focus"; id: AppId }
  | { type: "minimize"; id: AppId }
  | { type: "toggleMax"; id: AppId }
  | { type: "move"; id: AppId; x: number; y: number }
  | { type: "resize"; id: AppId; x?: number; y?: number; w: number; h: number };

const TASKBAR = 30;

function reducer(state: State, action: Action): State {
  const raise = (wins: Win[], id: AppId, z: number) =>
    wins.map((w) => (w.id === id ? { ...w, z, minimized: false } : w));

  switch (action.type) {
    case "open": {
      if (state.wins.some((w) => w.id === action.id)) {
        return { ...state, wins: raise(state.wins, action.id, state.nextZ), nextZ: state.nextZ + 1 };
      }
      const def: AppDef = APPS[action.id];
      // Phones run everything maximized, except dialogs, which stay small and centred.
      const dialog = action.compact && Boolean(def.game);
      const w = def.big ? action.area.w - 36 : Math.min(def.size.w, action.area.w - 16);
      const h = def.big ? Math.round(action.area.h * 0.72) : Math.min(def.size.h, action.area.h - 16);
      const step = def.big || dialog ? 0 : (state.opened % 6) * 24;
      const x = dialog ? (action.area.w - w) / 2 : Math.max(8, Math.min((def.big ? 18 : 36) + step, action.area.w - w - 8));
      const y = dialog ? (action.area.h - h) / 3 : Math.max(8, Math.min((def.big ? 24 : 28) + step, action.area.h - h - 8));
      const maximized = (action.compact && !def.game) || Boolean(def.maximized);
      const win: Win = { id: action.id, x, y, w, h, z: state.nextZ, minimized: false, maximized };
      return { wins: [...state.wins, win], nextZ: state.nextZ + 1, opened: state.opened + 1 };
    }
    case "close":
      return { ...state, wins: state.wins.filter((w) => w.id !== action.id) };
    case "focus":
      return { ...state, wins: raise(state.wins, action.id, state.nextZ), nextZ: state.nextZ + 1 };
    case "minimize":
      return { ...state, wins: state.wins.map((w) => (w.id === action.id ? { ...w, minimized: true } : w)) };
    case "toggleMax":
      return {
        ...state,
        wins: state.wins.map((w) => (w.id === action.id ? { ...w, maximized: !w.maximized, z: state.nextZ } : w)),
        nextZ: state.nextZ + 1,
      };
    case "move":
      return { ...state, wins: state.wins.map((w) => (w.id === action.id ? { ...w, x: action.x, y: action.y } : w)) };
    case "resize":
      return {
        ...state,
        wins: state.wins.map((w) =>
          w.id === action.id
            ? { ...w, x: action.x ?? w.x, y: action.y ?? w.y, w: Math.max(220, action.w), h: Math.max(140, action.h) }
            : w,
        ),
      };
  }
}

type Ctx = {
  wins: Win[];
  active: AppId | null;
  dispatch: Dispatch<Action>;
  area: { w: number; h: number };
  compact: boolean;
  // How many screen pixels one logical pixel is, when the OS is scaled by a 3D transform.
  getScale: () => number;
  open: (id: AppId) => void;
};

const WmContext = createContext<Ctx | null>(null);

export function useWm() {
  const ctx = useContext(WmContext);
  if (!ctx) throw new Error("useWm outside WindowManager");
  return ctx;
}

export function WindowManager({
  children,
  area,
  getScale,
}: {
  children: ReactNode;
  area: { w: number; h: number };
  getScale: () => number;
}) {
  const [state, dispatch] = useReducer(reducer, { wins: [], nextZ: 1, opened: 0 });
  // Phone-sized either way up: windows open maximized.
  const compact = area.w < 560 || area.h < 420;
  const desktop = { w: area.w, h: area.h - TASKBAR };

  let active: AppId | null = null;
  let top = -1;
  for (const w of state.wins) {
    if (!w.minimized && w.z > top) {
      top = w.z;
      active = w.id;
    }
  }

  const value: Ctx = {
    wins: state.wins,
    active,
    dispatch,
    area: desktop,
    compact,
    getScale,
    open: (id) => dispatch({ type: "open", id, area: desktop, compact }),
  };
  return <WmContext.Provider value={value}>{children}</WmContext.Provider>;
}
