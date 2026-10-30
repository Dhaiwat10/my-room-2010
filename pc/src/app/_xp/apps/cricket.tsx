"use client";

import { useSyncExternalStore } from "react";
import { CRICKET_URL, LATELY } from "../../../content";
import { CricketIcon } from "../icons";

const REPO = "https://github.com/Dhaiwat10/cricket07-browser";

// The game plays with a keyboard or a controller and downloads hundreds of
// megabytes, so touch-only devices (phones, and tablets without a keyboard)
// get a note instead of the game.
const TOUCH_ONLY = "(pointer: coarse) and (hover: none), (max-width: 767px), (max-height: 500px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(TOUCH_ONLY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const isTouchOnly = () => window.matchMedia(TOUCH_ONLY).matches;

export function Cricket() {
  const touchOnly = useSyncExternalStore(subscribe, isTouchOnly, () => false);

  if (CRICKET_URL && !touchOnly) {
    return (
      <div className="xp-app xp-cricket">
        <iframe
          src={CRICKET_URL}
          title="Cricket 07"
          allow="gamepad; fullscreen; autoplay; cross-origin-isolated"
          className="xp-cricket-frame"
        />
      </div>
    );
  }
  return (
    <div className="xp-app xp-cricket xp-cricket-soon">
      <CricketIcon size={64} />
      {touchOnly ? (
        <>
          <h3>Cricket 07 needs a laptop or PC</h3>
          <p>
            It plays with a keyboard or a game controller, and it won&rsquo;t run on a phone. Open this site on a
            laptop or desktop to play it, right here in this window.
          </p>
        </>
      ) : (
        <>
          <h3>Cricket 07 is being installed…</h3>
          <p>
            The 2006 game, recompiled from x86 to WebAssembly with Direct3D rebuilt on WebGPU. It will run right here,
            in this window, with online 1v1.
          </p>
        </>
      )}
      <p>
        <a href={LATELY[0].href} target="_blank" rel="noopener noreferrer">
          Watch it run
        </a>
        {" · "}
        <a href={REPO} target="_blank" rel="noopener noreferrer">
          Read how it was made
        </a>
      </p>
    </div>
  );
}
