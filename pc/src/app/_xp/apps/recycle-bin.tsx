"use client";

import { useState, type ComponentType } from "react";
import {
  ArchiveFileIcon,
  CodeFileIcon,
  ExeIcon,
  ImageFileIcon,
  MusicFileIcon,
  TextFileIcon,
  RecycleBinEmptyIcon,
  UnknownFileIcon,
  WebFileIcon,
  WordFileIcon,
} from "../icons";
import { useXpSettings } from "../settings";
import { playSound } from "../sounds";
import { MsgBox, type Msg } from "./msgbox";

type Deleted = { name: string; from: string; when: string; size: string; icon: ComponentType<{ size?: number }> };

const DOCS = "C:\\Documents and Settings\\Dhaiwat\\My Documents";

const ITEMS: Deleted[] = [
  { name: "Copy of Copy of resume_final_FINAL (2).doc", from: DOCS, when: "14/03/2007 11:52 PM", size: "48 KB", icon: WordFileIcon },
  { name: "New Folder.exe", from: "E:\\", when: "02/08/2006 4:15 PM", size: "88 KB", icon: ExeIcon },
  { name: "autorun.inf", from: "E:\\", when: "02/08/2006 4:15 PM", size: "1 KB", icon: UnknownFileIcon },
  { name: "Crazy Frog - Axel F.mp3", from: "D:\\songs", when: "21/11/2005 7:03 PM", size: "2,904 KB", icon: MusicFileIcon },
  { name: "linked_list_copied_from_rahul.c", from: "D:\\college\\DS lab", when: "09/09/2006 1:47 AM", size: "2 KB", icon: CodeFileIcon },
  { name: "bunk plan.txt", from: DOCS, when: "18/01/2007 8:20 AM", size: "1 KB", icon: TextFileIcon },
  { name: "orkut scrapbook backup.html", from: DOCS, when: "30/06/2008 10:11 PM", size: "212 KB", icon: WebFileIcon },
  { name: "sachin_100_wallpaper_1024x768.jpg", from: "D:\\photos", when: "13/03/2004 6:30 PM", size: "164 KB", icon: ImageFileIcon },
  { name: "IGI 2 savegame (mission 14).zip", from: "D:\\Setups", when: "05/05/2006 3:33 AM", size: "640 KB", icon: ArchiveFileIcon },
  { name: "Thumbs.db", from: "D:\\photos", when: "13/03/2004 6:30 PM", size: "18 KB", icon: UnknownFileIcon },
];

export function RecycleBin() {
  const { binEmpty, emptyBin } = useXpSettings();
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const items = binEmpty ? [] : ITEMS;

  const askEmpty = () =>
    setMsg({
      title: "Confirm Multiple File Delete",
      text: `Are you sure you want to delete these ${items.length} items?`,
      kind: "question",
      buttons: ["Yes", "No"],
      onButton: (b) => {
        if (b !== "Yes") return;
        playSound("recycle");
        emptyBin();
      },
    });

  return (
    <div className="xp-app xp-explorer">
      <div className="xp-menubar">
        {["File", "Edit", "View", "Favorites", "Tools", "Help"].map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <div className="xp-addressbar">
        <span>Address</span>
        <div className="xp-address">
          <RecycleBinEmptyIcon size={14} />
          Recycle Bin
        </div>
      </div>
      <div className="xp-explorer-body">
        <div className="xp-fs-side">
          <section>
            <h4>Recycle Bin Tasks</h4>
            <p className={items.length ? undefined : "xp-fs-off"} onClick={() => items.length && askEmpty()}>
              Empty the Recycle Bin
            </p>
            <p
              className={items.length ? undefined : "xp-fs-off"}
              onClick={() =>
                items.length &&
                setMsg({ title: "Restore", text: "Some things are better left deleted.", kind: "warning" })
              }
            >
              Restore all items
            </p>
          </section>
        </div>
        <div className="sunken-panel xp-explorer-list">
          <table className="interactive">
            <thead>
              <tr>
                <th>Name</th>
                <th>Original Location</th>
                <th>Date Deleted</th>
                <th>Size</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr
                  key={it.name}
                  className={selected === it.name ? "highlighted" : undefined}
                  onClick={() => setSelected(it.name)}
                  onDoubleClick={() =>
                    setMsg({ title: it.name, text: "Files in the Recycle Bin can't be opened. Restore it first.", kind: "error" })
                  }
                >
                  <td>
                    <span className="xp-cell-name">
                      <it.icon size={14} /> {it.name}
                    </span>
                  </td>
                  <td>{it.from}</td>
                  <td>{it.when}</td>
                  <td>{it.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="status-bar">
        <p className="status-bar-field">{items.length} objects</p>
        <p className="status-bar-field">{binEmpty ? "0 bytes" : "4.06 MB"}</p>
      </div>
      {msg ? <MsgBox msg={msg} onClose={() => setMsg(null)} /> : null}
    </div>
  );
}
