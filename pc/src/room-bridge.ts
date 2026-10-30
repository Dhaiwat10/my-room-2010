// How the XP machine talks to the room around it.
//
// Sound: nothing on the PC plays straight to the computer's output. Every Web Audio graph
// (Webamp) and every <audio>/<video> element (system sounds, VLC, Movie Maker) is diverted
// into a MediaStream, which the room picks up and plays out of the two desk speakers in 3D.
//
// Control: the room can turn the machine on and start/stop the music when you tap a speaker.
//
// Light: the room asks for a tiny snapshot of the screen a few times a second and uses it to
// colour the monitor's glow on the desk and its reflection in the laminate.
import { domToCanvas } from "modern-screenshot";

type Tapped = AudioContext & { __tap?: MediaStreamAudioDestinationNode };
type Win = Window & { __pcStreams?: MediaStream[]; __webamp?: WebampLike; __playOnOpen?: boolean };
type WebampLike = { play(): void; pause(): void; getMediaStatus(): string | null };

const w = window as Win;
w.__pcStreams = [];

function tapFor(ctx: Tapped) {
  if (!ctx.__tap) {
    ctx.__tap = ctx.createMediaStreamDestination();
    w.__pcStreams!.push(ctx.__tap.stream);
    parent.postMessage({ type: "pc-audio" }, "*");
  }
  return ctx.__tap;
}

export function installAudioTap() {
  // anything connected to a context's speakers goes to that context's stream instead
  const connect = AudioNode.prototype.connect as (this: AudioNode, ...a: unknown[]) => unknown;
  AudioNode.prototype.connect = function (this: AudioNode, dest: unknown, ...rest: unknown[]) {
    if (dest instanceof AudioDestinationNode) return connect.call(this, tapFor(this.context as Tapped), ...rest);
    return connect.call(this, dest, ...rest);
  } as typeof AudioNode.prototype.connect;

  // plain media elements get routed through one shared context the first time they play
  let mediaCtx: AudioContext | null = null;
  const routed = new WeakSet<HTMLMediaElement>();
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    if (!routed.has(this)) {
      routed.add(this);
      try {
        mediaCtx ??= new AudioContext();
        mediaCtx.createMediaElementSource(this).connect(mediaCtx.destination);
      } catch {
        // already owned by another graph (Webamp's own player): that graph is tapped anyway
      }
    }
    void mediaCtx?.resume();
    return play.call(this);
  };
}

// A thumbnail of the whole screen (about 96 px wide). Fonts aren't embedded, only one
// capture runs at a time, and every image is fetched once and kept as a data URL (without
// this each capture re-downloaded every desktop icon), so it stays cheap to repeat.
let capturing = false;
const dataUrls = new Map<string, Promise<string | false>>();
function cachedFetch(url: string): Promise<string | false> {
  if (url.startsWith("data:")) return Promise.resolve(url);
  let hit = dataUrls.get(url);
  if (!hit) {
    hit = fetch(url)
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => new Promise<string>((ok) => {
        const fr = new FileReader();
        fr.onload = () => ok(fr.result as string);
        fr.readAsDataURL(b);
      }))
      .catch(() => false as const);
    dataUrls.set(url, hit);
  }
  return hit;
}
export async function captureScreen(width = 96): Promise<HTMLCanvasElement | null> {
  if (capturing || !document.body.clientWidth) return null;
  capturing = true;
  try {
    return await domToCanvas(document.body, {
      scale: width / document.body.clientWidth,
      backgroundColor: "#000",
      font: false,
      timeout: 1500,
      fetchFn: cachedFetch,
    });
  } catch {
    return null;
  } finally {
    capturing = false;
  }
}
(window as Window & { __capture?: typeof captureScreen }).__capture = captureScreen;

export function registerWebamp(webamp: WebampLike) {
  w.__webamp = webamp;
  if (w.__playOnOpen) {
    w.__playOnOpen = false;
    webamp.play();
  }
}

// Tapping a speaker in the room: play/pause Winamp, opening it first if it isn't running.
export function toggleMusic(openWinamp: () => void) {
  const amp = w.__webamp;
  if (!amp) {
    w.__playOnOpen = true;
    openWinamp();
    return;
  }
  if (amp.getMediaStatus() === "PLAYING") amp.pause();
  else amp.play();
}
