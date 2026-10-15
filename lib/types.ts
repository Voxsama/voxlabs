// Shared row/DTO types (client-safe).

export type ParagraphStatus = "idle" | "queued" | "generating" | "done" | "error";

export interface Project {
  id: string;
  name: string;
  description: string;
  voice_id: string | null;
  voice_name: string | null;
  model_id: string;
  language: string;
  speed: number;
  volume: number;
  emotion: string | null;
  sample_rate: number; // 44100 | 48000
  bit_depth: BitDepth;
  paragraph_gap_ms: number;
  created_at: string;
  updated_at: string;
}

/** "16" = pcm_s16le, "32f" = pcm_f32le */
export type BitDepth = "16" | "32f";

export interface ProjectSummary extends Project {
  chapter_count: number;
  paragraph_count: number;
  ready_count: number;
  preview: string | null;
}

export interface Chapter {
  id: string;
  project_id: string;
  name: string;
  position: number;
  voice_id: string | null;
  voice_name: string | null;
  created_at: string;
  updated_at: string;
  paragraph_count: number;
  ready_count: number;
}

export interface Paragraph {
  id: string;
  chapter_id: string;
  position: number;
  text: string;
  is_pause: number;
  voice_id: string | null;
  voice_name: string | null;
  speed: number | null;
  volume: number | null;
  emotion: string | null;
  status: ParagraphStatus;
  error: string | null;
  active_version_id: string | null;
  updated_at: string;
  // From the active audio version (null when never generated):
  active_text: string | null;
  active_duration_ms: number | null;
  active_voice_id: string | null;
  active_settings: string | null; // settings_json of the active version
  version_count: number;
}

export interface AudioVersion {
  id: string;
  paragraph_id: string;
  version_no: number;
  file_path: string;
  duration_ms: number;
  model_id: string;
  voice_id: string;
  text_snapshot: string;
  settings_json: string;
  created_at: string;
}

export interface FavoriteVoice {
  voice_id: string;
  name: string;
  meta_json: string;
  is_cloned: number;
  added_at: string;
}

export type StudioEvent =
  | { type: "paragraph"; paragraph: Paragraph }
  | { type: "chapter"; chapterId: string }
  | { type: "ping" };
