/**
 * SMPTE timecode: frame rates, labels (HH:MM:SS:FF) and seconds. 29.97 is drop-frame: labels skip frames 00 and 01
 * at the start of each minute, except every tenth, so the label keeps up with the clock.
 */
export type Fps = 24 | 25 | 29.97 | 30;
export const FPS_LIST: Fps[] = [24, 25, 29.97, 30];

export interface TcLabel {
  h: number;
  m: number;
  s: number;
  f: number;
}

const nominal = (fps: Fps) => Math.round(fps);
/** frames per second of real time */
export const realRate = (fps: Fps) => (fps === 29.97 ? 30000 / 1001 : fps);

/** A label's position in frames from 00:00:00:00. */
export function labelToFrames({ h, m, s, f }: TcLabel, fps: Fps) {
  const nom = nominal(fps);
  let n = ((h * 60 + m) * 60 + s) * nom + f;
  if (fps === 29.97) {
    const minutes = h * 60 + m;
    n -= 2 * (minutes - Math.floor(minutes / 10));
  }
  return n;
}

export function framesToLabel(frames: number, fps: Fps): TcLabel {
  let n = Math.max(0, Math.floor(frames));
  const nom = nominal(fps);
  if (fps === 29.97) {
    const d = Math.floor(n / 17982);
    const m = n % 17982;
    n += 18 * d + (m >= 2 ? 2 * Math.floor((m - 2) / 1798) : 0);
  }
  return { f: n % nom, s: Math.floor(n / nom) % 60, m: Math.floor(n / nom / 60) % 60, h: Math.floor(n / nom / 3600) % 24 };
}

export const labelToSeconds = (l: TcLabel, fps: Fps) => labelToFrames(l, fps) / realRate(fps);
export const secondsToLabel = (sec: number, fps: Fps) => framesToLabel(sec * realRate(fps) + 1e-6, fps);

const p2 = (n: number) => String(n).padStart(2, "0");

/** 01:02:03:04 (drop-frame: 01:02:03;04) */
export function fmtTc(sec: number, fps: Fps) {
  const l = secondsToLabel(sec, fps);
  return `${p2(l.h)}:${p2(l.m)}:${p2(l.s)}${fps === 29.97 ? ";" : ":"}${p2(l.f)}`;
}

/**
 * Seconds from what a member types or a file holds: 01:02:03:04 (frames), 01:02:03.5, 1:02:03, 2:03.5 (minutes and
 * seconds) or plain seconds. Null when it doesn't read as a time.
 */
export function parseTc(text: string, fps: Fps): number | null {
  const s = text.trim().replace(/,/g, ".");
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[:.](\d{1,2})[:.](\d{1,2})[:;.](\d{1,2})$/);
  if (m) {
    const l = { h: +m[1], m: +m[2], s: +m[3], f: +m[4] };
    if (l.m > 59 || l.s > 59 || l.f >= nominal(fps)) return null;
    return labelToSeconds(l, fps);
  }
  m = s.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3];
  m = s.match(/^(\d{1,3}):(\d{1,2}(?:\.\d+)?)$/);
  if (m) return +m[1] * 60 + +m[2];
  m = s.match(/^\d+(?:\.\d+)?$/);
  return m ? Number(s) : null;
}

// ---------- LTC: timecode as audio ----------
// Each frame is 80 bits sent as biphase mark: the level flips at the start of every bit, and a 1 flips again
// halfway. Bits 64–79 are the sync word. Values are BCD, least significant bit first.

const SYNC = [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1];

export interface LtcFrame extends TcLabel {
  dropFrame: boolean;
  /** frames per second measured from the signal's bit rate */
  fps: number;
}

/**
 * Reads LTC from audio samples: finds the level flips (with hysteresis, so noise doesn't count), sorts the gaps
 * into whole and half bits against a bit length it keeps learning (so speed and frame rate can change), and decodes
 * a frame each time the sync word comes by. Polarity doesn't matter.
 */
export class LtcDecoder {
  private n = 0;
  private lastEdge = 0;
  private high = false;
  private peak = 0;
  private bitLen: number;
  private half = false;
  private bits: number[] = [];

  constructor(private sampleRate: number) {
    this.bitLen = sampleRate / 2400;
  }

  push(samples: Float32Array): LtcFrame[] {
    const out: LtcFrame[] = [];
    for (let i = 0; i < samples.length; i++, this.n++) {
      const x = samples[i];
      const a = Math.abs(x);
      this.peak = a > this.peak ? a : this.peak * 0.99995;
      const thr = Math.max(0.002, this.peak * 0.15);
      if ((this.high && x < -thr) || (!this.high && x > thr)) {
        this.high = x > 0;
        const gap = this.n - this.lastEdge;
        this.lastEdge = this.n;
        const f = this.edge(gap);
        if (f) out.push(f);
      }
    }
    return out;
  }

  private edge(gap: number): LtcFrame | null {
    // between 1,700 and 3,200 bits a second covers 24 to 30 fps, slowed or sped up
    const min = this.sampleRate / 3200 / 2;
    const max = (this.sampleRate / 1700) * 1.5;
    if (gap < min * 0.5 || gap > max) {
      this.half = false;
      return null;
    }
    if (gap < this.bitLen * 0.75) {
      this.bitLen += (gap * 2 - this.bitLen) * 0.05;
      if (!this.half) {
        this.half = true;
        return null;
      }
      this.half = false;
      return this.bit(1);
    }
    this.half = false;
    this.bitLen += (gap - this.bitLen) * 0.05;
    return this.bit(0);
  }

  private bit(b: number): LtcFrame | null {
    this.bits.push(b);
    if (this.bits.length > 80) this.bits.shift();
    if (this.bits.length < 80) return null;
    for (let i = 0; i < 16; i++) if (this.bits[64 + i] !== SYNC[i]) return null;
    const v = (at: number, len: number) => {
      let x = 0;
      for (let i = 0; i < len; i++) x |= this.bits[at + i] << i;
      return x;
    };
    const f = v(0, 4) + 10 * v(8, 2);
    const s = v(16, 4) + 10 * v(24, 3);
    const m = v(32, 4) + 10 * v(40, 3);
    const h = v(48, 4) + 10 * v(56, 2);
    if (f > 29 || s > 59 || m > 59 || h > 23) return null;
    return { h, m, s, f, dropFrame: this.bits[10] === 1, fps: this.sampleRate / this.bitLen / 80 };
  }
}

/** The 80 bits of one LTC frame. */
function frameBits(l: TcLabel, fps: Fps) {
  const bits = new Array<number>(80).fill(0);
  const put = (at: number, len: number, v: number) => {
    for (let i = 0; i < len; i++) bits[at + i] = (v >> i) & 1;
  };
  put(0, 4, l.f % 10);
  put(8, 2, Math.floor(l.f / 10));
  bits[10] = fps === 29.97 ? 1 : 0;
  put(16, 4, l.s % 10);
  put(24, 3, Math.floor(l.s / 10));
  put(32, 4, l.m % 10);
  put(40, 3, Math.floor(l.m / 10));
  put(48, 4, l.h % 10);
  put(56, 2, Math.floor(l.h / 10));
  SYNC.forEach((b, i) => (bits[64 + i] = b));
  // the polarity bit (27, or 59 at 25 fps) keeps each frame's count of zeros even
  if (bits.filter((b) => b === 0).length % 2) bits[fps === 25 ? 59 : 27] = 1;
  return bits;
}

/**
 * LTC as audio, to test a reader without a timecode source: `seconds` of signal from `startSec`, at `fps`.
 */
export function ltcSamples(startSec: number, seconds: number, fps: Fps, sampleRate: number, amp = 0.5) {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  const perBit = sampleRate / (realRate(fps) * 80);
  let level = 1;
  let frame = Math.floor(startSec * realRate(fps));
  let bits = frameBits(framesToLabel(frame, fps), fps);
  let bitIdx = 0;
  let t = 0;
  let flippedHalf = false;
  for (let i = 0; i < out.length; i++) {
    if (t >= perBit) {
      t -= perBit;
      bitIdx++;
      flippedHalf = false;
      if (bitIdx === 80) {
        bitIdx = 0;
        frame++;
        bits = frameBits(framesToLabel(frame, fps), fps);
      }
      level = -level;
    }
    if (bits[bitIdx] === 1 && !flippedHalf && t >= perBit / 2) {
      level = -level;
      flippedHalf = true;
    }
    out[i] = level * amp;
    t++;
  }
  return out;
}
