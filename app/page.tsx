"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, History, Layers, Mic } from "lucide-react";

/**
 * The hero illustration: an open book whose pages are formed by flowing sound-wave lines.
 * Pure SVG - concentric mirrored bezier curves fanning out of a bottom-centre spine, violet
 * fading to white, over a soft glow.
 */
function BookWaves({ className }: { className?: string }) {
  const CX = 300;
  const BASE = 300;
  const W = 250; // how far a page reaches sideways
  const H = 260; // how far a page reaches upward

  // Many concentric "pages": the reference shows a dense fan of ~14 mirrored curves.
  // Each is an open arc, high at the outer edge and dipping toward the spine - an open book.
  const arcs = Array.from({ length: 14 }, (_, i) => 1 - i / 15);

  return (
    <svg viewBox="0 0 600 320" className={className} role="img" aria-label="An open book formed from flowing sound waves">
      <defs>
        <radialGradient id="lw-glow" cx="50%" cy="86%" r="60%">
          <stop offset="0%" stopColor="var(--landing-hero-glow)" stopOpacity="0.6" />
          <stop offset="55%" stopColor="var(--landing-hero-glow)" stopOpacity="0.16" />
          <stop offset="100%" stopColor="var(--landing-hero-glow)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lw-wave" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--landing-wave-hot)" stopOpacity="0.95" />
          <stop offset="40%" stopColor="var(--landing-wave)" stopOpacity="0.75" />
          <stop offset="100%" stopColor="var(--landing-wave)" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id="lw-wave-soft" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--landing-wave)" stopOpacity="0.6" />
          <stop offset="100%" stopColor="var(--landing-wave)" stopOpacity="0.05" />
        </linearGradient>
      </defs>

      <ellipse cx={CX} cy={BASE - 4} rx="296" ry="150" fill="url(#lw-glow)" />

      <g fill="none" strokeLinecap="round">
        {arcs.map((k, i) => {
          const dx = W * k + 30; // even the innermost page spreads a little
          const rise = H * Math.pow(k, 0.85);
          // An open page: up from the spine to a rounded top, then down to the far edge.
          const right = `M ${CX} ${BASE} C ${CX + dx * 0.3} ${BASE - rise}, ${CX + dx * 0.72} ${BASE - rise * 0.98}, ${CX + dx} ${BASE - rise * 0.62}`;
          const left = `M ${CX} ${BASE} C ${CX - dx * 0.3} ${BASE - rise}, ${CX - dx * 0.72} ${BASE - rise * 0.98}, ${CX - dx} ${BASE - rise * 0.62}`;
          const stroke = i % 2 === 0 ? "url(#lw-wave)" : "url(#lw-wave-soft)";
          const width = i < 5 ? 1.9 : 1.15;
          return (
            <g key={i} opacity={0.5 + 0.5 * k}>
              <path d={right} stroke={stroke} strokeWidth={width} />
              <path d={left} stroke={stroke} strokeWidth={width} />
            </g>
          );
        })}
      </g>

      {/* The spine and the two page edges catching the light. */}
      <path d={`M ${CX} ${BASE} C ${CX + 5} ${BASE - 60}, ${CX + 9} ${BASE - 120}, ${CX + 5} ${BASE - 168}`} fill="none" stroke="var(--landing-wave-hot)" strokeOpacity="0.55" strokeWidth="1.6" />
      <path d={`M ${CX} ${BASE} C ${CX - 5} ${BASE - 60}, ${CX - 9} ${BASE - 120}, ${CX - 5} ${BASE - 168}`} fill="none" stroke="var(--landing-wave-hot)" strokeOpacity="0.3" strokeWidth="1.6" />
    </svg>
  );
}

/** Chapter editor: three rows with drag handles and durations, the middle one selected. */
function ChapterEditorArt({ className }: { className?: string }) {
  const rows = [
    { name: "Chapter 1", time: "12:36", on: false },
    { name: "Chapter 2", time: "18:04", on: true },
    { name: "Chapter 3", time: "14:27", on: false },
  ];
  return (
    <svg viewBox="0 0 300 132" className={className} role="img" aria-label="Chapter list with drag handles and durations">
      {rows.map((r, i) => {
        const y = 8 + i * 40;
        return (
          <g key={r.name}>
            <rect x="12" y={y} width="276" height="32" rx="7" fill={r.on ? "var(--landing-art-sel)" : "var(--landing-art-row)"} stroke={r.on ? "var(--landing-art-sel-line)" : "var(--landing-art-line)"} strokeWidth="1" />
            {[0, 1, 2].map((d) => (
              <g key={d} fill="var(--landing-art-ink)">
                <circle cx={26 + (d % 2) * 4} cy={y + 12 + Math.floor(d / 2) * 5} r="1.1" />
                <circle cx={26 + (d % 2) * 4} cy={y + 12 + Math.floor(d / 2) * 5 + 4} r="1.1" />
              </g>
            ))}
            <text x="40" y={y + 20} fontSize="12" fontWeight="600" fill="var(--landing-art-ink)" fontFamily="var(--font-body)">{r.name}</text>
            <text x="278" y={y + 20} fontSize="11" textAnchor="end" fill="var(--landing-art-muted)" fontFamily="var(--font-body)">{r.time}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Voice library: a play button beside a waveform. */
function VoiceLibraryArt({ className }: { className?: string }) {
  const bars = [8, 16, 26, 14, 34, 22, 40, 18, 30, 12, 36, 20, 28, 44, 24, 32, 14, 26, 18, 38, 22, 30, 12, 24, 16, 20, 10, 14];
  return (
    <svg viewBox="0 0 300 132" className={className} role="img" aria-label="A play button next to a voice waveform">
      <rect x="10" y="26" width="280" height="80" rx="10" fill="var(--landing-art-row)" stroke="var(--landing-art-line)" strokeWidth="1" />
      <circle cx="46" cy="66" r="17" fill="var(--landing-art-sel)" />
      <path d="M41 58 L55 66 L41 74 Z" fill="var(--landing-art-ink)" />
      {bars.map((h, i) => (
        <rect key={i} x={78 + i * 7} y={66 - h / 2} width="3" height={h} rx="1.5" fill="var(--landing-art-accent)" fillOpacity={0.55 + (i % 3) * 0.15} />
      ))}
    </svg>
  );
}

/** Audio export: a file icon with a waveform, plus format chips. */
function AudioExportArt({ className }: { className?: string }) {
  const bars = [10, 20, 14, 24, 8, 18];
  return (
    <svg viewBox="0 0 300 132" className={className} role="img" aria-label="An audio file next to WAV, MP3 and M4B format chips">
      <path d="M18 14 h44 l16 16 v72 a6 6 0 0 1 -6 6 h-54 a6 6 0 0 1 -6 -6 v-82 a6 6 0 0 1 6 -6 z" fill="var(--landing-art-sel)" />
      <path d="M62 14 l16 16 h-16 z" fill="var(--landing-art-sel-line)" />
      <g fill="var(--landing-art-accent)">
        {bars.map((h, i) => (
          <rect key={i} x={30 + i * 7} y={68 - h / 2} width="3" height={h} rx="1.5" />
        ))}
      </g>
      <rect x="104" y="52" width="0.9" height="0.9" fill="none" />
      {["WAV", "MP3", "M4B"].map((f, i) => (
        <g key={f}>
          <rect x={104 + i * 62} y="46" width="54" height="26" rx="7" fill="var(--landing-art-chip)" stroke="var(--landing-art-line)" strokeWidth="1" />
          <text x={131 + i * 62} y="63" fontSize="11.5" fontWeight="600" textAnchor="middle" fill="var(--landing-art-ink)" fontFamily="var(--font-body)">{f}</text>
        </g>
      ))}
    </svg>
  );
}

const TOOLS = [
  {
    Art: ChapterEditorArt,
    title: "Chapter editor",
    body: "Arrange chapters, paragraphs, and pauses.",
  },
  {
    Art: VoiceLibraryArt,
    title: "Voice library",
    body: "Preview Cartesia voices in 40+ languages.",
  },
  {
    Art: AudioExportArt,
    title: "Audio export",
    body: "Export finished chapters for any player.",
  },
];

const STRIP = [
  { Icon: History, label: "Take history" },
  { Icon: Layers, label: "Bulk editing" },
  { Icon: Mic, label: "Voice cloning" },
];

export default function LandingPage() {
  const [signedIn, setSignedIn] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => {
        setChecked(true);
        setSignedIn(Boolean(j.user));
      })
      .catch(() => setChecked(true));
  }, []);

  return (
    <div className="h-full overflow-auto px-7 py-6">
      <div className="mx-auto max-w-[1180px]">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4 border-b border-neutral-800 pb-4 paper:border-neutral-300">
          <span className="text-[19px] font-bold text-neutral-100">Studio overview</span>
          <span className="inline-flex items-center gap-2 text-[13px] text-neutral-400">
            <span className="size-1.5 rounded-full bg-green-500" aria-hidden />
            Local workspace
          </span>
        </div>

        {/* Hero */}
        <section className="relative mt-5 overflow-hidden rounded-[18px] border border-neutral-800 paper:border-neutral-300">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 130% at 78% 96%, color-mix(in srgb, var(--landing-hero-glow) 55%, transparent) 0%, transparent 62%), radial-gradient(90% 120% at 18% 12%, color-mix(in srgb, var(--landing-hero-glow) 28%, transparent) 0%, transparent 58%), linear-gradient(155deg, var(--landing-hero-bg) 0%, #2a1150 58%, #3b1a6b 100%)",
            }}
            aria-hidden
          />
          <div className="relative grid grid-cols-1 items-center gap-6 px-9 py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:px-12 md:py-12">
            <div className="max-w-[30rem]">
              <h1
                className="font-[family-name:var(--font-display)] text-[44px] leading-[1.04] font-semibold tracking-[-0.02em] text-[var(--landing-hero-ink)] md:text-[62px]"
              >
                Your audiobook studio.
              </h1>
              <p className="mt-5 text-[15px] leading-6 text-[var(--landing-hero-muted)]">
                Write chapters, direct every line, and keep every take in one local workspace.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/projects"
                  className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--landing-cta)] px-5 py-2.5 text-[15px] font-semibold text-[var(--landing-cta-ink)] transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Open projects
                  <ArrowRight size={17} aria-hidden />
                </Link>
                {checked && !signedIn && (
                  <Link href="/login" className="text-[14px] text-[var(--landing-hero-muted)] underline-offset-4 hover:underline">
                    Sign in
                  </Link>
                )}
              </div>
            </div>
            <BookWaves className="mx-auto w-full max-w-[520px]" />
          </div>
        </section>

        {/* Tools */}
        <section className="mt-9">
          <h2 className="text-[26px] font-bold text-neutral-100">Studio tools</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            {TOOLS.map(({ Art, title, body }) => (
              <article key={title} className="rounded-[14px] border border-neutral-800 bg-neutral-900 p-4 paper:border-neutral-300 paper:bg-white">
                <Art className="h-[104px] w-full" />
                <h3 className="mt-3 text-[16px] font-bold text-neutral-100">{title}</h3>
                <p className="mt-1 text-[13.5px] leading-5 text-neutral-400">{body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Feature strip */}
        <section
          className="mt-4 flex flex-wrap items-center justify-around gap-y-3 rounded-[14px] px-6 py-4"
          style={{ backgroundColor: "var(--landing-strip)" }}
        >
          {STRIP.map(({ Icon, label }, i) => (
            <div key={label} className="flex items-center gap-2.5">
              {i > 0 && (
                <span className="mr-6 hidden h-6 w-px md:inline-block" style={{ backgroundColor: "var(--landing-strip-div)" }} aria-hidden />
              )}
              <Icon size={17} aria-hidden style={{ color: "var(--landing-strip-ink)" }} />
              <span className="text-[14px] font-semibold" style={{ color: "var(--landing-strip-ink)" }}>
                {label}
              </span>
            </div>
          ))}
        </section>

        <p className="mt-6 text-xs text-neutral-500">
          Generation uses Cartesia credits — the app tracks spend per project and per user.
        </p>
      </div>
    </div>
  );
}
