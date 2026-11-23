import Logo from '../components/Logo.jsx';
import { brandVars, BrandLogo } from '../lib/brand.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { IconVolume, IconVolumeOff } from '@tabler/icons-react';
import { get } from '../lib/api.js';

const spell = (token) => String(token).replace(/(\D)(\d)/, '$1 $2').split('').join(' ');

/** Two-note chime. Browsers only allow sound after the screen has been touched once, which the Sound button does. */
function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[880, 0], [660, 0.22]].forEach(([f, at]) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = f; o.type = 'sine'; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at); g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + at + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.5);
      o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.55);
    });
  } catch { /* no audio available */ }
}

/** Waiting-room display, built to be read from across the room: huge tokens, high contrast, type that scales with the screen. */
export default function Board({ locationId }) {
  const [data, setData] = useState(null);
  const [clock, setClock] = useState(new Date());
  const [sound, setSound] = useState(() => { try { return localStorage.getItem('clinovara.boardSound') === '1'; } catch { return false; } });
  const [flash, setFlash] = useState(null);
  const seen = useRef(null);
  useEffect(() => {
    let alive = true;
    const tick = () => get(`/api/arrivals/board${locationId ? `?locationId=${locationId}` : ''}`).then((d) => alive && setData(d)).catch(() => {});
    tick();
    const t = setInterval(tick, 3000);
    const c = setInterval(() => setClock(new Date()), 1000);
    return () => { alive = false; clearInterval(t); clearInterval(c); };
  }, [locationId]);

  // Announce a token the moment it is called.
  useEffect(() => {
    if (!data) return;
    const calling = (data.lanes || []).filter((l) => l.nowServing?.status === 'called').map((l) => ({ token: l.nowServing.token, name: l.nowServing.firstName, dentist: l.provider.name }));
    const keys = new Set(calling.map((c) => c.token));
    if (seen.current) {
      const fresh = calling.find((c) => !seen.current.has(c.token));
      if (fresh) {
        setFlash(fresh.token); setTimeout(() => setFlash((f) => (f === fresh.token ? null : f)), 9000);
        if (sound) { chime(); try { const u = new SpeechSynthesisUtterance(`Token ${spell(fresh.token)}, please come in to ${fresh.dentist}.`); u.rate = 0.9; window.speechSynthesis?.speak(u); } catch { /* speech not available */ } }
      }
    }
    seen.current = keys;
  }, [data]); // eslint-disable-line

  const toggleSound = () => { const next = !sound; setSound(next); try { localStorage.setItem('clinovara.boardSound', next ? '1' : '0'); } catch { /* ignore */ } if (next) chime(); };
  const lanes = (data?.lanes || []).filter((l) => l.nowServing || l.waiting.length);
  const serving = lanes.filter((l) => l.nowServing);
  const waitingLanes = lanes.map((l) => ({ provider: l.provider, queue: l.waiting, busy: !!l.nowServing })).filter((l) => l.queue.length);
  const totalWaiting = waitingLanes.reduce((n, l) => n + l.queue.length, 0);

  return (
    <div className="tv" style={brandVars(data?.branding)}>
      <header className="tv-head">
        <div className="tv-brand"><BrandLogo branding={data?.branding} name={data?.practice} size={56} /><div><div className="tv-title">{data?.practice || 'Clinovara'}</div>{data?.location?.name && <div className="tv-sub">{data.location.name}</div>}</div></div>
        <div className="tv-time"><div className="tv-clock">{clock.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</div><div className="tv-date">{clock.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>
      </header>

      <main className="tv-main">
        <section className="tv-serving" aria-label="Now calling">
          <h2>Now calling</h2>
          {serving.length === 0 && <div className="tv-empty">{totalWaiting ? 'The next patient will be called shortly.' : 'No one is waiting.'}</div>}
          <div className="tv-cards">
            {serving.map((l) => {
              const calling = l.nowServing.status === 'called';
              return (
                <div key={l.provider.id} className={`tv-card ${calling ? 'calling' : 'inchair'} ${flash === l.nowServing.token ? 'flash' : ''}`}>
                  <div className="tv-token">{l.nowServing.token}</div>
                  <div className="tv-card-info">
                    <div className="tv-doc">{l.provider.name}</div>
                    <div className="tv-state">{calling ? (l.nowServing.firstName ? `${l.nowServing.firstName}, please come in` : 'Please come in') : 'In consultation'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="tv-waiting" aria-label="Waiting">
          <h2>Waiting <span>{totalWaiting}</span></h2>
          {waitingLanes.length === 0 && <div className="tv-empty small">No one in the queue.</div>}
          {waitingLanes.map((l) => (
            <div className="tv-wlane" key={l.provider.id}>
              <div className="tv-wdoc">{l.provider.name}</div>
              <div className="tv-chips">{l.queue.slice(0, 8).map((w, i) => <span key={w.token} className={`${w.status === 'ready' ? 'ready' : ''} ${i === 0 && !l.busy ? 'next' : ''}`}>{w.token}</span>)}{l.queue.length > 8 && <em>+{l.queue.length - 8}</em>}</div>
            </div>
          ))}
        </aside>
      </main>

      <footer className="tv-foot">
        <span>Please keep your token number with you. Ask at the front desk if you need help.</span>
        <span>कृपया अपना टोकन नंबर साथ रखें।</span>
        <span>ದಯವಿಟ್ಟು ನಿಮ್ಮ ಟೋಕನ್ ಸಂಖ್ಯೆಯನ್ನು ಜೊತೆಯಲ್ಲಿಡಿ.</span>
        <button className="tv-sound" onClick={toggleSound} aria-pressed={sound}>{sound ? <IconVolume size={22} /> : <IconVolumeOff size={22} />}{sound ? 'Sound on' : 'Sound off'}</button>
      </footer>
    </div>
  );
}
