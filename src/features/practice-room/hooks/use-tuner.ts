"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AudioOutput } from "../engine/audio-output";
import type { MicErrorReason } from "../engine/messages";
import { clampReferencePitch, DEFAULT_REFERENCE_PITCH_HZ } from "../engine/notes";
import { MicTuner, openMicTuner } from "../engine/tuner";
import { applyTunerFrame, SILENT_TUNER_READING, type TunerReading } from "../engine/tuning";

export interface UseTunerResult {
  readonly isListening: boolean;
  readonly isOpening: boolean;
  readonly error: MicErrorReason | null;
  readonly reading: TunerReading;
  readonly referencePitchHz: number;
  readonly toggle: () => void;
  readonly setReferencePitch: (hz: number) => void;
}

/**
 * Tuner state. The microphone stays open while listening. Readings reach React only at the
 * throttled tuner rate, never on every audio sample.
 */
export function useTuner(output: AudioOutput, saPitchClass: number): UseTunerResult {
  const [referencePitchHz, setReferencePitchHz] = useState(DEFAULT_REFERENCE_PITCH_HZ);
  const [tuner, setTuner] = useState<MicTuner | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<MicErrorReason | null>(null);
  const [reading, setReading] = useState<TunerReading>(SILENT_TUNER_READING);
  // Each toggle takes a request id, so a microphone that opens after the user has already stopped is closed.
  const requestRef = useRef(0);

  // Releases the microphone on stop, on a replaced tuner, and on unmount.
  useEffect(() => (tuner ? () => tuner.stop() : undefined), [tuner]);

  // A microphone still being requested at unmount must be closed the moment it arrives.
  useEffect(() => {
    const requests = requestRef;
    return () => {
      requests.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!tuner) return undefined;

    let frameId = 0;
    const onFrame = (now: number): void => {
      const frame = tuner.readFrame(now);
      if (frame) {
        setReading((previous) => applyTunerFrame(previous, frame, referencePitchHz, saPitchClass));
      }
      frameId = window.requestAnimationFrame(onFrame);
    };
    frameId = window.requestAnimationFrame(onFrame);
    return () => window.cancelAnimationFrame(frameId);
  }, [tuner, referencePitchHz, saPitchClass]);

  const toggle = useCallback((): void => {
    const requestId = ++requestRef.current;

    if (tuner || isOpening) {
      setIsOpening(false);
      setTuner(null);
      setReading(SILENT_TUNER_READING);
      return;
    }

    setError(null);
    setIsOpening(true);
    void openMicTuner(output).then((result) => {
      if (requestId !== requestRef.current) {
        if (result.ok) result.tuner.stop();
        return;
      }
      setIsOpening(false);
      if (result.ok) {
        setTuner(result.tuner);
      } else {
        setError(result.reason);
      }
    });
  }, [output, tuner, isOpening]);

  const setReferencePitch = useCallback((hz: number): void => {
    setReferencePitchHz(clampReferencePitch(hz));
  }, []);

  return {
    isListening: tuner !== null,
    isOpening,
    error,
    reading,
    referencePitchHz,
    toggle,
    setReferencePitch,
  };
}
