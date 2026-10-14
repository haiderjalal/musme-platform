import { createNoiseBuffer, type AudioSink } from "./audio-primitives";
import type { AudioOutput } from "./audio-output";
import { playBol } from "./bol-synth";
import { clamp } from "./numeric";
import {
  createBeatCursor,
  planBeats,
  takeDueBeats,
  type BeatCursor,
  type BeatEvent,
} from "./scheduler";
import { clampTempo, DEFAULT_TEMPO_BPM, nextSpeedTrainerTempo } from "./tempo";
import { DEFAULT_TAAL_KEY, getTaal, type TaalDefinition, type TaalKey } from "./taals";

export const DEFAULT_TAAL_VOLUME = 0.8;

// Beats are scheduled this far ahead on the AudioContext clock, so a late timer tick never reaches the sound.
const LOOKAHEAD_SECONDS = 0.12;
const TICK_INTERVAL_MS = 25;
// A short lead-in lets the first sam land on a clean clock time instead of being clipped.
const START_DELAY_SECONDS = 0.08;
const VOLUME_TIME_CONSTANT_SECONDS = 0.02;
const NOISE_SECONDS = 0.05;

export interface TaalPlayerListeners {
  /** Fired when the speed trainer changes tempo. This happens at most once every few cycles. */
  readonly onTempoChange: (bpm: number) => void;
}

/**
 * Plays a taal on the AudioContext clock. A short timer tick schedules audio ahead of time, and
 * an animation-frame loop reports the beats that have sounded. Neither loop touches React state.
 */
export class TaalPlayer {
  private readonly output: AudioOutput;
  private readonly listeners: TaalPlayerListeners;
  // Beats are reported on animation frames, never per audio sample, so UI work stays off the audio path.
  private beatListener: ((beat: BeatEvent) => void) | null = null;
  private taal: TaalDefinition = getTaal(DEFAULT_TAAL_KEY);
  private bpm = DEFAULT_TEMPO_BPM;
  private volume = DEFAULT_TAAL_VOLUME;
  private trainerTarget: number | null = null;
  private transportActive = false;
  private startPending = false;
  // Each start() takes a token. A stop() or a newer start() invalidates older pending starts.
  private startToken = 0;
  private cursor: BeatCursor = createBeatCursor(0);
  private scheduled: readonly BeatEvent[] = [];
  private readonly activeNodes = new Set<AudioScheduledSourceNode>();
  private bus: GainNode | null = null;
  private sink: AudioSink | null = null;
  private tickTimer: number | null = null;
  private frameId: number | null = null;

  constructor(output: AudioOutput, listeners: TaalPlayerListeners) {
    this.output = output;
    this.listeners = listeners;
  }

  get isRunning(): boolean {
    return this.transportActive;
  }

  /** True while the taal is playing or waiting for the audio device to start. */
  get isActive(): boolean {
    return this.transportActive || this.startPending;
  }

  get tempo(): number {
    return this.bpm;
  }

  /** Replaces the beat listener. Pass null to stop reporting beats. */
  setBeatListener(listener: ((beat: BeatEvent) => void) | null): void {
    this.beatListener = listener;
  }

  async start(): Promise<void> {
    if (this.isActive) return;
    this.startPending = true;
    const token = ++this.startToken;
    try {
      await this.output.resume();
      if (token === this.startToken) this.beginTransport();
    } finally {
      if (token === this.startToken) this.startPending = false;
    }
  }

  stop(): void {
    this.startToken += 1;
    this.startPending = false;
    if (this.transportActive) this.halt();
  }

  setTempo(value: number): void {
    this.bpm = clampTempo(value);
  }

  setTaal(key: TaalKey): void {
    this.taal = getTaal(key);
    // A taal change mid-cycle would misalign the bols, so playback restarts from the sam.
    if (this.transportActive) {
      this.halt();
      this.beginTransport();
    }
  }

  setVolume(value: number): void {
    this.volume = clamp(value, 0, 1);
    if (this.bus) {
      this.bus.gain.setTargetAtTime(
        this.volume,
        this.bus.context.currentTime,
        VOLUME_TIME_CONSTANT_SECONDS,
      );
    }
  }

  /** Pass a target to enable the trainer, or null to turn it off. */
  setSpeedTrainer(target: number | null): void {
    this.trainerTarget = target === null ? null : clampTempo(target);
  }

  dispose(): void {
    this.stop();
  }

  private beginTransport(): void {
    const { context, destination } = this.output.session();
    const bus = context.createGain();
    bus.gain.value = this.volume;
    bus.connect(destination);

    this.bus = bus;
    this.sink = {
      context,
      destination: bus,
      noise: createNoiseBuffer(context, NOISE_SECONDS),
      track: this.trackNode,
    };
    this.cursor = createBeatCursor(context.currentTime + START_DELAY_SECONDS);
    this.transportActive = true;

    this.tick();
    this.tickTimer = window.setInterval(this.tick, TICK_INTERVAL_MS);
    this.frameId = window.requestAnimationFrame(this.paint);
  }

  private halt(): void {
    this.transportActive = false;
    if (this.tickTimer !== null) window.clearInterval(this.tickTimer);
    if (this.frameId !== null) window.cancelAnimationFrame(this.frameId);
    this.tickTimer = null;
    this.frameId = null;

    this.activeNodes.forEach((node) => node.stop());
    this.activeNodes.clear();
    this.bus?.disconnect();
    this.bus = null;
    this.sink = null;
    this.scheduled = [];
  }

  private readonly tick = (): void => {
    const sink = this.sink;
    if (!sink) return;

    const plan = planBeats({
      clockTime: sink.context.currentTime,
      lookaheadSeconds: LOOKAHEAD_SECONDS,
      taal: this.taal,
      bpm: this.bpm,
      cursor: this.cursor,
      onCycleStart: this.applySpeedTrainer,
    });

    this.cursor = plan.cursor;
    if (plan.bpm !== this.bpm) {
      this.bpm = plan.bpm;
      this.listeners.onTempoChange(plan.bpm);
    }
    for (const event of plan.events) {
      playBol(sink, event.bol, event.time, event.accent);
    }
    this.scheduled = this.scheduled.concat(plan.events);
  };

  private readonly paint = (): void => {
    const sink = this.sink;
    if (!sink) return;

    const due = takeDueBeats(this.scheduled, sink.context.currentTime);
    this.scheduled = due.pending;
    for (const beat of due.due) {
      this.beatListener?.(beat);
    }
    this.frameId = window.requestAnimationFrame(this.paint);
  };

  private readonly applySpeedTrainer = (cycleIndex: number, bpm: number): number => {
    if (this.trainerTarget === null) return bpm;
    return nextSpeedTrainerTempo(bpm, this.trainerTarget, cycleIndex);
  };

  private readonly trackNode = (node: AudioScheduledSourceNode): void => {
    this.activeNodes.add(node);
    node.addEventListener("ended", () => this.activeNodes.delete(node), { once: true });
  };
}
