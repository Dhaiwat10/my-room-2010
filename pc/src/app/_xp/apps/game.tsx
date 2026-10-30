"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { AppId } from "../apps";
import { currentDisc, DISCS, onDisc } from "../../../disc";
import { MsgErrorIcon } from "../icons";
import { playSound } from "../sounds";
import { useWm } from "../window-manager";

const discFor = (id: AppId) => {
  const d = currentDisc();
  return d && DISCS[d].game === id ? d : null;
};

// The games on the desktop aren't really installed. Launching one without its disc in the
// tower's drive gets what a SafeDisc game said; with the disc in, its AutoRun menu comes up.
export function cdError(id: AppId) {
  return function CdError() {
    const { dispatch, open } = useWm();
    const disc = useSyncExternalStore(onDisc, () => discFor(id), () => null);
    useEffect(() => {
      if (disc) {
        dispatch({ type: "close", id });
        open("autorun");
      } else playSound("criticalStop");
    }, [disc, dispatch, open]);
    if (disc) return null;
    return (
      <div className="xp-app xp-dialog">
        <div className="xp-dialog-body">
          <MsgErrorIcon size={32} />
          <p>Please insert the correct CD-ROM, select OK and restart application.</p>
        </div>
        <div className="xp-dialog-buttons">
          <button type="button" autoFocus onClick={() => dispatch({ type: "close", id })}>
            OK
          </button>
        </div>
      </div>
    );
  };
}
