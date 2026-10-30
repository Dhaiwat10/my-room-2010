import type { ComponentType } from "react";
import { CLIPS, PICTURES, SONGS } from "../../content";
import { APP_IDS, APPS, type AppDef, type AppId } from "./apps";
import type { Msg } from "./apps/msgbox";
import {
  CdDriveIcon,
  ComputerIcon,
  FloppyIcon,
  FolderIcon,
  HardDiskIcon,
  MyDocumentsIcon,
  MyMusicIcon,
  MyVideosIcon,
  NotepadIcon,
  PicturesIcon,
} from "./icons";
import type { SoundName } from "./sounds";
import { currentDisc, DISCS } from "../../disc";

// The machine's disks, as My Computer browses them. Program Files is built
// from the desktop shortcuts' targets, so every game and app has a real
// folder and exe that launches it.

type Icon = ComponentType<{ size?: number }>;

export type FsNode = {
  name: string;
  kind: "folder" | "drive" | "file";
  icon?: Icon;
  note?: string; // the grey line under a tile ("Local Disk", "MP3 Format Sound")
  size?: string;
  children?: FsNode[];
  open?: AppId;
  sound?: SoundName;
  msg?: Msg; // what double-clicking it says
  group?: string; // My Computer's headings
};

const folder = (name: string, children: FsNode[], extra: Partial<FsNode> = {}): FsNode => ({
  name,
  kind: "folder",
  children,
  note: "File Folder",
  ...extra,
});

const file = (name: string, extra: Partial<FsNode> = {}): FsNode => ({ name, kind: "file", ...extra });

const cantOpen = (name: string, why: string): Msg => ({ title: name, text: why, kind: "error" });

const MEDIA_PLAYER = (name: string) =>
  cantOpen("Windows Media Player", `Windows Media Player cannot play the file "${name}". The codec is missing.`);

function programFiles(): FsNode[] {
  // Merge every shortcut's "C:\Program Files\A\B\x.exe" into one tree.
  const root: FsNode[] = [];
  for (const id of APP_IDS) {
    const def: AppDef = APPS[id];
    const target = def.target;
    if (!target?.startsWith("C:\\Program Files\\")) continue;
    const parts = target.slice("C:\\Program Files\\".length).split("\\");
    let level = root;
    for (const dir of parts.slice(0, -1)) {
      let next = level.find((n) => n.name === dir && n.kind === "folder");
      if (!next) {
        next = folder(dir, []);
        level.push(next);
      }
      level = next.children!;
    }
    level.push(file(parts.at(-1)!, { icon: def.icon, open: id, note: "Application" }));
  }
  root.push(
    folder("Internet Explorer", [
      file("iexplore.exe", {
        note: "Application",
        msg: { title: "Internet Explorer", text: "Nobody uses Internet Explorer. Try Mozilla Firefox.", kind: "info" },
      }),
    ]),
    folder("Messenger", [
      file("msmsgs.exe", { note: "Application", msg: cantOpen("Windows Messenger", "You are not signed in. Please connect to the Internet and try again.") }),
    ]),
    folder("Windows Media Player", [file("wmplayer.exe", { note: "Application", msg: MEDIA_PLAYER("wmplayer.exe") })]),
  );
  return root.toSorted((a, b) => a.name.localeCompare(b.name));
}

const PICTURE_FILES = PICTURES.filter((p) => p.src).map((p, i) =>
  file(`${p.title}.jpg`, { open: "pictures", note: "JPEG Image", size: `${180 + i * 37} KB` }),
);
const SONG_FILES = SONGS.map((s) =>
  file(`${s.artist} - ${s.title}.mp3`, { open: "winamp", note: "MP3 Format Sound", size: "4,820 KB" }),
);
const CLIP_FILES = CLIPS.map((c) => file(c.title, { open: "vlc", note: "MPEG-4 Movie", size: "4,210 KB" }));

const NOT_READY = (drive: string): Msg => ({
  title: "Windows - No Disk",
  text: `${drive} is not accessible.\n\nThe device is not ready.`,
  kind: "error",
});

let tree: FsNode | null = null;

// Built on first use: it reads APPS, which isn't ready while modules load.
export function myComputer(): FsNode {
  if (tree) {
    // cached, but F: follows whatever disc is in the drive
    tree.children = tree.children!.map((n) => (n.name.endsWith("(F:)") ? cdDrive() : n));
    return tree;
  }
  const myDocuments = folder(
    "Dhaiwat's Documents",
    [
      folder("My Pictures", PICTURE_FILES, { open: "pictures", icon: PicturesIcon }),
      folder("My Music", SONG_FILES, { icon: MyMusicIcon }),
      folder("My Videos", CLIP_FILES, { icon: MyVideosIcon }),
      file("resume_final_FINAL.doc", {
        note: "Microsoft Word Document",
        size: "48 KB",
        msg: cantOpen("resume_final_FINAL.doc", "Windows cannot open this file. Microsoft Word is not installed (the trial expired in 2006)."),
      }),
      file("Copy of resume_final_FINAL (2).doc", {
        note: "Microsoft Word Document",
        size: "48 KB",
        msg: cantOpen("Copy of resume_final_FINAL (2).doc", "Windows cannot open this file. Microsoft Word is not installed."),
      }),
    ],
    { group: "Files Stored on This Computer", note: "File Folder", icon: MyDocumentsIcon },
  );
  tree = folder("My Computer", [
    folder(
      "Shared Documents",
      [
        folder("Shared Music", [
          folder("Sample Music", [
            file("Beethoven's Symphony No. 9 (Scherzo).wma", { note: "Windows Media Audio file", msg: MEDIA_PLAYER("Beethoven's Symphony No. 9 (Scherzo).wma") }),
            file("New Stories (Highway Blues).wma", { note: "Windows Media Audio file", msg: MEDIA_PLAYER("New Stories (Highway Blues).wma") }),
          ]),
        ]),
        folder("Shared Pictures", [
          folder(
            "Sample Pictures",
            ["Blue hills", "Sunset", "Water lilies", "Winter"].map((n) =>
              file(`${n}.jpg`, { note: "JPEG Image", msg: cantOpen(`${n}.jpg`, "Windows Picture and Fax Viewer: drawing failed.") }),
            ),
          ),
        ]),
      ],
      { group: "Files Stored on This Computer", icon: MyDocumentsIcon },
    ),
    myDocuments,
    folder(
      "Local Disk (C:)",
      [
        folder("Documents and Settings", [
          folder("All Users", []),
          folder("Dhaiwat", [myDocuments, folder("Desktop", []), folder("Favorites", [])]),
        ]),
        folder("Program Files", programFiles()),
        folder("WINDOWS", [
          folder("Fonts", []),
          folder("Media", [
            file("Windows XP Startup.wav", { sound: "startup", note: "Wave Sound", size: "424 KB" }),
            file("Windows XP Start.wav", { sound: "click", note: "Wave Sound", size: "3 KB" }),
            file("Windows XP Critical Stop.wav", { sound: "criticalStop", note: "Wave Sound", size: "39 KB" }),
            file("Windows XP Exclamation.wav", { sound: "exclamation", note: "Wave Sound", size: "42 KB" }),
            file("Windows XP Ding.wav", { sound: "ding", note: "Wave Sound", size: "17 KB" }),
            file("Windows XP Recycle.wav", { sound: "recycle", note: "Wave Sound", size: "23 KB" }),
          ]),
          folder("system32", [
            file("mspaint.exe", { open: "paint", icon: APPS.paint.icon, note: "Application" }),
            file("notepad.exe", { icon: NotepadIcon, note: "Application" }),
            file("calc.exe", { note: "Application", msg: cantOpen("calc.exe", "calc.exe is not a valid Win32 application.") }),
          ]),
        ]),
        file("boot.ini", { note: "Configuration Settings", size: "1 KB", msg: { title: "boot.ini", text: "Better not touch that.", kind: "warning" } }),
      ],
      { kind: "drive", icon: HardDiskIcon, note: "Local Disk", group: "Hard Disk Drives" },
    ),
    folder(
      "Local Disk (D:)",
      [
        folder("songs", SONG_FILES),
        folder("movies", CLIP_FILES),
        folder("photos", PICTURE_FILES, { open: "pictures" }),
        folder("Setups", [
          file("Nero-6.6.1.4_Ultra_Edition.exe", { open: "nero", note: "Application", size: "93,402 KB" }),
          file("winamp5_full.exe", { open: "winamp", note: "Application", size: "6,014 KB" }),
          file("Firefox Setup 3.6.exe", { open: "firefox", note: "Application", size: "7,688 KB" }),
          file("uTorrent.exe", { open: "utorrent", note: "Application", size: "289 KB" }),
        ]),
        folder("college", [
          folder("DS lab", [
            file("linked_list.c", { note: "C Source", size: "2 KB", msg: cantOpen("linked_list.c", "Turbo C++ is not installed on this computer.") }),
            file("stack_using_array.c", { note: "C Source", size: "1 KB", msg: cantOpen("stack_using_array.c", "Turbo C++ is not installed on this computer.") }),
          ]),
          file("project report final.doc", { note: "Microsoft Word Document", size: "1,240 KB", msg: cantOpen("project report final.doc", "Microsoft Word is not installed.") }),
        ]),
      ],
      { kind: "drive", icon: HardDiskIcon, note: "Local Disk", group: "Hard Disk Drives" },
    ),
    folder("3½ Floppy (A:)", [], {
      kind: "drive",
      icon: FloppyIcon,
      note: "3½-Inch Floppy Disk",
      group: "Devices with Removable Storage",
      msg: NOT_READY("A:\\"),
    }),
    cdDrive(),
  ], { icon: ComputerIcon });
  return tree;
}

// F: shows whatever disc is in the tower's drive (see disc.ts)
function cdDrive(): FsNode {
  const disc = currentDisc();
  if (!disc) {
    return folder("CD Drive (F:)", [], {
      kind: "drive",
      icon: CdDriveIcon,
      note: "CD Drive",
      group: "Devices with Removable Storage",
      msg: { title: "Insert Disk", text: "Please insert a disk into drive F:.", kind: "warning" },
    });
  }
  const { label, game } = DISCS[disc];
  const icon = APPS[game].icon;
  const files =
    disc === "cricket07"
      ? [
          folder("Data", [], { msg: cantOpen("Data", "Access is denied.") }),
          folder("DirectX", [], {}),
          file("autorun.inf", { note: "Setup Information", size: "1 KB", msg: { title: "autorun.inf", text: "Better not touch that.", kind: "warning" } }),
          file("autorun.exe", { icon, note: "Application", size: "1,812 KB", open: game }),
          file("Cricket07.ico", { note: "Icon", size: "25 KB" }),
          file("readme.txt", { note: "Text Document", size: "18 KB", msg: cantOpen("readme.txt", "Nobody has ever read this file.") }),
        ]
      : [
          folder("Data", [], { msg: cantOpen("Data", "Access is denied.") }),
          folder("DirectX", [], {}),
          folder("Support", [], {}),
          file("autorun.inf", { note: "Setup Information", size: "1 KB", msg: { title: "autorun.inf", text: "Better not touch that.", kind: "warning" } }),
          file("AutoRun.exe", { icon, note: "Application", size: "1,204 KB", open: game }),
          file("Setup.exe", { icon, note: "Application", size: "468 KB", open: game }),
          file("Readme.txt", { note: "Text Document", size: "24 KB", msg: cantOpen("Readme.txt", "Nobody has ever read this file.") }),
        ];
  return folder(`${label} (F:)`, files, { kind: "drive", icon, note: "CD Drive", group: "Devices with Removable Storage" });
}

export function iconFor(node: FsNode): Icon | null {
  if (node.icon) return node.icon;
  if (node.kind !== "file") return FolderIcon;
  return null;
}
