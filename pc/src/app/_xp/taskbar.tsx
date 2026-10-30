"use client";

import { useEffect, useState } from "react";
import { NAME, SOCIALS } from "../../content";
import { APPS, MENU_IDS } from "./apps";
import { ComputerIcon, ControlPanelIcon, GlobeIcon, MailIcon, PowerIcon, UserPicture } from "./icons";
import { useWm } from "./window-manager";

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function Taskbar({
  menuOpen,
  onToggleMenu,
}: {
  menuOpen: boolean;
  onToggleMenu: () => void;
}) {
  const { wins, active, dispatch } = useWm();
  const time = useClock();

  return (
    <div className="xp-taskbar">
      <button
        type="button"
        className={`xp-start${menuOpen ? " xp-start-open" : ""}`}
        onClick={onToggleMenu}
        aria-expanded={menuOpen}
      >
        <span className="xp-start-flag" aria-hidden="true" />
        start
      </button>
      <div className="xp-tasks">
        {wins.map((w) => {
          const def = APPS[w.id];
          const isActive = active === w.id && !w.minimized;
          return (
            <button
              key={w.id}
              type="button"
              className={`xp-task${isActive ? " xp-task-active" : ""}`}
              onClick={() => dispatch(isActive ? { type: "minimize", id: w.id } : { type: "focus", id: w.id })}
            >
              <def.icon size={16} />
              <span>{def.title}</span>
            </button>
          );
        })}
      </div>
      <div className="xp-tray">
        <span className="xp-tray-dot" aria-hidden="true" />
        <span>{time}</span>
      </div>
    </div>
  );
}

export function StartMenu({ onClose, onTurnOff }: { onClose: () => void; onTurnOff: () => void }) {
  const { open } = useWm();
  return (
    <div className="xp-startmenu" role="menu">
      <div className="xp-startmenu-head">
        <span className="xp-avatar" aria-hidden="true">
          <UserPicture size={40} />
        </span>
        {NAME}
      </div>
      <div className="xp-startmenu-cols">
        <div className="xp-startmenu-left">
          {MENU_IDS.map((id) => {
            const def = APPS[id];
            return (
              <button
                key={id}
                type="button"
                className="xp-startmenu-item"
                role="menuitem"
                onClick={() => {
                  open(id);
                  onClose();
                }}
              >
                <def.icon size={24} />
                <span>{def.label}</span>
              </button>
            );
          })}
        </div>
        <div className="xp-startmenu-right">
          {(
            [
              ["mycomputer", ComputerIcon],
              ["controlpanel", ControlPanelIcon],
            ] as const
          ).map(([id, Icon]) => (
            <button
              key={id}
              type="button"
              className="xp-startmenu-item"
              role="menuitem"
              onClick={() => {
                open(id);
                onClose();
              }}
            >
              <Icon size={20} />
              <span>{APPS[id].label}</span>
            </button>
          ))}
          <div className="xp-startmenu-sep" />
          {SOCIALS.map((s) => (
            <a
              key={s.href}
              className="xp-startmenu-item"
              role="menuitem"
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
            >
              {s.href.startsWith("mailto:") ? <MailIcon size={20} /> : <GlobeIcon size={20} />}
              <span>{s.title}</span>
            </a>
          ))}
          <div className="xp-startmenu-sep" />
          <a className="xp-startmenu-item" role="menuitem" href="https://dhaiwat.com/classic" target="_blank" rel="noreferrer" onClick={onClose}>
            <NotepadLike />
            <span>Plain text site</span>
          </a>
        </div>
      </div>
      <div className="xp-startmenu-foot">
        <button type="button" className="xp-startmenu-power" onClick={onTurnOff}>
          <PowerIcon size={20} />
          Turn Off Computer
        </button>
      </div>
    </div>
  );
}

function NotepadLike() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M7 3h13l6 6v20H7z" fill="#fff" stroke="#5c6a85" />
      <path d="M10 13h12M10 17h12M10 21h12" stroke="#3b63c4" strokeWidth="1.5" />
    </svg>
  );
}
