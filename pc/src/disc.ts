// What's in the DVD drive. The room owns the drive (you open the tray and swap discs on the
// tower) and tells the PC with a "disc" message; the PC only reads it. Cricket 07 starts in
// the drive, like it always was.

export type DiscId = "cricket07";

export const DISCS: Record<DiscId, { label: string; app: "cricket" }> = {
  cricket07: { label: "CRICKET07", app: "cricket" },
};

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
