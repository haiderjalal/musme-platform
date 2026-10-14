"use client";

import { useCallback, useEffect, useState } from "react";

import type { AudioOutput } from "../engine/audio-output";
import { AUDIO_UNAVAILABLE_MESSAGE } from "../engine/messages";
import { clamp } from "../engine/numeric";
import type { BeatEvent } from "../engine/scheduler";
import { TaalPlayer, DEFAULT_TAAL_VOLUME } from "../engine/taal-player";
import { DEFAULT_TAAL_KEY, type TaalKey } from "../engine/taals";
import { clampTempo, DEFAULT_TARGET_BPM, DEFAULT_TEMPO_BPM } from "../engine/tempo";

export interface SpeedTrainerState {
  readonly enabled: boolean;
  readonly target: number;
}

export interface UseTaalPlayerOptions {
  /** Called for each beat that has sounded. Keep it free of React state updates. */
  readonly onBeat: (beat: BeatEvent) => void;
}

export interface UseTaalPlayerResult {
  readonly isPlaying: boolean;
  readonly bpm: number;
  readonly taalKey: TaalKey;
  readonly volume: number;
  readonly speedTrainer: SpeedTrainerState;
  readonly error: string | null;
  readonly toggle: () => void;
  readonly setTempo: (bpm: number) => void;
  readonly nudgeTempo: (delta: number) => void;
  readonly setTaal: (key: TaalKey) => void;
  readonly setVolume: (value: number) => void;
  readonly setSpeedTrainerEnabled: (enabled: boolean) => void;
  readonly setSpeedTrainerTarget: (bpm: number) => void;
}

const DEFAULT_SPEED_TRAINER: SpeedTrainerState = { enabled: false, target: DEFAULT_TARGET_BPM };

export function useTaalPlayer(
  output: AudioOutput,
  options: UseTaalPlayerOptions,
): UseTaalPlayerResult {
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(DEFAULT_TEMPO_BPM);
  const [taalKey, setTaalKey] = useState<TaalKey>(DEFAULT_TAAL_KEY);
  const [volume, setVolumeState] = useState(DEFAULT_TAAL_VOLUME);
  const [speedTrainer, setSpeedTrainerState] = useState<SpeedTrainerState>(DEFAULT_SPEED_TRAINER);
  const [error, setError] = useState<string | null>(null);

  // Built once. The beat listener is attached in an effect, so no ref is read while rendering.
  const [player] = useState(() => new TaalPlayer(output, { onTempoChange: setBpm }));
  const { onBeat } = options;

  useEffect(() => {
    player.setBeatListener(onBeat);
  }, [player, onBeat]);

  useEffect(() => () => player.dispose(), [player]);

  const toggle = useCallback((): void => {
    if (player.isActive) {
      player.stop();
      setIsPlaying(false);
      return;
    }
    setError(null);
    player
      .start()
      .then(() => setIsPlaying(player.isRunning))
      .catch(() => setError(AUDIO_UNAVAILABLE_MESSAGE));
  }, [player]);

  const setTempo = useCallback(
    (value: number): void => {
      const next = clampTempo(value);
      player.setTempo(next);
      setBpm(next);
    },
    [player],
  );

  // Reads the engine's own tempo, which the speed trainer may have changed since the last render.
  const nudgeTempo = useCallback(
    (delta: number): void => setTempo(player.tempo + delta),
    [player, setTempo],
  );

  const setTaal = useCallback(
    (key: TaalKey): void => {
      player.setTaal(key);
      setTaalKey(key);
    },
    [player],
  );

  const setVolume = useCallback(
    (value: number): void => {
      const next = clamp(value, 0, 1);
      player.setVolume(next);
      setVolumeState(next);
    },
    [player],
  );

  const applySpeedTrainer = useCallback(
    (next: SpeedTrainerState): void => {
      player.setSpeedTrainer(next.enabled ? next.target : null);
      setSpeedTrainerState(next);
    },
    [player],
  );

  const setSpeedTrainerEnabled = useCallback(
    (enabled: boolean): void => applySpeedTrainer({ ...speedTrainer, enabled }),
    [applySpeedTrainer, speedTrainer],
  );

  const setSpeedTrainerTarget = useCallback(
    (value: number): void => applySpeedTrainer({ ...speedTrainer, target: clampTempo(value) }),
    [applySpeedTrainer, speedTrainer],
  );

  return {
    isPlaying,
    bpm,
    taalKey,
    volume,
    speedTrainer,
    error,
    toggle,
    setTempo,
    nudgeTempo,
    setTaal,
    setVolume,
    setSpeedTrainerEnabled,
    setSpeedTrainerTarget,
  };
}
