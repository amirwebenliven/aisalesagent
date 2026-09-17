/**
 * Small inline SVG glyphs, stroke-based, currentColor. No icon font, no emoji.
 * Sizes default to 16px; pass `size` where a card wants 18.
 */
type P = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export function IconCheck({ size = 14, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 12.5l4.2 4.2L19 7" />
    </svg>
  );
}

export function IconDash({ size = 14, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6 12h12" />
    </svg>
  );
}

export function IconHalf({ size = 14, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconTelegram({ size = 18, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M21 4L3 11.5l6.5 2.2L12 20l3.2-4.6L21 4z" />
      <path d="M9.5 13.7L21 4" />
    </svg>
  );
}

export function IconWhatsApp({ size = 18, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4.5 20l1.2-3.6A8.5 8.5 0 1 1 8.6 19.2L4.5 20z" />
      <path d="M9.3 9.2c.2 1.6 1.9 4 3.9 4.9l1.3-1 1.6.9c-.3 1.3-1.3 1.9-2.4 1.6-2.6-.7-5.2-3.4-5.9-6-.3-1.1.3-2.1 1.6-2.4l.9 1.6-1 .4z" />
    </svg>
  );
}

export function IconGlobe({ size = 18, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M7 6.5h.01M10 6.5h.01" />
    </svg>
  );
}

export function IconInstagram({ size = 18, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="4" y="4" width="16" height="16" rx="4.5" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="M16.8 7.2h.01" />
    </svg>
  );
}

export function IconMessenger({ size = 18, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3.5c-4.8 0-8.5 3.5-8.5 7.9 0 2.5 1.2 4.7 3.1 6.1V21l3-1.7c.8.2 1.6.3 2.4.3 4.8 0 8.5-3.5 8.5-7.9S16.8 3.5 12 3.5z" />
      <path d="M7.5 13.5l3-3.2 2.5 2.2 3.5-3.5" />
    </svg>
  );
}

export function IconMail({ size = 18, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </svg>
  );
}

export function IconBadge({ size = 18, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3l2.2 1.6 2.7-.3 1 2.5 2.4 1.3-.5 2.7 1.6 2.2-1.6 2.2.5 2.7-2.4 1.3-1 2.5-2.7-.3L12 21l-2.2-1.6-2.7.3-1-2.5-2.4-1.3.5-2.7L2.6 12l1.6-2.2-.5-2.7 2.4-1.3 1-2.5 2.7.3L12 3z" />
      <path d="M8.8 12.2l2.2 2.2 4.3-4.6" />
    </svg>
  );
}

export function IconArrow({ size = 14, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconGitHub({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 .5C5.7.5.6 5.6.6 12c0 5.1 3.3 9.4 7.8 10.9.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.5-.3-5.2-1.3-5.2-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.1 1.2a10.7 10.7 0 0 1 5.7 0c2.2-1.5 3.1-1.2 3.1-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.2 5.7.4.4.8 1.1.8 2.1v3.2c0 .3.2.7.8.6 4.5-1.5 7.8-5.8 7.8-10.9C23.4 5.6 18.3.5 12 .5z" />
    </svg>
  );
}
