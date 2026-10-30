"use client";

import { createElement, useState, type ComponentType } from "react";
import { myComputer, iconFor, type FsNode } from "../filesystem";
import {
  BackIcon,
  CodeFileIcon,
  ComputerIcon,
  ExeIcon,
  ImageFileIcon,
  MusicFileIcon,
  SoundFileIcon,
  TextFileIcon,
  UnknownFileIcon,
  UpIcon,
  VideoFileIcon,
  WordFileIcon,
} from "../icons";
import { playSound } from "../sounds";
import { useWm } from "../window-manager";
import { MsgBox, type Msg } from "./msgbox";

// Explorer browsing My Computer: drives grouped the way XP grouped them,
// tiles with a grey type line, Back and Up, and the blue task pane.

const BY_EXT: Record<string, ComponentType<{ size?: number }>> = {
  mp3: MusicFileIcon,
  wma: MusicFileIcon,
  wav: SoundFileIcon,
  mp4: VideoFileIcon,
  jpg: ImageFileIcon,
  doc: WordFileIcon,
  c: CodeFileIcon,
  exe: ExeIcon,
  txt: TextFileIcon,
};

function NodeIcon({ node, size = 32 }: { node: FsNode; size?: number }) {
  // Picks one of the existing icon components; nothing is created here.
  const icon = iconFor(node) ?? BY_EXT[node.name.split(".").pop()!.toLowerCase()] ?? UnknownFileIcon;
  return createElement(icon, { size });
}

// "C:\Program Files\Valve" for a path through a drive, else the folder names.
function address(path: FsNode[]) {
  if (path.length === 1) return "My Computer";
  const drive = path[1].name.match(/\(([A-Z]):\)/);
  if (!drive) return path.slice(1).map((n) => n.name).join("\\");
  return `${drive[1]}:\\${path.slice(2).map((n) => n.name).join("\\")}`;
}

export function MyComputer() {
  const { open: openApp } = useWm();
  const [path, setPath] = useState<FsNode[]>(() => [myComputer()]);
  const [back, setBack] = useState<FsNode[][]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const here = path.at(-1)!;
  const items = here.children ?? [];
  const chosen = items.find((n) => n.name === selected) ?? null;

  const go = (next: FsNode[]) => {
    playSound("click");
    setBack((b) => [...b, path]);
    setPath(next);
    setSelected(null);
  };
  const activate = (node: FsNode) => {
    if (node.msg) return setMsg(node.msg);
    if (node.sound) return playSound(node.sound);
    if (node.kind !== "file" && !(node.open && !node.children?.length)) return go([...path, node]);
    if (node.open) {
      playSound("click");
      openApp(node.open);
    }
  };

  const groups =
    path.length === 1
      ? [...new Set(items.map((n) => n.group ?? ""))].map((g) => ({ title: g, nodes: items.filter((n) => (n.group ?? "") === g) }))
      : [{ title: "", nodes: items }];

  return (
    <div className="xp-app xp-explorer xp-fs">
      <div className="xp-menubar">
        {["File", "Edit", "View", "Favorites", "Tools", "Help"].map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <div className="xp-fs-toolbar">
        <button
          type="button"
          disabled={!back.length}
          onClick={() => {
            playSound("click");
            setPath(back.at(-1)!);
            setBack((b) => b.slice(0, -1));
            setSelected(null);
          }}
        >
          <BackIcon size={22} />
          Back
        </button>
        <button type="button" disabled={path.length < 2} onClick={() => go(path.slice(0, -1))} aria-label="Up">
          <UpIcon size={22} />
        </button>
        <span className="xp-fs-sep" />
        <span className="xp-fs-fake">Search</span>
        <span className="xp-fs-fake">Folders</span>
      </div>
      <div className="xp-addressbar">
        <span>Address</span>
        <div className="xp-address">
          <NodeIcon node={here} size={14} />
          {address(path)}
        </div>
      </div>
      <div className="xp-explorer-body">
        <div className="xp-fs-side">
          <section>
            <h4>System Tasks</h4>
            <p>View system information</p>
            <p onClick={() => openApp("controlpanel")}>Add or remove programs</p>
            <p onClick={() => openApp("controlpanel")}>Change a setting</p>
          </section>
          <section>
            <h4>Other Places</h4>
            <p onClick={() => path.length > 1 && go([path[0]])}>My Computer</p>
            <p>My Network Places</p>
            <p onClick={() => openApp("controlpanel")}>Control Panel</p>
          </section>
          <section>
            <h4>Details</h4>
            <p>
              <b>{(chosen ?? here).name}</b>
              <br />
              {(chosen ?? here).note ?? "System Folder"}
              {chosen?.size ? (
                <>
                  <br />
                  Size: {chosen.size}
                </>
              ) : null}
            </p>
          </section>
        </div>
        <div className="xp-fs-view" onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}>
          {items.length === 0 ? <p className="xp-fs-empty">This folder is empty.</p> : null}
          {groups.map((g) => (
            <div key={g.title} className="xp-fs-group">
              {g.title ? <h5>{g.title}</h5> : null}
              <div className="xp-fs-tiles">
                {g.nodes.map((node) => (
                  <button
                    key={node.name}
                    type="button"
                    className={`xp-fs-tile${selected === node.name ? " xp-fs-tile-on" : ""}`}
                    onClick={() => setSelected(node.name)}
                    onDoubleClick={() => activate(node)}
                    onKeyDown={(e) => e.key === "Enter" && activate(node)}
                  >
                    <NodeIcon node={node} />
                    <span>
                      {node.name}
                      <small>{node.note}</small>
                      {node.size ? <small>{node.size}</small> : null}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="status-bar">
        <p className="status-bar-field">{items.length} objects</p>
        <p className="status-bar-field">
          <ComputerIcon size={14} /> My Computer
        </p>
      </div>
      {msg ? <MsgBox msg={msg} onClose={() => setMsg(null)} /> : null}
    </div>
  );
}
