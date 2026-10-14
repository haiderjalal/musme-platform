export interface AudioSession {
  readonly context: AudioContext;
  /** Master gain every voice connects to. Sits below unity so summed voices do not clip. */
  readonly destination: GainNode;
}

const MASTER_GAIN = 0.9;

/**
 * Owns the AudioContext. The context is created on first use, which always happens inside a user
 * gesture, because browsers refuse to start audio without one.
 */
export class AudioOutput {
  private current: AudioSession | null = null;

  session(): AudioSession {
    if (this.current) return this.current;

    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(context.destination);

    const session: AudioSession = { context, destination: master };
    this.current = session;
    return session;
  }

  /** Resumes a context the browser suspended. Rejects if the audio device cannot start. */
  async resume(): Promise<void> {
    const { context } = this.session();
    if (context.state === "suspended") await context.resume();
  }

  close(): void {
    const session = this.current;
    if (!session) return;
    // Clearing the reference first means a later session() call builds a fresh context.
    this.current = null;
    void session.context.close();
  }
}
