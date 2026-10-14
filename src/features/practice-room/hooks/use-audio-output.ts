"use client";

import { useEffect, useState } from "react";

import { AudioOutput } from "../engine/audio-output";

/** One AudioOutput per Practice Room. It creates no audio until an engine starts, and closes on unmount. */
export function useAudioOutput(): AudioOutput {
  const [output] = useState(() => new AudioOutput());

  useEffect(() => () => output.close(), [output]);

  return output;
}
