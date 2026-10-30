// XP's system sounds, from its Windows\Media folder.
const SOUNDS = {
  click: "/pc/xp/sounds/click.wav",
  criticalStop: "/pc/xp/sounds/critical-stop.wav",
  exclamation: "/pc/xp/sounds/exclamation.wav",
  ding: "/pc/xp/sounds/ding.wav",
  recycle: "/pc/xp/sounds/recycle.wav",
  startup: "/pc/xp/sounds/startup.mp3",
} as const;

export type SoundName = keyof typeof SOUNDS;

const cache = new Map<keyof typeof SOUNDS, HTMLAudioElement>();

export function playSound(name: keyof typeof SOUNDS) {
  let audio = cache.get(name);
  if (!audio) {
    audio = new Audio(SOUNDS[name]);
    cache.set(name, audio);
  }
  // Restart rather than queue, so quick repeats each make a sound.
  audio.currentTime = 0;
  void audio.play().catch(() => {});
}
