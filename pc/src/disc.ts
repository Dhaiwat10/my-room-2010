// What's in the DVD drive. The room owns the drive (you open the tray and swap discs on the
// tower) and tells the PC with a "disc" message; the PC only reads it. Cricket 07 starts in
// the drive, like it always was.

export type DiscId = "cricket07" | "sanandreas" | "vicecity" | "lara" | "aoe";

// label: the disc's volume name in My Computer; game: the desktop shortcut it belongs to.
// Cricket 07 really runs; the others only get as far as their AutoRun menu.
export const DISCS: Record<DiscId, { label: string; game: "cricket" | "sanandreas" | "vicecity" | "lara" | "aoe"; title: string }> = {
  cricket07: { label: "CRICKET07", game: "cricket", title: "EA SPORTS Cricket 07" },
  sanandreas: { label: "GTA_SA", game: "sanandreas", title: "Grand Theft Auto: San Andreas" },
  vicecity: { label: "GTA_VC", game: "vicecity", title: "Grand Theft Auto: Vice City" },
  lara: { label: "BLIC2005", game: "lara", title: "Brian Lara International Cricket 2005" },
  aoe: { label: "AOE3_DISC1", game: "aoe", title: "Age of Empires III" },
};

// the label art, shared with the room (it's the texture on the disc itself)
export const discArt = (d: DiscId) => `/assets/disc_${d}.jpg`;

let disc: DiscId | null = "cricket07";
const listeners = new Set<(d: DiscId | null, prev: DiscId | null) => void>();

export const currentDisc = () => disc;

export function onDisc(fn: (d: DiscId | null, prev: DiscId | null) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

addEventListener("message", (e: MessageEvent) => {
  if (e.data?.type !== "disc") return;
  const next = (e.data.disc as DiscId | null) ?? null;
  if (next === disc) return;
  const prev = disc;
  disc = next;
  listeners.forEach((fn) => fn(next, prev));
});
