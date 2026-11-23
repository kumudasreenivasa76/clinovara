import React from 'react';
import Logo from '../components/Logo.jsx';

/** Clinic branding for patient-facing screens: one colour and one logo, set in Settings → Branding. */
export const DEFAULT_BRAND = { color: '#2563eb', logo: '', welcome: '' };
export const BRAND_PRESETS = [['#2563eb', 'Blue'], ['#0f766e', 'Teal'], ['#15803d', 'Green'], ['#7c3aed', 'Violet'], ['#be185d', 'Rose'], ['#c2410c', 'Orange'], ['#1e3a8a', 'Navy'], ['#334155', 'Slate']];

const rgb = (hex) => { const h = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : DEFAULT_BRAND.color; return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const hex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Is this colour dark enough for white text on top of it? Used to warn before a clinic picks an unreadable brand colour. */
export function readableOnWhite(color) {
  const lum = rgb(color).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  const L = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
  return 1.05 / (L + 0.05) >= 3.6;
}

/** The staff app's colour variables, re-derived from the clinic's colour. Spread onto the root element of a patient-facing page. */
export function brandVars(branding) {
  const c = rgb(branding?.color); const white = [255, 255, 255]; const black = [0, 0, 0];
  return {
    '--accent': hex(c), '--accent-strong': hex(mix(c, black, 0.18)), '--accent-light': hex(mix(c, white, 0.35)),
    '--accent-soft': hex(mix(c, white, 0.82)), '--accent-softer': hex(mix(c, white, 0.92)),
    '--rail': hex(mix(c, black, 0.55)), '--rail-2': hex(mix(c, black, 0.4)),
  };
}

/** Two letters for a clinic with no logo: "SmileCare Dental" becomes "SD". */
export const monogram = (name) => { const w = String(name || '').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean); return ((w[0]?.[0] || '') + (w.length > 1 ? w[w.length - 1][0] : w[0]?.[1] || '')).toUpperCase() || 'C'; };

/**
 * The clinic's own logo when one is set. Without one, patient screens show the clinic's initials in its
 * colour (pass `name`), and the staff app shows the Clinovara mark.
 */
export function BrandLogo({ branding, name, size = 34, className = '' }) {
  if (branding?.logo) return <span className={`brand-logo-wrap ${className}`} style={{ height: size }}><img src={branding.logo} alt={name ? `${name} logo` : ''} className="brand-logo" style={{ maxHeight: size, maxWidth: size * 3.6 }} /></span>;
  if (name) return <span className={`brand-mono ${className}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.4), background: branding?.color || DEFAULT_BRAND.color }} aria-hidden>{monogram(name)}</span>;
  return <div className={`brand-mark ${className}`}><Logo size={size > 40 ? Math.round(size * 0.7) : undefined} /></div>;
}

/** Up to four strong colours found in a logo, darkest and most used first, so a clinic can match its brand colour in one click. */
export function logoColors(dataUrl, limit = 4) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve([]);
    img.onload = () => {
      try {
        const n = 48; const canvas = document.createElement('canvas'); canvas.width = n; canvas.height = n;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, n, n);
        const px = ctx.getImageData(0, 0, n, n).data; const buckets = new Map();
        for (let i = 0; i < px.length; i += 4) {
          const [r, g, b2, a] = [px[i], px[i + 1], px[i + 2], px[i + 3]];
          if (a < 200) continue;
          const max = Math.max(r, g, b2); const min = Math.min(r, g, b2);
          if (max > 235 && min > 235) continue; // paper white
          if (max - min < 28 && max > 60) continue; // greys carry no brand
          const key = `${r >> 5}-${g >> 5}-${b2 >> 5}`;
          const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 }; e.n += 1; e.r += r; e.g += g; e.b += b2; buckets.set(key, e);
        }
        const out = [...buckets.values()].sort((x, y) => y.n - x.n).map((e) => hex([e.r / e.n, e.g / e.n, e.b / e.n]));
        const picked = [];
        for (const c of out) { const [r1, g1, b1] = rgb(c); if (picked.every((q) => { const [r2, g2, b3] = rgb(q); return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b3) > 90; })) picked.push(c); if (picked.length >= limit) break; }
        resolve(picked.filter((c) => readableOnWhite(c)).concat(picked.filter((c) => !readableOnWhite(c))).slice(0, limit).filter((c, i) => i === 0 || readableOnWhite(c)));
      } catch { resolve([]); }
    };
    img.src = dataUrl;
  });
}

/** Shrinks a chosen image in the browser so the stored logo stays small (at most 320px on its longest side). */
export function fileToLogo(file, max = 320) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) { reject(new Error('That file is not an image we can use. Choose a PNG, JPG, WebP or SVG.')); return; }
    if (file.size > 8 * 1024 * 1024) { reject(new Error('That image is over 8 MB. Choose a smaller file.')); return; }
    if (file.type === 'image/svg+xml' && file.size > 250 * 1024) { reject(new Error('That SVG is over 250 KB. Export a simpler version or use a PNG.')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      if (file.type === 'image/svg+xml') { resolve(reader.result); return; }
      const img = new Image();
      img.onerror = () => reject(new Error('That image could not be opened.'));
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas'); canvas.width = Math.round(img.width * k); canvas.height = Math.round(img.height * k);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
