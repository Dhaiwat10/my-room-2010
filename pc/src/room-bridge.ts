// How the XP machine talks to the room around it.
//
// Sound: nothing on the PC plays straight to the computer's output. Every Web Audio graph
// (Webamp) and every <audio>/<video> element (system sounds, VLC, Movie Maker) is diverted
// into a MediaStream, which the room picks up and plays out of the two desk speakers in 3D.
//
// Control: the room can turn the machine on and start/stop the music when you tap a speaker.
//
// Light: the room asks for a tiny snapshot of the screen and uses it to colour the monitor's
// glow on the desk and its reflection in the laminate. A snapshot costs the page a few frames,
// so the room only asks when screenVersion() says the screen has changed.
import { createContext, destroyContext, domToCanvas, type Context } from "modern-screenshot";

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
// this each capture re-downloaded every desktop icon). The capture context, with its sandbox
// iframe and style cache, is kept between captures and only rebuilt when the screen resizes.
let capturing = false;
let context: Context<HTMLElement> | null = null;
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
async function contextFor(width: number) {
  const scale = width / document.body.clientWidth;
  if (context && context.scale === scale) return context;
  if (context) destroyContext(context);
  context = await createContext(document.body, {
    scale,
    backgroundColor: "#000",
    font: false,
    timeout: 1500,
    fetchFn: cachedFetch,
    autoDestruct: false,
  });
  return context;
}
export async function captureScreen(width = 96): Promise<HTMLCanvasElement | null> {
  if (capturing || !document.body.clientWidth) return null;
  // a screensaver covers the whole screen and is already a canvas: hand it over as it is
  const saver = document.querySelector<HTMLCanvasElement>("canvas.xp-saver");
  if (saver) return saver;
  capturing = true;
  try {
    return await domToCanvas(await contextFor(width));
  } catch {
    return null;
  } finally {
    capturing = false;
  }
}

// Goes up whenever the screen may look different: any change to the page except the capture's
// own sandbox iframe, and always while a canvas or video is up (they change without touching it).
let version = 0;
new MutationObserver((records) => {
  if (records.some((r) => !(r.target instanceof HTMLIFrameElement)
    && ![...r.addedNodes, ...r.removedNodes].every((n) => n instanceof HTMLIFrameElement))) version++;
}).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
function screenVersion() {
  if (document.querySelector("canvas, video")) version++;
  return version;
}
(window as Window & { __screenVersion?: typeof screenVersion }).__screenVersion = screenVersion;
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
