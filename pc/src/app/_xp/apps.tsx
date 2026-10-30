import type { ComponentType } from "react";
import { ControlPanel } from "./apps/control-panel";
import { Cricket } from "./apps/cricket";
import { AutoRun } from "./apps/autorun";
import { Firefox } from "./apps/firefox";
import { MovieMaker } from "./apps/movie-maker";
import { MyComputer } from "./apps/my-computer";
import { Nero } from "./apps/nero";
import { Paint } from "./apps/paint";
import { cdError } from "./apps/game";
import { Pictures } from "./apps/pictures";
import { RecycleBin } from "./apps/recycle-bin";
import { UTorrent } from "./apps/utorrent";
import { Vlc } from "./apps/vlc";
import { Winamp } from "./apps/winamp";
import {
  AgeOfEmpiresIcon,
  BrianLaraIcon,
  ComputerIcon,
  CdDriveIcon,
  ControlPanelIcon,
  CounterStrikeIcon,
  CricketIcon,
  FifaIcon,
  FirefoxIcon,
  MovieMakerIcon,
  NeroIcon,
  PaintIcon,
  PicturesIcon,
  RecycleBinIcon,
  RollerCoasterIcon,
  SanAndreasIcon,
  UTorrentIcon,
  ViceCityIcon,
  VlcIcon,
  WinampIcon,
} from "./icons";

export type AppDef = {
  label: string;
  title: string;
  icon: ComponentType<{ size?: number }>;
  size: { w: number; h: number };
  // Open filling most of the desktop instead of at `size`.
  big?: boolean;
  // Open maximized, like a game taking the screen.
  maximized?: boolean;
  // Draws its own windows (Winamp): no XP frame around it.
  skinned?: boolean;
  // A desktop shortcut to this exe.
  target?: string;
  // Not really installed; kept out of the Start menu.
  game?: boolean;
  // Left out of the Start menu's program list, or off the desktop.
  menu?: false;
  desktop?: false;
  component: ComponentType;
};

export const APPS = {
  mycomputer: { label: "My Computer", title: "My Computer", icon: ComputerIcon, size: { w: 600, h: 420 }, big: true, menu: false, component: MyComputer },
  vlc: { label: "VLC media player", title: "vroom.mp4 - VLC media player", icon: VlcIcon, size: { w: 560, h: 420 }, big: true, component: Vlc },
  pictures: { label: "My Pictures", title: "My Pictures", icon: PicturesIcon, size: { w: 540, h: 400 }, big: true, component: Pictures },
  paint: {
    label: "Paint",
    title: "untitled - Paint",
    icon: PaintIcon,
    size: { w: 600, h: 440 },
    big: true,
    target: "C:\\WINDOWS\\system32\\mspaint.exe",
    component: Paint,
  },
  moviemaker: {
    label: "Windows Movie Maker",
    title: "Untitled - Windows Movie Maker",
    icon: MovieMakerIcon,
    size: { w: 620, h: 440 },
    maximized: true,
    target: "C:\\Program Files\\Movie Maker\\moviemk.exe",
    component: MovieMaker,
  },
  winamp: { label: "Winamp", title: "Winamp", icon: WinampIcon, size: { w: 275, h: 348 }, skinned: true, component: Winamp },
  cricket: { label: "Cricket 07", title: "EA SPORTS Cricket 07", icon: CricketIcon, size: { w: 660, h: 520 }, maximized: true, component: Cricket },
  firefox: {
    label: "Mozilla Firefox",
    title: "Mozilla Firefox Start Page - Mozilla Firefox",
    icon: FirefoxIcon,
    size: { w: 600, h: 440 },
    big: true,
    target: "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
    component: Firefox,
  },
  utorrent: {
    label: "µTorrent",
    title: "µTorrent 2.0",
    icon: UTorrentIcon,
    size: { w: 600, h: 400 },
    big: true,
    target: "C:\\Program Files\\uTorrent\\uTorrent.exe",
    component: UTorrent,
  },
  nero: {
    label: "Nero Burning ROM",
    title: "Nero Burning ROM - MP3 CD for the car",
    icon: NeroIcon,
    size: { w: 600, h: 420 },
    big: true,
    target: "C:\\Program Files\\Ahead\\Nero\\nero.exe",
    component: Nero,
  },
  vicecity: game("GTA Vice City", "Grand Theft Auto: Vice City", ViceCityIcon, "vicecity", "C:\\Program Files\\Rockstar Games\\Grand Theft Auto Vice City\\gta-vc.exe"),
  sanandreas: game("GTA San Andreas", "GTA: San Andreas", SanAndreasIcon, "sanandreas", "C:\\Program Files\\Rockstar Games\\GTA San Andreas\\gta_sa.exe"),
  fifa: game("FIFA 2005", "FIFA Football 2005", FifaIcon, "fifa", "C:\\Program Files\\EA SPORTS\\FIFA Football 2005\\fifa2005.exe"),
  cs: game("Counter-Strike", "Counter-Strike", CounterStrikeIcon, "cs", "C:\\Program Files\\Valve\\Counter-Strike 1.6\\hl.exe"),
  lara: game("Brian Lara Cricket 2005", "Brian Lara International Cricket 2005", BrianLaraIcon, "lara", "C:\\Program Files\\Codemasters\\Brian Lara International Cricket 2005\\BLIC2005.exe"),
  aoe: game("Age of Empires III", "Age of Empires III", AgeOfEmpiresIcon, "aoe", "C:\\Program Files\\Microsoft Games\\Age of Empires III\\age3.exe"),
  rct: game("RollerCoaster Tycoon 3", "RollerCoaster Tycoon 3", RollerCoasterIcon, "rct", "C:\\Program Files\\Atari\\RollerCoaster Tycoon 3\\RCT3.exe"),
  autorun: { label: "AutoPlay", title: "AutoRun", icon: CdDriveIcon, size: { w: 460, h: 290 }, menu: false, desktop: false, component: AutoRun },
  recycle: { label: "Recycle Bin", title: "Recycle Bin", icon: RecycleBinIcon, size: { w: 600, h: 380 }, big: true, menu: false, component: RecycleBin },
  controlpanel: {
    label: "Control Panel",
    title: "Control Panel",
    icon: ControlPanelIcon,
    size: { w: 600, h: 420 },
    big: true,
    menu: false,
    desktop: false,
    component: ControlPanel,
  },
} satisfies Record<string, AppDef>;

function game(label: string, title: string, icon: AppDef["icon"], id: string, target: string): AppDef {
  return { label, title, icon, size: { w: 380, h: 140 }, target, game: true, component: cdError(id as AppId) };
}

export type AppId = keyof typeof APPS;
export const APP_IDS = Object.keys(APPS) as AppId[];
export const MENU_IDS = APP_IDS.filter((id) => {
  const def: AppDef = APPS[id];
  return !def.game && def.menu !== false;
});
export const DESKTOP_IDS = APP_IDS.filter((id) => (APPS[id] as AppDef).desktop !== false);
