/** Everything a voice needs to sound: where it plays, the shared noise burst, and an optional node tracker. */
export interface AudioSink {
  readonly context: AudioContext;
  readonly destination: AudioNode;
  readonly noise: AudioBuffer;
  readonly track?: (node: AudioScheduledSourceNode) => void;
}

export interface ToneSpec {
  readonly freq: number;
  readonly freqEnd?: number;
  readonly dur: number;
  readonly vol: number;
  readonly type?: OscillatorType;
}

// Exponential ramps cannot reach zero, so envelopes fall to a tiny floor instead.
const SILENT_GAIN = 0.0001;
const ATTACK_SECONDS = 0.004;
const PITCH_GLIDE_FRACTION = 0.6;
const STOP_PADDING_SECONDS = 0.05;
const CLICK_HIGHPASS_HZ = 1800;
const CLICK_DECAY_SECONDS = 0.02;
const CLICK_LENGTH_SECONDS = 0.03;

export function createNoiseBuffer(context: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function playTone(sink: AudioSink, when: number, spec: ToneSpec): void {
  const oscillator = sink.context.createOscillator();
  const envelope = sink.context.createGain();
  oscillator.type = spec.type ?? "sine";
  oscillator.frequency.setValueAtTime(spec.freq, when);
  if (spec.freqEnd !== undefined) {
    oscillator.frequency.exponentialRampToValueAtTime(
      spec.freqEnd,
      when + spec.dur * PITCH_GLIDE_FRACTION,
    );
  }

  envelope.gain.setValueAtTime(SILENT_GAIN, when);
  envelope.gain.exponentialRampToValueAtTime(spec.vol, when + ATTACK_SECONDS);
  envelope.gain.exponentialRampToValueAtTime(SILENT_GAIN, when + spec.dur);

  oscillator.connect(envelope);
  envelope.connect(sink.destination);
  sink.track?.(oscillator);
  oscillator.start(when);
  oscillator.stop(when + spec.dur + STOP_PADDING_SECONDS);
}

/** Short high-passed noise burst that gives a bol its attack. */
export function playClick(sink: AudioSink, when: number, vol: number): void {
  const source = sink.context.createBufferSource();
  const highpass = sink.context.createBiquadFilter();
  const envelope = sink.context.createGain();
  source.buffer = sink.noise;
  highpass.type = "highpass";
  highpass.frequency.value = CLICK_HIGHPASS_HZ;

  envelope.gain.setValueAtTime(vol, when);
  envelope.gain.exponentialRampToValueAtTime(SILENT_GAIN, when + CLICK_DECAY_SECONDS);

  source.connect(highpass);
  highpass.connect(envelope);
  envelope.connect(sink.destination);
  sink.track?.(source);
  source.start(when, 0, CLICK_LENGTH_SECONDS);
  source.stop(when + CLICK_LENGTH_SECONDS);
}
