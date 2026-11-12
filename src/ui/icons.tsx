/** Inline line icons (no icon font or network asset). */
import type { JSX } from "react";

const S = (d: JSX.Element) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

export const Icon = {
  lab: S(<><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6A2 2 0 0 0 19 18l-5-9V3" /><path d="M7.5 14h9" /></>),
  dna: S(<><path d="M7 3c0 6 10 6 10 12s-10 6-10 6" /><path d="M17 3c0 6-10 6-10 12" /><path d="M8 7h8M8 17h8M9.5 12h5" /></>),
  speak: S(<><path d="M4 12a8 8 0 0 1 8-8 8 8 0 0 1 8 8 8 8 0 0 1-8 8H4l2-3" /><path d="M9 10v4M12 8v8M15 10v4" /></>),
  studio: S(<><path d="M9 18V6l11-2v12" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>),
  vault: S(<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="12" cy="12" r="3.5" /><path d="M12 8.5V7M12 17v-1.5M15.5 12H17M7 12h1.5" /></>),
  play: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>,
  stop: <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>,
  save: S(<><path d="M5 3h11l3 3v15H5z" /><path d="M8 3v5h8V3M8 21v-7h8v7" /></>),
  share: S(<><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 10.5l6.8-4M8.6 13.5l6.8 4" /></>),
  edit: S(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></>),
  mic: S(<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>),
  dice: S(<><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1" fill="currentColor" /><circle cx="15" cy="15" r="1" fill="currentColor" /><circle cx="15" cy="9" r="1" fill="currentColor" /><circle cx="9" cy="15" r="1" fill="currentColor" /></>),
  wand: S(<><path d="M4 20L16 8M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 11l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z" /></>),
  trash: S(<><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>),
  info: S(<><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>),
  back: S(<path d="M15 5l-7 7 7 7" />),
  undo: S(<><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>),
  rotate: S(<><path d="M20 12a8 8 0 1 1-2.3-5.7L20 8" /><path d="M20 3v5h-5" /></>),
  copy: S(<><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>),
};

export function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 64 64">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0fb47e" />
          <stop offset="1" stopColor="#6d4aff" />
        </linearGradient>
      </defs>
      <path d="M22 6h20M26 6v16L12 48a6 6 0 0 0 5.3 9h29.4A6 6 0 0 0 52 48L38 22V6" fill="none" stroke="url(#lg)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 40c4-3 8 3 14 0s9-3 14 0l4 8a6 6 0 0 1-5 9H19a6 6 0 0 1-5-9z" fill="url(#lg)" opacity="0.85" />
      <circle cx="27" cy="47" r="2.6" fill="#ffffff" />
      <circle cx="37" cy="47" r="2.6" fill="#ffffff" />
      <path d="M28 52l2 2 2-2 2 2 2-2" stroke="#ffffff" strokeWidth="1.6" fill="none" />
    </svg>
  );
}
