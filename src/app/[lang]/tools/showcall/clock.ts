"use client";

/**
 * Where the show's time comes from: an internal clock (to program and rehearse), LTC on an audio input (the
 * timecode as sound, read and turned into numbers here) or MTC from a MIDI port.
 */
import { LtcDecoder, labelToSeconds, ltcSamples, realRate, type Fps, type TcLabel } from "@/lib/timecode";

export type Source = "internal" | "ltc" | "mtc";

export interface Detected {
  fps: number;
  dropFrame: boolean;
}

// the audio thread hands every input channel over in small blocks, so LTC is found on whichever channel it's on
const WORKLET = `
class SgLtc extends AudioWorkletProcessor {
  constructor() { super(); this.bufs = []; this.i = 0; }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;
    while (this.bufs.length < input.length) this.bufs.push(new Float32Array(512));
    const n = input[0].length;
    for (let k = 0; k < n; k++) {
      for (let c = 0; c < input.length; c++) this.bufs[c][this.i] = input[c][k];
      if (++this.i === 512) {
        this.port.postMessage(this.bufs.slice(0, input.length).map((b) => b.slice(0)));
        this.i = 0;
      }
    }
    return true;
  }
}
registerProcessor("sg-ltc", SgLtc);
`;

/** Audio interfaces by name, to pick one over the computer's own microphone. */
export const INTERFACE = /focusrite|scarlett|clarett|motu|rme|fireface|babyface|apollo|universal audio|audient|presonus|steinberg|behringer|zoom|tascam|roland|digico|dante|avb|soundcraft|allen|midas|x32|interface|usb audio/i;
const BUILT_IN = /macbook|built-in|integrad|internal|default|predeterminad/i;
export const isBuiltIn = (label: string) => BUILT_IN.test(label) && !INTERFACE.test(label);

/** How long the clock keeps running on its own between timecode frames, and when the signal counts as lost. */
const FREEWHEEL = 0.12;
const LOST = 0.3;

export class ShowClock {
  source: Source = "internal";
  fps: Fps = 30;
  // internal
  private running = false;
  private base = 0;
  private startedAt = 0;
  // external: the last time read, and when
  private ext = 0;
  private extAt = 0;
  detected: Detected | null = null;
  /** input level, 0–1, for the meter (of the channel in use, or the loudest) */
  level = 0;
  /** each input channel's level */
  levels: number[] = [];
  /** the channel LTC is read from: picked, or found (-1 while searching) */
  ltcChannel = -1;
  /** the input in use, as the system names it */
  deviceLabel = "";
  sampleRate = 0;
  /** audio is held back by the browser until the page is clicked */
  audioWaiting: () => boolean = () => false;
  private stopExt: (() => void) | null = null;

  now() {
    const p = performance.now();
    if (this.source === "internal") return this.running ? this.base + (p - this.startedAt) / 1000 : this.base;
    if (!this.extAt) return this.ext;
    return this.ext + Math.min(FREEWHEEL, (p - this.extAt) / 1000);
  }

  /** "locked" while timecode comes in, "lost" when it stopped, "idle" before any. */
  status(): "idle" | "locked" | "lost" {
    if (this.source === "internal") return this.running ? "locked" : "idle";
    if (!this.extAt) return "idle";
    return (performance.now() - this.extAt) / 1000 < LOST ? "locked" : "lost";
  }

  isRunning() {
    return this.source === "internal" ? this.running : this.status() === "locked";
  }

  setFps(fps: Fps) {
    this.fps = fps;
  }

  play() {
    if (this.running) return;
    this.startedAt = performance.now();
    this.running = true;
  }
  pause() {
    if (!this.running) return;
    this.base = this.now();
    this.running = false;
  }
  locate(t: number) {
    this.base = Math.max(0, t);
    this.startedAt = performance.now();
  }

  private take(l: TcLabel, framesLate: number, fps: Fps) {
    this.ext = labelToSeconds(l, fps) + framesLate / realRate(fps);
    this.extAt = performance.now();
  }

  async stop() {
    this.stopExt?.();
    this.stopExt = null;
    this.extAt = 0;
    this.detected = null;
    this.level = 0;
    this.levels = [];
    this.ltcChannel = -1;
    this.deviceLabel = "";
  }

  /**
   * Reads LTC from an audio input: browser processing off, so the signal arrives as it is. Every channel is read;
   * `channel` -1 locks onto whichever one carries timecode. With `test`, a made-up LTC from 01:00:00:00 goes
   * through the same reader instead, to try it without a timecode source.
   */
  async startLtc(deviceId: string, channel: number, test = false) {
    await this.stop();
    // made before waiting on the microphone, while the click still counts, so the browser lets it run
    const ctx = new AudioContext({ latencyHint: "interactive" });
    let stream: MediaStream | null = null;
    try {
      stream = test
        ? null
        : await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 8 } },
          });
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
    } catch (e) {
      ctx.close();
      stream?.getTracks().forEach((t) => t.stop());
      throw e;
    }
    let src: AudioNode;
    let channels = 1;
    if (stream) {
      src = ctx.createMediaStreamSource(stream);
      const track = stream.getAudioTracks()[0];
      this.deviceLabel = track?.label ?? "";
      channels = Math.max(1, track?.getSettings().channelCount ?? 2);
    } else {
      // on the second channel, the first one quiet: the way LTC often sits on an interface's input 2
      const sig = ltcSamples(3600, 120, this.fps, ctx.sampleRate, 0.3);
      const buf = ctx.createBuffer(2, sig.length, ctx.sampleRate);
      buf.copyToChannel(sig, 1);
      const play = ctx.createBufferSource();
      play.buffer = buf;
      play.start();
      src = play;
      this.deviceLabel = "LTC test";
      channels = 2;
    }
    this.sampleRate = ctx.sampleRate;
    const node = new AudioWorkletNode(ctx, "sg-ltc", { channelCount: Math.min(32, channels), channelCountMode: "explicit", channelInterpretation: "discrete" });
    // keep the node pulled by the graph without sending anything out
    const mute = ctx.createGain();
    mute.gain.value = 0;
    src.connect(node).connect(mute).connect(ctx.destination);
    const decs: LtcDecoder[] = [];
    const lastFrame: number[] = [];
    this.ltcChannel = channel;
    node.port.onmessage = (e: MessageEvent<Float32Array[]>) => {
      const now = performance.now();
      e.data.forEach((buf, c) => {
        let peak = 0;
        for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
        this.levels[c] = Math.max(peak, (this.levels[c] ?? 0) * 0.9);
        // a picked channel is the only one read; searching, every one is
        if (channel >= 0 && c !== channel) return;
        decs[c] ??= new LtcDecoder(ctx.sampleRate);
        const frames = decs[c].push(buf);
        const f = frames[frames.length - 1];
        if (!f) return;
        lastFrame[c] = now;
        // searching: lock onto the first channel with timecode, and let go after it's been quiet a while
        if (channel < 0 && this.ltcChannel >= 0 && this.ltcChannel !== c && now - (lastFrame[this.ltcChannel] ?? 0) < 1500) return;
        this.ltcChannel = c;
        this.detected = { fps: Math.round(f.fps * 100) / 100, dropFrame: f.dropFrame };
        // a frame is decoded once it has fully gone by: the time now is the next frame (labels read at the show's rate)
        this.take(f, 1, this.fps);
      });
      this.level = this.ltcChannel >= 0 ? (this.levels[this.ltcChannel] ?? 0) : Math.max(0, ...this.levels);
    };
    this.source = "ltc";
    // the browser holds audio back until the page has been clicked: start on the next click if it's waiting
    const wake = () => ctx.resume();
    if (ctx.state !== "running") {
      ctx.resume().catch(() => {});
      document.addEventListener("pointerdown", wake);
    }
    this.audioWaiting = () => ctx.state === "suspended";
    this.stopExt = () => {
      document.removeEventListener("pointerdown", wake);
      this.audioWaiting = () => false;
      node.port.onmessage = null;
      stream?.getTracks().forEach((t) => t.stop());
      ctx.close();
    };
  }

  /** Reads MTC from a MIDI input: quarter-frame messages, and full-frame messages when a player locates. */
  async startMtc(inputId: string) {
    await this.stop();
    const access = await navigator.requestMIDIAccess();
    const input = [...access.inputs.values()].find((i) => i.id === inputId) ?? [...access.inputs.values()][0];
    if (!input) throw new Error("no-midi");
    const q = new Array<number>(8).fill(0);
    const RATES: Fps[] = [24, 25, 29.97, 30];
    input.onmidimessage = (e) => {
      const d = e.data;
      if (!d) return;
      if (d[0] === 0xf1) {
        const piece = d[1] >> 4;
        q[piece] = d[1] & 15;
        if (piece !== 7) return;
        const rate = RATES[(q[7] >> 1) & 3];
        this.detected = { fps: rate, dropFrame: rate === 29.97 };
        this.level = 1;
        // the eight pieces take two frames to arrive
        this.take({ f: q[0] | (q[1] << 4), s: q[2] | (q[3] << 4), m: q[4] | (q[5] << 4), h: q[6] | ((q[7] & 1) << 4) }, 2, this.fps);
      } else if (d[0] === 0xf0 && d[1] === 0x7f && d[3] === 0x01 && d[4] === 0x01 && d.length >= 9) {
        this.take({ h: d[5] & 31, m: d[6], s: d[7], f: d[8] }, 0, this.fps);
      }
    };
    this.source = "mtc";
    this.stopExt = () => {
      input.onmidimessage = null;
    };
  }

  useInternal() {
    this.stop();
    this.source = "internal";
  }
}

export async function audioInputs() {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === "audioinput").map((d) => ({ id: d.deviceId, name: d.label || "Audio input" }));
}

export async function midiInputs() {
  if (!("requestMIDIAccess" in navigator)) return null;
  const access = await navigator.requestMIDIAccess();
  return [...access.inputs.values()].map((i) => ({ id: i.id, name: i.name ?? "MIDI" }));
}
