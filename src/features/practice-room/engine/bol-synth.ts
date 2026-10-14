import { playClick, playTone, type AudioSink } from "./audio-primitives";
import type { BolName } from "./taals";

type BolRecipe = (sink: AudioSink, when: number, accent: number) => void;

// Synthesised stand-ins for recorded bols. Production uses licensed or recorded samples.
const BOL_RECIPES: Readonly<Record<BolName, BolRecipe>> = {
  dha: (sink, when, accent) => {
    playTone(sink, when, { freq: 120, freqEnd: 55, dur: 0.45, vol: 0.9 * accent });
    playTone(sink, when, { freq: 330, dur: 0.22, vol: 0.3 * accent, type: "triangle" });
    playClick(sink, when, 0.2 * accent);
  },
  dhin: (sink, when, accent) => {
    playTone(sink, when, { freq: 420, freqEnd: 380, dur: 0.5, vol: 0.6 * accent });
    playClick(sink, when, 0.14 * accent);
  },
  ge: (sink, when, accent) => {
    playTone(sink, when, { freq: 95, freqEnd: 70, dur: 0.25, vol: 0.55 * accent });
  },
  na: (sink, when, accent) => {
    playTone(sink, when, { freq: 640, freqEnd: 600, dur: 0.14, vol: 0.45 * accent });
    playClick(sink, when, 0.12 * accent);
  },
};

export function playBol(sink: AudioSink, bol: BolName, when: number, accent: number): void {
  BOL_RECIPES[bol](sink, when, accent);
}
