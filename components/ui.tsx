"use client";
import { useEffect } from "react";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/60 p-8" onMouseDown={onClose}>
      <div className={`card w-full ${wide ? "max-w-4xl" : "max-w-lg"} p-5`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn btn-ghost btn-sm" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorText({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return <div className="rounded-md border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-200">{error}</div>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
