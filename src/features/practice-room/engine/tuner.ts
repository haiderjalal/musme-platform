import type { AudioOutput } from "./audio-output";
import type { MicErrorReason } from "./messages";
import { detectPitch, rms } from "./pitch";
import { isTunerFrameDue, type TunerFrame } from "./tuning";

// 2048 samples is about 46 ms at 44.1 kHz: enough for the lowest pitch the tuner searches for.
export const TUNER_FFT_SIZE = 2048;

export type OpenMicResult =
  | { readonly ok: true; readonly tuner: MicTuner }
  | { readonly ok: false; readonly reason: MicErrorReason };

// Browser DSP would colour the signal, so every processing stage is switched off.
const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
};

/**
 * Requests the microphone and reports the outcome as a typed result. Permission problems are
 * expected user states, so they are returned rather than thrown into the UI.
 */
export async function openMicTuner(output: AudioOutput): Promise<OpenMicResult> {
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, reason: "unsupported" };

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
  } catch (error: unknown) {
    return { ok: false, reason: reasonFor(error) };
  }

  try {
    await output.resume();
    const { context } = output.session();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = TUNER_FFT_SIZE;
    source.connect(analyser);
    return { ok: true, tuner: new MicTuner(stream, source, analyser, context.sampleRate) };
  } catch (error: unknown) {
    stopStream(stream);
    return { ok: false, reason: reasonFor(error) };
  }
}

/** Owns one open microphone. Create it with openMicTuner and always call stop() when done. */
export class MicTuner {
  private readonly stream: MediaStream;
  private readonly source: MediaStreamAudioSourceNode;
  private readonly analyser: AnalyserNode;
  private readonly sampleRate: number;
  // The analyser only accepts an ArrayBuffer-backed array, not a view over a shared buffer.
  private readonly buffer: Float32Array<ArrayBuffer>;
  private lastReadMs = Number.NEGATIVE_INFINITY;
  private stopped = false;

  constructor(
    stream: MediaStream,
    source: MediaStreamAudioSourceNode,
    analyser: AnalyserNode,
    sampleRate: number,
  ) {
    this.stream = stream;
    this.source = source;
    this.analyser = analyser;
    this.sampleRate = sampleRate;
    this.buffer = new Float32Array(
      new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT),
    );
  }

  /**
   * Returns the latest frame, or null when called again before the throttle interval has passed.
   * Pass the animation-frame timestamp so readings stay on the display's clock.
   */
  readFrame(nowMs: number): TunerFrame | null {
    if (this.stopped || !isTunerFrameDue(this.lastReadMs, nowMs)) return null;
    this.lastReadMs = nowMs;
    this.analyser.getFloatTimeDomainData(this.buffer);
    return {
      level: rms(this.buffer),
      frequency: detectPitch(this.buffer, this.sampleRate),
    };
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    stopStream(this.stream);
    this.source.disconnect();
    this.analyser.disconnect();
  }
}

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

function reasonFor(error: unknown): MicErrorReason {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") return "denied";
    if (error.name === "NotFoundError" || error.name === "OverconstrainedError") return "no-device";
  }
  return "failed";
}
