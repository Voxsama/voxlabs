"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AudioLines, CheckSquare, Download, Globe, HardDrive, History, Layers, Mic, Timer, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/Logo";

/** One landing card. `wide` spans two columns so the two longest lines can breathe. */
const FEATURES: { Icon: LucideIcon; title: string; body: string; wide?: boolean }[] = [
  {
    Icon: HardDrive,
    title: "Local by design",
    body: "Projects, text and audio never leave your machine. Runs on Windows, macOS and Linux.",
  },
  {
    Icon: Layers,
    title: "Projects → chapters → paragraphs",
    body: "The ElevenLabs Studio structure: reorder chapters, rename, and edit line by line.",
  },
  {
    Icon: AudioLines,
    title: "Cartesia Sonic 3.6 voices",
    body: "Native voices, per-line speed, volume and emotion, and a shared voice library with previews.",
  },
  {
    Icon: Timer,
    title: "Pause lines",
    body: "Lines of <break time=\"1s\" /> tags become pause rows — silence added locally, free.",
  },
  {
    Icon: History,
    title: "Keep every take",
    body: "Every regeneration is stored. Play older takes and switch back to any of them.",
  },
  {
    Icon: CheckSquare,
    title: "Bulk operations",
    body: "Select lines, delete them all at once, or set the voice for many lines in one step.",
    wide: true,
  },
  {
    Icon: Mic,
    title: "Clone a voice",
    body: "Turn a few minutes of a recording into a usable clone, right in the app.",
  },
  {
    Icon: Download,
    title: "Export for any player",
    body: "WAV, MP3, FLAC, OGG, Opus, or M4B chapters ready for audiobook apps.",
  },
  {
    Icon: Globe,
    title: "40+ languages",
    body: "Hindi, English, Japanese, Spanish and more — Cartesia voices per language.",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => {
        setChecked(true);
        setSignedIn(Boolean(j.user));
        // Signed-in users land in the studio, not on the marketing page: give it a paint first.
        if (j.user) t = setTimeout(() => router.replace("/projects"), 600);
      })
      .catch(() => setChecked(true));
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div className="h-full overflow-auto px-8 py-7">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center gap-4">
          <Logo className="h-9 w-auto" />
          <span className="chip">local · Windows / macOS / Linux</span>
        </div>

        <h1 className="mt-6 text-[26px] font-bold tracking-tight">The audiobook studio that lives on your machine</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-neutral-400">
          Write chapters, generate them line by line with Cartesia Sonic 3.6 voices, keep every take, and export
          player-ready audio. No cloud, no accounts on the service side — just your text and your voices.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link className="btn btn-primary" href="/projects">
            Open your projects
          </Link>
          {checked && !signedIn && (
            <Link className="btn" href="/login">
              Sign in
            </Link>
          )}
        </div>

        <div className="mt-7 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {FEATURES.map(({ Icon, title, body, wide }) => (
            <div key={title} className={`card p-4 ${wide ? "sm:col-span-2" : ""}`}>
              <div className="flex items-center gap-2">
                <Icon size={16} className="shrink-0 text-neutral-400" aria-hidden />
                <h2 className="text-sm font-semibold">{title}</h2>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-5 text-neutral-400">{body}</p>
            </div>
          ))}
        </div>

        <p className="mt-6 text-xs text-neutral-500">
          Generation uses Cartesia credits — the app tracks spend per project and per user.{" "}
          <Link className="text-neutral-400 hover:text-neutral-200" href="/login">
            Sign in to start generating.
          </Link>
        </p>
      </div>
    </div>
  );
}
