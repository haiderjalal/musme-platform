/** Typed reasons the microphone could not be opened. The UI maps each one to copy. */
export type MicErrorReason = "unsupported" | "denied" | "no-device" | "failed";

export const MIC_ERROR_MESSAGES: Readonly<Record<MicErrorReason, string>> = {
  unsupported: "This browser cannot open a microphone.",
  denied: "Microphone access is blocked. Allow it in your browser settings to use the tuner.",
  "no-device": "No microphone was found. Connect one and try again.",
  failed: "The microphone could not be opened. Close other apps that use it and try again.",
};

export const AUDIO_UNAVAILABLE_MESSAGE =
  "Audio could not start. Check your output device and try again.";
