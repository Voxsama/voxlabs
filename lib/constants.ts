// Shared, client-safe constants.

export const MODELS = [
  { id: "sonic-3.6", label: "Sonic 3.6 (latest)" },
  { id: "sonic-3.6-2026-08-27", label: "Sonic 3.6 (pinned 2026-08-27)" },
  { id: "sonic-3.5", label: "Sonic 3.5" },
  { id: "sonic-3", label: "Sonic 3" },
  { id: "sonic-preview", label: "Sonic preview (beta)" },
];

export const LANGUAGES: { code: string; name: string }[] = [
  ["hi", "Hindi"], ["en", "English"], ["bn", "Bengali"], ["ta", "Tamil"], ["te", "Telugu"],
  ["mr", "Marathi"], ["gu", "Gujarati"], ["kn", "Kannada"], ["ml", "Malayalam"], ["pa", "Punjabi"],
  ["or", "Odia"], ["ur", "Urdu"], ["fr", "French"], ["de", "German"], ["es", "Spanish"],
  ["pt", "Portuguese"], ["zh", "Chinese"], ["ja", "Japanese"], ["it", "Italian"], ["ko", "Korean"],
  ["nl", "Dutch"], ["pl", "Polish"], ["ru", "Russian"], ["sv", "Swedish"], ["tr", "Turkish"],
  ["tl", "Tagalog"], ["bg", "Bulgarian"], ["ro", "Romanian"], ["ar", "Arabic"], ["cs", "Czech"],
  ["el", "Greek"], ["fi", "Finnish"], ["hr", "Croatian"], ["ms", "Malay"], ["sk", "Slovak"],
  ["da", "Danish"], ["uk", "Ukrainian"], ["hu", "Hungarian"], ["no", "Norwegian"],
  ["vi", "Vietnamese"], ["th", "Thai"], ["he", "Hebrew"], ["ka", "Georgian"], ["id", "Indonesian"],
].map(([code, name]) => ({ code, name }));

/** Emotions supported by generation_config.emotion (best results with the first six). English only. */
export const EMOTIONS = [
  "neutral", "calm", "angry", "content", "sad", "scared",
  "happy", "excited", "curious", "peaceful", "grateful", "sympathetic", "mysterious",
  "frustrated", "disappointed", "nostalgic", "hesitant", "confident", "determined", "contemplative",
];

export const SAMPLE_RATES = [
  { value: 44100, label: "44.1 kHz" },
  { value: 48000, label: "48 kHz" },
];

export const BIT_DEPTHS = [
  { value: "16", label: "16-bit" },
  { value: "32f", label: "32-bit float" },
] as const;

/** Cartesia generation_config ranges. */
export const SPEED_RANGE = { min: 0.6, max: 1.5 };
export const VOLUME_RANGE = { min: 0.5, max: 2 };

export const MAX_PARAGRAPH_CHARS = 1500;
