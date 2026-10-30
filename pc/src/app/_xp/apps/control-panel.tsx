"use client";

import { useState, type ComponentType } from "react";
import { APP_IDS, APPS, type AppDef } from "../apps";
import {
  AccessibilityIcon,
  AddRemoveIcon,
  DisplayIcon,
  NetworkIcon,
  PerformanceIcon,
  PrinterIcon,
  RegionalIcon,
  SecurityCenterIcon,
  SoundsIcon,
  UserAccountsIcon,
} from "../icons";
import { SCREENSAVERS, WALLPAPERS, useXpSettings, wallpaperBackground, type Settings } from "../settings";
import { MsgBox, type Msg } from "./msgbox";

// Control Panel in XP's category view. Appearance and Themes opens a
// working Display Properties (wallpaper, screensaver); Add or Remove
// Programs lists what's installed; the rest say what XP would have said.

type Icon = ComponentType<{ size?: number }>;
type Category = { title: string; icon: Icon; open: "display" | "programs" | Msg };

const CATEGORIES: Category[] = [
  { title: "Appearance and Themes", icon: DisplayIcon, open: "display" },
  {
    title: "Network and Internet Connections",
    icon: NetworkIcon,
    open: { title: "Connect BSNL DataOne", text: "Error 678: The remote computer did not respond. Please try again after the load shedding.", kind: "error" },
  },
  { title: "Add or Remove Programs", icon: AddRemoveIcon, open: "programs" },
  {
    title: "Sounds, Speech, and Audio Devices",
    icon: SoundsIcon,
    open: { title: "Sounds and Audio Devices", text: "This feature has been disabled by your administrator.", kind: "warning" },
  },
  {
    title: "Performance and Maintenance",
    icon: PerformanceIcon,
    open: { title: "Disk Defragmenter", text: "Local Disk (D:) is 87% fragmented. Defragmenting it will take about 4 hours.", kind: "info" },
  },
  {
    title: "Printers and Other Hardware",
    icon: PrinterIcon,
    open: { title: "Printers and Faxes", text: "No printers are installed. Take it to the cyber café.", kind: "info" },
  },
  {
    title: "User Accounts",
    icon: UserAccountsIcon,
    open: { title: "User Accounts", text: "Dhaiwat — Computer administrator. Password protected: no.", kind: "info" },
  },
  {
    title: "Date, Time, Language, and Regional Options",
    icon: RegionalIcon,
    open: { title: "Regional and Language Options", text: "Location: India. Time zone: (GMT+05:30) Chennai, Kolkata, Mumbai, New Delhi.", kind: "info" },
  },
  {
    title: "Accessibility Options",
    icon: AccessibilityIcon,
    open: { title: "Accessibility Options", text: "This feature has been disabled by your administrator.", kind: "warning" },
  },
  {
    title: "Security Center",
    icon: SecurityCenterIcon,
    open: { title: "Windows Security Center", text: "Your computer might be at risk. Antivirus software might not be installed.", kind: "warning" },
  },
];

// Sizes as Add or Remove Programs reported them.
const SIZES: Record<string, string> = {
  winamp: "9.84MB",
  vlc: "61.20MB",
  cricket: "1,433.60MB",
  firefox: "24.51MB",
  utorrent: "0.29MB",
  nero: "418.00MB",
  vicecity: "1,520.00MB",
  sanandreas: "3,960.00MB",
  fifa: "2,120.00MB",
  cs: "644.00MB",
  lara: "1,780.00MB",
  aoe: "2,240.00MB",
  rct: "1,010.00MB",
};

function Programs({ onMsg }: { onMsg: (m: Msg) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const installed = APP_IDS.filter((id) => SIZES[id]);
  return (
    <div className="xp-cp-programs">
      <p className="xp-cp-heading">Currently installed programs:</p>
      <div className="xp-cp-list">
        {installed.map((id) => {
          const def: AppDef = APPS[id];
          const on = selected === id;
          return (
            <div key={id} className={`xp-cp-prog${on ? " xp-cp-prog-on" : ""}`} onClick={() => setSelected(id)}>
              <def.icon size={16} />
              <span className="xp-cp-prog-name">{def.title}</span>
              <span>Size {SIZES[id]}</span>
              {on ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMsg({ title: def.title, text: "Setup cannot continue. Please insert the original installation CD-ROM.", kind: "error" });
                  }}
                >
                  Change/Remove
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type Tab = "Desktop" | "Screen Saver" | "Settings";

function DisplayProperties({ onDone }: { onDone: () => void }) {
  const { settings, update, showSaver } = useXpSettings();
  const [draft, setDraft] = useState<Settings>(settings);
  const [tab, setTab] = useState<Tab>("Desktop");
  const set = (patch: Partial<Settings>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <div className="window xp-display">
      <div className="title-bar">
        <div className="title-bar-text">Display Properties</div>
        <div className="title-bar-controls">
          <button type="button" aria-label="Close" onClick={onDone} />
        </div>
      </div>
      <div className="window-body">
        <menu role="tablist">
          {(["Desktop", "Screen Saver", "Settings"] as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </menu>
        <article className="xp-display-panel" role="tabpanel">
          <div>
            <div className="xp-display-monitor">
              <div
                className="xp-display-glass"
                style={{
                  background: tab === "Screen Saver" && draft.screensaver !== "none" ? "#000" : wallpaperBackground(draft.wallpaper),
                }}
              >
                {tab === "Screen Saver" && draft.screensaver !== "none" ? (
                  <span>{SCREENSAVERS.find((s) => s.id === draft.screensaver)?.label}</span>
                ) : null}
              </div>
            </div>
            {tab === "Desktop" ? (
              <>
                <label htmlFor="xp-bg">Background:</label>
                <select id="xp-bg" size={4} value={draft.wallpaper} onChange={(e) => set({ wallpaper: e.target.value })}>
                  {WALLPAPERS.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            {tab === "Screen Saver" ? (
              <div className="xp-display-row">
                <select value={draft.screensaver} onChange={(e) => set({ screensaver: e.target.value as Settings["screensaver"] })}>
                  {SCREENSAVERS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button type="button" disabled={draft.screensaver === "none"} onClick={() => showSaver(draft.screensaver)}>
                  Preview
                </button>
                <label>
                  Wait:{" "}
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={draft.wait}
                    onChange={(e) => set({ wait: Math.min(30, Math.max(1, Number(e.target.value) || 1)) })}
                  />{" "}
                  minutes
                </label>
                {draft.screensaver === "marquee" ? (
                  <label className="xp-display-wide">
                    Text:{" "}
                    <input type="text" maxLength={60} value={draft.marquee} onChange={(e) => set({ marquee: e.target.value })} />
                  </label>
                ) : null}
              </div>
            ) : null}
            {tab === "Settings" ? (
              <div className="xp-display-row">
                <span>Screen resolution: 640 by 480 pixels</span>
                <span>Color quality: Highest (32 bit)</span>
              </div>
            ) : null}
          </div>
        </article>
        <div className="xp-display-buttons">
          <button
            type="button"
            onClick={() => {
              update(draft);
              onDone();
            }}
          >
            OK
          </button>
          <button type="button" onClick={onDone}>
            Cancel
          </button>
          <button type="button" onClick={() => update(draft)}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

export function ControlPanel() {
  const [view, setView] = useState<"home" | "programs">("home");
  const [display, setDisplay] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  const pick = (c: Category) => {
    if (c.open === "display") setDisplay(true);
    else if (c.open === "programs") setView("programs");
    else setMsg(c.open);
  };

  return (
    <div className="xp-app xp-explorer">
      <div className="xp-menubar">
        {["File", "Edit", "View", "Favorites", "Tools", "Help"].map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <div className="xp-addressbar">
        <span>Address</span>
        <div className="xp-address">{view === "home" ? "Control Panel" : "Add or Remove Programs"}</div>
      </div>
      <div className="xp-explorer-body">
        <div className="xp-fs-side">
          <section>
            <h4>Control Panel</h4>
            <p onClick={() => setView("home")}>{view === "home" ? "Switch to Classic View" : "Back to categories"}</p>
          </section>
          <section>
            <h4>See Also</h4>
            <p>Windows Update</p>
            <p>Help and Support</p>
          </section>
        </div>
        <div className="xp-cp-main">
          {view === "home" ? (
            <>
              <p className="xp-cp-title">Pick a category</p>
              <div className="xp-cp-grid">
                {CATEGORIES.map((c) => (
                  <button key={c.title} type="button" className="xp-cp-cat" onClick={() => pick(c)}>
                    <c.icon size={32} />
                    <span>{c.title}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <Programs onMsg={setMsg} />
          )}
        </div>
      </div>
      {display ? (
        <div className="xp-msg-backdrop">
          <DisplayProperties onDone={() => setDisplay(false)} />
        </div>
      ) : null}
      {msg ? <MsgBox msg={msg} onClose={() => setMsg(null)} /> : null}
    </div>
  );
}
