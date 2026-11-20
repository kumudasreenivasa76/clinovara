import React, { useId } from 'react';

/** Clinovara mark: the blue gradient "C" around a tooth, with the green "live" dot and signal arc (same as /brand/clinovara-mark.svg). */
export default function Logo({ size = 22 }) {
  const gid = `cvm-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#60A5FA" /><stop offset="1" stopColor="#2563EB" /></linearGradient>
      </defs>
      <path d="M48.85 17.86 A22 22 0 1 0 48.85 46.14" stroke={`url(#${gid})`} strokeWidth="8" strokeLinecap="round" />
      <path d="M30 22 C27 22 24 25 24 29 C24 32 26 33 27 37 C28 41 28.5 43 30 43 C31.5 43 31.5 38 32 38 C32.5 38 32.5 43 34 43 C35.5 43 36 41 37 37 C38 33 40 32 40 29 C40 25 37 22 34 22 C33 22 32.5 23 32 23 C31.5 23 31 22 30 22 Z" fill="#2563EB" />
      <circle cx="53" cy="32" r="4.5" fill="#34D399" />
      <path d="M59.8 20.76 A30 30 0 0 1 59.8 43.24" stroke="#93C5FD" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}
