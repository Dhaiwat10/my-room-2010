// Everything the site says, in one place. The classic page and the XP apps
// both read from here.

export type Link = { title: string; href: string };
export type Job = { name: string; time: string; href?: string };
export type Clip = { title: string; src: string; caption: string };
export type WallItem = {
  id: string;
  kind: "poster" | "photo";
  // Path under /public, e.g. "/pc/room/wall/goa.jpg". Empty shows a placeholder.
  src: string;
  title: string;
};

export const NAME = "Dhaiwat Pandya";

export const BLURB = [
  "Engineer.",
  "Wrote code professionally by hand for 7 years before AI.",
  "Spent ~5000 hours of my life playing Counter Strike.",
];

export const LATELY: Link[] = [
  {
    title: "Ported Cricket 07 to the browser and added online multiplayer",
    href: "https://x.com/dhaiwat/status/2111810303109550460?s=20",
  },
  {
    title: "Created an open-source version of Instinct running on private verifiable inference",
    href: "https://x.com/dhaiwat/status/2110958336263008278?s=20",
  },
  {
    title: "Built a mute feature for Twitter that actually works, using Jev",
    href: "https://github.com/Dhaiwat10/smart-mute",
  },
];

export const JOBS: Job[] = [
  { name: "ENS Labs", time: "2026", href: "https://ens.domains" },
  { name: "Fuel Labs", time: "2022 – 2025", href: "https://fuel.network" },
  { name: "Ankr", time: "2022", href: "https://ankr.com" },
  { name: "Mazury Labs", time: "2021 – 2022" },
  { name: "Gitcoin DAO", time: "2021", href: "https://gitcoin.co" },
  { name: "Creativice", time: "2021" },
  { name: "Open Consulting Group", time: "2019 – 2020" },
  { name: "Freelance", time: "2018 – 2021" },
];

export const SOCIALS: Link[] = [
  { title: "Github", href: "https://github.com/Dhaiwat10" },
  { title: "Twitter", href: "https://twitter.com/dhaiwat" },
  { title: "Email", href: "mailto:dhaiwatpandya@gmail.com" },
];

export const CLIPS: Clip[] = [{ title: "vroom.mp4", src: "/pc/vroom.mp4", caption: "Me driving a Formula 3000 car" }];

// Winamp's playlist. Drop the audio files in /public/music and list them here.
export type Song = { title: string; artist: string; src: string };
export const SONGS: Song[] = [
  { title: "Beautiful", artist: "Akon", src: "/pc/music/akon-beautiful.mp3" },
  { title: "Wavin' Flag (Coca-Cola Celebration Mix)", artist: "K'naan", src: "/pc/music/knaan-wavin-flag.mp3" },
  { title: "Chiggy Wiggy", artist: "Kylie Minogue & Sonu Nigam", src: "/pc/music/chiggy-wiggy.mp3" },
  { title: "Tu Jaane Na", artist: "Atif Aslam", src: "/pc/music/tu-jaane-na.mp3" },
  { title: "Manchala", artist: "Shafqat Amanat Ali & Neeti Mohan", src: "/pc/music/manchala.mp3" },
  { title: "Gujarati Amplifier", artist: "DJ Adee & RJ Roshan", src: "/pc/music/gujarati-amplifier.mp3" },
];

// The Cricket 07 build you host. Empty shows a "coming soon" screen.
// It is a same-site origin, so a visitor who already downloaded the game
// there has it here too: browsers key storage by (origin, top-level site).
export const CRICKET_URL = "https://cricket07.dhaiwat.com/?embed=1";

// Drop images into /public/room/wall and point these at them.
export const WALL: WallItem[] = [
  { id: "poster-1", kind: "poster", src: "", title: "Poster" },
  { id: "poster-2", kind: "poster", src: "", title: "Poster" },
  { id: "photo-1", kind: "photo", src: "/pc/room/wall/photo-1.jpg", title: "Yas Marina, car 24" },
  { id: "photo-2", kind: "photo", src: "/pc/room/wall/photo-2.jpg", title: "Photo Booth" },
  { id: "photo-3", kind: "photo", src: "/pc/room/wall/photo-3.jpg", title: "Elevator mirror" },
  { id: "photo-4", kind: "photo", src: "/pc/room/wall/photo-4.jpg", title: "Old print" },
];

export const POSTERS = WALL.filter((w) => w.kind === "poster");
// The gallery shows real pictures; placeholders only while there are none.
export const PICTURES = WALL.some((w) => w.src) ? WALL.filter((w) => w.src) : WALL;
