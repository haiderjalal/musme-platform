import { createNoiseBuffer } from "./audio-primitives";
import {
  loopCutoffHz,
  loopDelaySeconds,
  loopFeedbackGain,
  STRING_OUTPUT_GAIN,
  STRING_RATIOS,
} from "./drone-math";
import { clamp } from "./numeric";

export const DEFAULT_DRONE_VOLUME = 0.5;

const MAX_DELAY_SECONDS = 1;
const PLUCK_NOISE_SECONDS = 0.05;
const PLUCK_GAIN = 0.8;
// Strings are plucked one after another so the drone shimmers rather than hitting one chord.
const STRING_STAGGER_SECONDS = 0.8;
const REPLUCK_INTERVAL_MS = 7000;
const FADE_TIME_CONSTANT_SECONDS = 0.08;
// Wait for the fade to finish before disconnecting, or the cut-off clicks.
const RELEASE_AFTER_FADE_MS = 900;
const VOLUME_TIME_CONSTANT_SECONDS = 0.02;

export interface TanpuraDrone {
  /** Plucks all four strings once, staggered. */
  pluck(): void;
  /** Starts the drone and re-plucks it periodically, as a live tanpura is replucked. */
  start(): void;
  /** Fades out and releases the audio graph. A stopped drone cannot restart, so create a new one. */
  stop(): void;
  setVolume(value: number): void;
}

interface KarplusString {
  readonly input: GainNode;
  readonly nodes: readonly AudioNode[];
}

/** Four plucked strings (lower Pa, Sa, upper Sa, lower Sa) built from Karplus-Strong feedback loops. */
export function createTanpuraDrone(
  context: AudioContext,
  destination: AudioNode,
  saFrequencyHz: number,
): TanpuraDrone {
  const bus = context.createGain();
  bus.gain.value = DEFAULT_DRONE_VOLUME;
  bus.connect(destination);

  const noise = createNoiseBuffer(context, PLUCK_NOISE_SECONDS);
  const strings = STRING_RATIOS.map((ratio) =>
    createKarplusString(context, bus, saFrequencyHz * ratio),
  );
  let repluckTimer: number | null = null;
  let stopped = false;

  const pluck = (): void => {
    strings.forEach((karplus, index) => {
      pluckString(
        context,
        noise,
        karplus.input,
        context.currentTime + index * STRING_STAGGER_SECONDS,
      );
    });
  };

  return {
    pluck,
    start(): void {
      if (stopped || repluckTimer !== null) return;
      pluck();
      repluckTimer = window.setInterval(pluck, REPLUCK_INTERVAL_MS);
    },
    stop(): void {
      if (stopped) return;
      stopped = true;
      if (repluckTimer !== null) window.clearInterval(repluckTimer);
      bus.gain.setTargetAtTime(0, context.currentTime, FADE_TIME_CONSTANT_SECONDS);
      window.setTimeout(() => releaseGraph(bus, strings), RELEASE_AFTER_FADE_MS);
    },
    setVolume(value: number): void {
      bus.gain.setTargetAtTime(
        clamp(value, 0, 1),
        context.currentTime,
        VOLUME_TIME_CONSTANT_SECONDS,
      );
    },
  };
}

function createKarplusString(
  context: AudioContext,
  bus: AudioNode,
  frequency: number,
): KarplusString {
  const delay = context.createDelay(MAX_DELAY_SECONDS);
  delay.delayTime.value = loopDelaySeconds(frequency);

  const loop = context.createBiquadFilter();
  loop.type = "lowpass";
  loop.frequency.value = loopCutoffHz(frequency);

  const feedback = context.createGain();
  feedback.gain.value = loopFeedbackGain(frequency);

  const input = context.createGain();
  const stringOut = context.createGain();
  stringOut.gain.value = STRING_OUTPUT_GAIN;

  input.connect(delay);
  delay.connect(loop);
  loop.connect(feedback);
  feedback.connect(delay);
  loop.connect(stringOut);
  stringOut.connect(bus);

  return { input, nodes: [input, delay, loop, feedback, stringOut] };
}

function pluckString(
  context: AudioContext,
  noise: AudioBuffer,
  input: AudioNode,
  when: number,
): void {
  const source = context.createBufferSource();
  const gain = context.createGain();
  gain.gain.value = PLUCK_GAIN;
  source.buffer = noise;
  source.connect(gain);
  gain.connect(input);
  source.start(when);
}

function releaseGraph(bus: GainNode, strings: readonly KarplusString[]): void {
  bus.disconnect();
  for (const karplus of strings) {
    for (const node of karplus.nodes) node.disconnect();
  }
}
