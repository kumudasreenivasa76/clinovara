import React from 'react';

/** Clinovara mark: a molar crown drawn as two rounded lobes over a single root line, with a check for "seen". */
export default function Logo({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6.5 3.5c1.6 0 2.6.9 3.3 1.6.6.6 1.2.9 2.2.9s1.6-.3 2.2-.9c.7-.7 1.7-1.6 3.3-1.6 2.4 0 4 1.9 4 4.6 0 3.6-2.1 6.9-3.1 10.4-.3 1.2-.9 2.5-2 2.5-1.3 0-1.6-1.4-1.9-2.6-.3-1.3-.8-2.2-2.5-2.2s-2.2.9-2.5 2.2c-.3 1.2-.6 2.6-1.9 2.6-1.1 0-1.7-1.3-2-2.5C4.6 15 2.5 11.7 2.5 8.1c0-2.7 1.6-4.6 4-4.6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8.6 10.3l2.3 2.3 4.6-4.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
