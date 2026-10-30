"use client";

import { useEffect } from "react";
import type { AppId } from "../apps";
import { MsgErrorIcon } from "../icons";
import { playSound } from "../sounds";
import { useWm } from "../window-manager";

// The games on the desktop aren't really installed. Launching one gets what a
// SafeDisc game said when the disc wasn't in the drive.
export function cdError(id: AppId) {
  return function CdError() {
    const { dispatch } = useWm();
    useEffect(() => playSound("criticalStop"), []);
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
