/** Small shared illustrated pieces: medal emblem, lock, arrow. Pure SVG, coloured through CSS. */

/** A medal: ribbon above a disc, one tier colour (m1 bronze … m4 shift). Tier 0 is an empty socket. */
export function MedalIcon({ tier, className = '' }: { tier: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={`medal-ico m${tier} ${className}`}>
      <path className="ribbon" d="M9 2h6l3 9-6 3-6-5zM23 2h-6l-3 9 6 3 6-5z" />
      <circle className="disc" cx="16" cy="21" r="8.2" />
      <path
        className="gem"
        d={
          tier === 4
            ? 'M16 14.6l2.6 4-2.6 4.4-2.6-4.4z'
            : 'M16 15.4l1.9 3.8 4.1.6-3 2.9.7 4.1-3.7-2-3.7 2 .7-4.1-3-2.9 4.1-.6z'
        }
      />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="lock-ico">
      <path d="M7 10V7a5 5 0 0110 0v3h1.5A1.5 1.5 0 0120 11.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 20.5v-9A1.5 1.5 0 015.5 10zm2.2 0h5.6V7a2.8 2.8 0 00-5.6 0zM12 14.2a1.7 1.7 0 00-.9 3.1V19h1.8v-1.7a1.7 1.7 0 00-.9-3.1z" />
    </svg>
  );
}

export function Arrow() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="arrow-ico">
      <path d="M4 11h12.2l-4.6-4.6L13 5l7 7-7 7-1.4-1.4 4.6-4.6H4z" fill="currentColor" />
    </svg>
  );
}
