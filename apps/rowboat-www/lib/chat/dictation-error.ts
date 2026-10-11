/**
 * Chrome reports a dictation failure only on the speech recognition object,
 * then the microphone button returns to idle. "aborted" is the person
 * stopping dictation, so it stays quiet. Every other code is the explanation
 * they would otherwise never see.
 */
export function dictationErrorMessage(code: string): string | null {
  switch (code) {
    case "aborted":
      return null;
    case "not-allowed":
      return "Microphone access is blocked. Allow the microphone for this site to dictate.";
    case "service-not-allowed":
      return "Dictation is not available in this browser.";
    case "audio-capture":
      return "No microphone was found.";
    case "no-speech":
      return "No speech was heard. Try dictating again.";
    case "network":
      return "Dictation could not reach the speech service. Try again.";
    case "language-not-supported":
      return "This browser cannot dictate in English.";
    default:
      return "Dictation stopped before any text was added.";
  }
}
