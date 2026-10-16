/** Voxlabs wordmark: the "o" is drawn as sound rings. System fonts only. Colours follow the theme. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 17 146 32" role="img" aria-label="Voxlabs" className={`text-neutral-100 ${className ?? ""}`}>
      <text x="0" y="48" fontFamily="system-ui, sans-serif" fontSize="40" fontWeight="700" fill="currentColor">v</text>
      <g fill="none" stroke="var(--logo-accent)" strokeWidth="3">
        <circle cx="35.5" cy="37.5" r="4" />
        <circle cx="35.5" cy="37.5" r="9" opacity=".6" />
      </g>
      <text x="48" y="48" fontFamily="system-ui, sans-serif" fontSize="40">
        <tspan fontWeight="700" fill="currentColor">x</tspan>
        <tspan fontWeight="300" fill="var(--logo-accent)">labs</tspan>
      </text>
    </svg>
  );
}
