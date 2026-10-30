"use client";

import { useEffect } from "react";
import { MsgErrorIcon, MsgInfoIcon, MsgQuestionIcon, MsgWarningIcon } from "../icons";
import { playSound } from "../sounds";

// An XP message box drawn inside an app's window, for the errors and
// questions Explorer and friends used to throw.

export type MsgKind = "error" | "warning" | "info" | "question";
export type Msg = { title: string; text: string; kind: MsgKind; buttons?: string[]; onButton?: (b: string) => void };

const SOUND = { error: "criticalStop", warning: "exclamation", info: "ding", question: "exclamation" } as const;

const ICONS = { error: MsgErrorIcon, warning: MsgWarningIcon, info: MsgInfoIcon, question: MsgQuestionIcon };

function MsgIcon({ kind }: { kind: MsgKind }) {
  const Icon = ICONS[kind];
  return <Icon size={32} />;
}

export function MsgBox({ msg, onClose }: { msg: Msg; onClose: () => void }) {
  useEffect(() => playSound(SOUND[msg.kind]), [msg]);
  const buttons = msg.buttons ?? ["OK"];
  return (
    <div className="xp-msg-backdrop" onPointerDown={(e) => e.stopPropagation()}>
      <div className="window xp-msg" role="alertdialog" aria-label={msg.title}>
        <div className="title-bar">
          <div className="title-bar-text">{msg.title}</div>
          <div className="title-bar-controls">
            <button type="button" aria-label="Close" onClick={onClose} />
          </div>
        </div>
        <div className="window-body xp-msg-body">
          <div className="xp-dialog-body">
            <MsgIcon kind={msg.kind} />
            <p>{msg.text}</p>
          </div>
          <div className="xp-dialog-buttons">
            {buttons.map((b, i) => (
              <button
                key={b}
                type="button"
                autoFocus={i === 0}
                onClick={() => {
                  onClose();
                  msg.onButton?.(b);
                }}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
