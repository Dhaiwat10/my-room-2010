"use client";

import { useState, useSyncExternalStore } from "react";
import { currentDisc, discArt, DISCS, onDisc } from "../../../disc";
import { useWm } from "../window-manager";
import { MsgBox, type Msg } from "./msgbox";

// The menu a game disc's autorun.exe threw up when it went in: the box art and a few big
// buttons. Only Cricket 07 actually runs on this PC, so Play and Install own up to that.
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
  const notHere: Msg = {
    title,
    text: `${title} was never installed on this PC. Only Cricket 07 runs here — swap its disc back in.`,
    kind: "info",
  };
  return (
    <div className="xp-app xp-autorun">
      <img src={discArt(disc)} alt="" className="xp-autorun-art" />
      <div className="xp-autorun-side">
        <h3>{title}</h3>
        <button type="button" autoFocus onClick={() => setMsg(notHere)}>Play</button>
        <button type="button" onClick={() => setMsg(notHere)}>Install</button>
        <button type="button" onClick={close}>Exit</button>
      </div>
      {msg ? <MsgBox msg={msg} onClose={() => setMsg(null)} /> : null}
    </div>
  );
}
