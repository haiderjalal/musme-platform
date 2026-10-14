"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AudioOutput } from "../engine/audio-output";
import { createTanpuraDrone, DEFAULT_DRONE_VOLUME, type TanpuraDrone } from "../engine/drone";
import { AUDIO_UNAVAILABLE_MESSAGE } from "../engine/messages";
import { saFrequencyHz } from "../engine/notes";
import { clamp } from "../engine/numeric";

export interface UseTanpuraDroneResult {
  readonly isOn: boolean;
  readonly volume: number;
  readonly error: string | null;
  readonly toggle: () => void;
  readonly setVolume: (value: number) => void;
}

/** Owns the drone. Changing Sa while it plays retunes it by restarting with the new pitch. */
export function useTanpuraDrone(output: AudioOutput, saPitchClass: number): UseTanpuraDroneResult {
  const droneRef = useRef<TanpuraDrone | null>(null);
  const pendingRef = useRef(false);
  const volumeRef = useRef(DEFAULT_DRONE_VOLUME);
  const [isOn, setIsOn] = useState(false);
  const [volume, setVolumeState] = useState(DEFAULT_DRONE_VOLUME);
  const [error, setError] = useState<string | null>(null);

  const startDrone = useCallback(
    (pitchClass: number): void => {
      const { context, destination } = output.session();
      droneRef.current?.stop();
      const drone = createTanpuraDrone(context, destination, saFrequencyHz(pitchClass));
      drone.setVolume(volumeRef.current);
      drone.start();
      droneRef.current = drone;
    },
    [output],
  );

  const stopDrone = useCallback((): void => {
    droneRef.current?.stop();
    droneRef.current = null;
    setIsOn(false);
  }, []);

  const toggle = useCallback((): void => {
    if (droneRef.current || pendingRef.current) {
      pendingRef.current = false;
      stopDrone();
      return;
    }

    pendingRef.current = true;
    setError(null);
    output
      .resume()
      .then(() => {
        // The user may have stopped the drone while the audio device was starting.
        if (!pendingRef.current) return;
        pendingRef.current = false;
        startDrone(saPitchClass);
        setIsOn(true);
      })
      .catch(() => {
        pendingRef.current = false;
        setError(AUDIO_UNAVAILABLE_MESSAGE);
      });
  }, [output, saPitchClass, startDrone, stopDrone]);

  useEffect(() => {
    if (droneRef.current) startDrone(saPitchClass);
  }, [saPitchClass, startDrone]);

  // Clears a start that is still waiting on the audio device, so it cannot begin after unmount.
  useEffect(() => {
    const pending = pendingRef;
    return () => {
      pending.current = false;
      stopDrone();
    };
  }, [stopDrone]);

  const setVolume = useCallback((value: number): void => {
    const next = clamp(value, 0, 1);
    volumeRef.current = next;
    droneRef.current?.setVolume(next);
    setVolumeState(next);
  }, []);

  return { isOn, volume, error, toggle, setVolume };
}
