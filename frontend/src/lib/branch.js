import { useEffect, useState } from 'react';

const KEY = 'clinovara.location';
const EVT = 'clinovara:location';

export function getBranch() { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } }
export function setBranch(id) { try { localStorage.setItem(KEY, id || ''); } catch { /* ignore */ } window.dispatchEvent(new Event(EVT)); }

/** Global branch filter ('' = all branches). Stored per browser so a front desk stays on its own branch. */
export function useBranch() {
  const [b, setB] = useState(getBranch());
  useEffect(() => { const on = () => setB(getBranch()); window.addEventListener(EVT, on); window.addEventListener('storage', on); return () => { window.removeEventListener(EVT, on); window.removeEventListener('storage', on); }; }, []);
  return [b, setBranch];
}
export const q = (branch, extra = '') => (branch ? `locationId=${encodeURIComponent(branch)}${extra ? '&' + extra : ''}` : extra);
