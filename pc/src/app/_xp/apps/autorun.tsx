"use client";

import { useState, useSyncExternalStore } from "react";
import { currentDisc, discArt, DISCS, onDisc, type DiscId } from "../../../disc";
import { useWm } from "../window-manager";
import { MsgBox, type Msg } from "./msgbox";

// The menu a game disc's autorun.exe threw up when it went in: the box art and a few big
// buttons. Only Cricket 07 actually runs on this PC, so Play and Install each make an excuse
// and send you to that disc.
const PLAY: Record<Exclude<DiscId, "cricket07">, string> = {
  sanandreas:
    "Typed HESOYAM. Got health, armour and $250,000. Still won't start.\n\nCJ says this PC can't handle Los Santos. Try the Cricket 07 disc instead.",
  vicecity:
    "Tommy Vercetti is busy at the Malibu Club and Mummy says no GTA before exams anyway.\n\nPut the Cricket 07 disc in. Cricket is basically studying.",
  lara:
    "Brian Lara has retired hurt.\n\nSachin is already padded up in Cricket 07. Swap that disc in.",
  aoe:
    "Wololo! Your villagers have converted to Cricket 07.\n\nThey're still gathering wood for this one. Put the Cricket 07 disc in.",
};
export function AutoRun() {
  const { dispatch } = useWm();
  const disc = useSyncExternalStore(onDisc, currentDisc, () => null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const close = () => dispatch({ type: "close", id: "autorun" });
  if (!disc || disc === "cricket07") {
    return (
      <div className="xp-app xp-autorun">
        <MsgBox msg={{ title: "AutoPlay", text: "Please insert a disk into drive F:.", kind: "warning" }} onClose={close} />
      </div>
    );
  }
  const { title } = DISCS[disc];
  const play: Msg = { title, text: PLAY[disc], kind: "error" };
  const install: Msg = {
    title: `${title} Setup`,
    text: "Copying files... 99%\n\nPlease insert Disc 2.\n\n(There is no Disc 2. There was never a Disc 2.) Go put the Cricket 07 disc in, that one actually works.",
    kind: "warning",
  };
  return (
    <div className="xp-app xp-autorun">
      <img src={discArt(disc)} alt="" className="xp-autorun-art" />
      <div className="xp-autorun-side">
        <h3>{title}</h3>
        <button type="button" autoFocus onClick={() => setMsg(play)}>Play</button>
        <button type="button" onClick={() => setMsg(install)}>Install</button>
        <button type="button" onClick={close}>Exit</button>
      </div>
      {msg ? <MsgBox msg={msg} onClose={() => setMsg(null)} /> : null}
    </div>
  );
}
