import Logo from '../components/Logo.jsx';
import React, { useEffect, useState } from 'react';
import { IconDental } from '@tabler/icons-react';
import { get } from '../lib/api.js';

/** Waiting-room display: one lane per dentist with the token being served and who is next. Refreshes every 4 seconds. */
export default function Board({ locationId }) {
  const [data, setData] = useState(null);
  const [clock, setClock] = useState(new Date());
  useEffect(() => {
    let alive = true;
    const tick = () => get(`/api/arrivals/board${locationId ? `?locationId=${locationId}` : ''}`).then((d) => alive && setData(d)).catch(() => {});
    tick();
    const t = setInterval(tick, 4000);
    const c = setInterval(() => setClock(new Date()), 1000);
    return () => { alive = false; clearInterval(t); clearInterval(c); };
  }, [locationId]);
  const lanes = (data?.lanes || []).filter((l) => l.nowServing || l.waiting.length || l.done);
  return (
    <div className="board">
      <div className="board-head">
        <div className="row"><div className="brand-mark" style={{ width: 44, height: 44 }}><Logo size={28} /></div><div><div className="board-title">{data?.practice || 'Clinovara'}</div><div className="board-sub">{data?.location?.name ? `${data.location.name} branch` : 'Waiting room'}</div></div></div>
        <div className="board-clock">{clock.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</div>
      </div>
      {lanes.length === 0 && <div className="board-empty">No patients waiting right now.</div>}
      <div className="board-lanes">
        {lanes.map((l) => (
          <div className="board-lane" key={l.provider.id}>
            <div className="board-doc">{l.provider.name}<span>{l.provider.specialty}</span></div>
            <div className={`board-now ${l.nowServing ? '' : 'idle'}`}>
              <div className="board-label">{l.nowServing ? (l.nowServing.status === 'called' ? 'Now calling' : 'In chair') : 'Next up'}</div>
              <div className="board-token">{l.nowServing ? l.nowServing.token : (l.waiting[0]?.token || '—')}</div>
              {l.nowServing?.status === 'called' && l.nowServing.firstName && <div className="board-name">{l.nowServing.firstName}, please come in</div>}
            </div>
            <div className="board-next">
              <div className="board-label">Waiting</div>
              <div className="board-queue">{(() => { const q = (l.nowServing ? l.waiting : l.waiting.slice(1)).slice(0, 6); return q.length ? q.map((w) => <span key={w.token} className={w.status === 'ready' ? 'ready' : ''}>{w.token}</span>) : <span className="faint" style={{ fontSize: 16, background: 'transparent' }}>Nobody waiting</span>; })()}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="board-foot">Please keep your token number handy. If you need help, ask at the front desk. · कृपया अपना टोकन नंबर तैयार रखें। · ದಯವಿಟ್ಟು ನಿಮ್ಮ ಟೋಕನ್ ಸಂಖ್ಯೆ ಸಿದ್ಧವಾಗಿಟ್ಟುಕೊಳ್ಳಿ.</div>
    </div>
  );
}
