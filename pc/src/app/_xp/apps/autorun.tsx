"use client";

import { useState, useSyncExternalStore } from "react";
import { currentDisc, discArt, DISCS, onDisc } from "../../../disc";
import { useWm } from "../window-manager";
import { MsgBox, type Msg } from "./msgbox";

// The menu a game disc's autorun.exe threw up when it went in: the box art and a few big
// buttons. Only Cricket 07 actually runs on this PC, so the other discs are "scratched" and
// send you to that one.
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
  const scratched: Msg = {
    title,
    text: "Cannot read from drive F:.\n\nThis disc is scratched to death. Somebody's been using it as a tea coaster.\n\nThe Cricket 07 disc still works though. Try that one.",
    kind: "error",
  };
  return (
    <div className="xp-app xp-autorun">
      <img src={discArt(disc)} alt="" className="xp-autorun-art" />
      <div className="xp-autorun-side">
        <h3>{title}</h3>
        <button type="button" autoFocus onClick={() => setMsg(scratched)}>Play</button>
        <button type="button" onClick={() => setMsg(scratched)}>Install</button>
        <button type="button" onClick={close}>Exit</button>
      </div>
      {msg ? <MsgBox msg={msg} onClose={() => setMsg(null)} /> : null}
    </div>
  );
}
