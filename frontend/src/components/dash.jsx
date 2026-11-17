import React, { useState } from 'react';
import { IconChevronRight } from '@tabler/icons-react';
import { Pill } from './ui.jsx';
import { fmtTime, dayKey as clinicDay, todayKey, addDaysKey, getLocale } from '../lib/format.js';

/** Shared pieces for the role dashboards. Flat, tabular, and built from the app's own stat strip, cards and tables. */

export const firstName = (n) => String(n || '').replace(/^(dr|mr|mrs|ms)\.?\s+/i, '').split(' ')[0];
export const dayKey = (iso) => clinicDay(iso);
export const lastDays = (n) => { const t = todayKey(); return Array.from({ length: n }, (_, i) => addDaysKey(t, i - (n - 1))); };
export const nameOf = (p) => (p ? `${p.firstName} ${p.lastName || ''}`.trim() : 'Walk-in');
export const longDate = () => new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: getLocale().timezone || undefined });

/** Title on the left, the few actions this role uses on the right. No greeting, no decoration. */
export function PageHeader({ title, sub, actions }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {actions && <div className="row gap-8 wrap">{actions}</div>}
    </div>
  );
}

/** Change against the previous period. `invert` flips the colour for measures where lower is better. */
export function Delta({ cur, prev, invert = false, label }) {
  let body;
  if (!prev && !cur) body = <span className="muted">No change</span>;
  else if (!prev) body = <span className="delta flat">New</span>;
  else {
    const pct = Math.round(((cur - prev) / prev) * 100);
    const good = pct === 0 ? null : (pct > 0) !== invert;
    body = <span className={`delta ${pct === 0 ? 'flat' : good ? 'up' : 'down'}`}>{pct > 0 ? '▲' : pct < 0 ? '▼' : '–'} {Math.abs(pct)}%</span>;
  }
  return <span className="row gap-6">{body}{label && <span className="muted">{label}</span>}</span>;
}

const DOT = { completed: 'good', in_chair: 'accent', arrived: 'accent', checking_in: 'accent', no_show: 'bad', cancelled: 'bad' };
/** Appointments as a table, with a marker row where "now" falls so the next patient sits right under it. */
export function ApptTable({ appts, showDentist = true, action, empty = 'No appointments.' }) {
  const now = Date.now();
  const rows = [...appts].sort((a, b) => a.start.localeCompare(b.start));
  const nowIdx = rows.findIndex((a) => new Date(a.start).getTime() > now);
  if (!rows.length) return <div className="empty small">{empty}</div>;
  const cols = 4 + (showDentist ? 1 : 0) + (action ? 1 : 0);
  return (
    <table className="table appt-table">
      <thead><tr><th style={{ width: 84 }}>Time</th><th>Patient</th><th>Treatment</th>{showDentist && <th>Dentist</th>}<th>Status</th>{action && <th />}</tr></thead>
      <tbody>
        {rows.map((a, i) => (
          <React.Fragment key={a.id}>
            {i === nowIdx && <tr className="now-row"><td colSpan={cols}><span>{fmtTime(new Date().toISOString())} now</span></td></tr>}
            <tr className={a.status === 'completed' ? 'done' : ''}>
              <td className="mono">{fmtTime(a.start)}</td>
              <td><span className="strong">{nameOf(a.patient)}</span>{a.packetStatus && a.packetStatus !== 'complete' && a.status !== 'completed' && <span className="tiny muted"> · forms incomplete</span>}</td>
              <td className="muted">{a.visitType?.name}</td>
              {showDentist && <td className="muted">{a.provider?.name}</td>}
              <td><Pill status={a.status} /></td>
              {action && <td style={{ textAlign: 'right' }}>{action(a)}</td>}
            </tr>
          </React.Fragment>
        ))}
        {nowIdx === -1 && <tr className="now-row"><td colSpan={cols}><span>End of day</span></td></tr>}
      </tbody>
    </table>
  );
}

/** Open items: one line each, count on the right, a coloured dot only for the ones that are urgent. */
export function ActionList({ items, empty = 'No open items.' }) {
  if (!items.length) return <div className="empty small">{empty}</div>;
  return (
    <div className="action-list">
      {items.map(([n, text, to, level]) => (
        <a key={text} href={to} className="action-item">
          <span className={`sev ${level || ''}`} />
          <span className="grow">{text}</span>
          <b>{n}</b>
          <IconChevronRight size={14} className="muted" />
        </a>
      ))}
    </div>
  );
}

/** Daily bars with a readout line above, so the exact figure for the hovered day is always printed. */
export function DayBars({ days, series, format = (v) => v, unit }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...series);
  const idx = hover ?? series.length - 1;
  const W = 720; const H = 140; const gap = 6; const bw = (W - gap * (series.length - 1)) / series.length;
  const at = (d) => new Date(`${d}T12:00:00Z`);
  return (
    <div>
      <div className="bars-read"><b>{format(series[idx])}</b><span className="muted"> {unit} on {at(days[idx]).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</span></div>
      <svg viewBox={`0 0 ${W} ${H + 20}`} width="100%" role="img" aria-label={`${unit} per day, last ${series.length} days`} onMouseLeave={() => setHover(null)}>
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--border-strong)" />
        {series.map((v, i) => {
          const h = Math.max(v ? 3 : 0, (v / max) * (H - 6)); const x = i * (bw + gap);
          return (<g key={days[i]} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}>
            <rect x={x - gap / 2} y="0" width={bw + gap} height={H + 20} fill="transparent" />
            <rect x={x} y={H - h} width={bw} height={h} rx="2" fill="var(--accent)" opacity={i === idx ? 1 : 0.4} />
            <text x={x + bw / 2} y={H + 15} textAnchor="middle" fontSize="10.5" fill="var(--muted)">{at(days[i]).getUTCDate()}</text>
          </g>);
        })}
      </svg>
    </div>
  );
}

/** One horizontal bar per person with the figure printed beside the name. */
export function LoadBars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="col gap-12">
      {rows.map((r) => <div key={r.label}>
        <div className="row between small"><span>{r.label}</span><span className="mono">{r.text ?? r.value}</span></div>
        <div className="loadbar"><i style={{ width: `${(r.value / max) * 100}%` }} /></div>
      </div>)}
    </div>
  );
}

export { DOT };

/* ---- Charts for the owner dashboard. One hue for magnitude; status colours only with a label. ---- */

/** Small trend line with the latest point marked. */
export function Spark({ values, label, width = 96, height = 30 }) {
  const pad = 3; const max = Math.max(1, ...values); const min = Math.min(0, ...values);
  const x = (i) => pad + (i / Math.max(1, values.length - 1)) * (width - pad * 2);
  const y = (v) => height - pad - ((v - min) / (max - min || 1)) * (height - pad * 2);
  const pts = values.map((v, i) => `${x(i)},${y(v)}`); const last = values.length - 1;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: ${values.join(', ')}`}>
      <polygon points={`${x(0)},${height - pad} ${pts.join(' ')} ${x(last)},${height - pad}`} fill="var(--accent)" opacity="0.1" />
      <polyline points={pts.join(' ')} fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last])} r="3" fill="var(--accent)" stroke="var(--surface)" strokeWidth="1.5" />
    </svg>
  );
}

/** A metric tile: label, big number, change against the previous period, and a trend line. */
export function MetricTile({ label, value, cur, prev, invert, series, hint, unitLabel }) {
  return (
    <div className="mtile">
      <div className="mtile-label">{label}</div>
      <div className="mtile-row"><div className="mtile-value">{value}</div>{series && series.some((v) => v > 0) && <Spark values={series} label={unitLabel || label} />}</div>
      <div className="mtile-foot">{cur !== undefined && <Delta cur={cur} prev={prev} invert={invert} />}{hint && <span className="muted">{hint}</span>}</div>
    </div>
  );
}

/** Daily line/area chart with hover crosshair, a printed readout and a labelled last point. */
export function TrendChart({ days, values, format = (v) => v, unit, total = true }) {
  const [hover, setHover] = useState(null);
  const W = 760; const H = 220; const L = 44; const R = 12; const T = 12; const B = 26;
  const rawMax = Math.max(0, ...values); const max = Math.max(1, rawMax); const nice = Math.pow(10, Math.floor(Math.log10(max))); const top = rawMax === 0 ? 4 : Math.ceil(max / nice) * nice;
  const x = (i) => L + (i / Math.max(1, values.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - v / top) * (H - T - B);
  const pts = values.map((v, i) => [x(i), y(v)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
  const idx = hover ?? values.length - 1;
  const sumAll = values.reduce((a, b) => a + b, 0);
  const at = (d) => new Date(`${d}T12:00:00Z`);
  const ticks = [0, 0.5, 1].map((f) => f * top);
  const labelEvery = Math.ceil(values.length / 8);
  const onMove = (e) => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.round(((e.clientX - r.left) / r.width * W - L) / ((W - L - R) / Math.max(1, values.length - 1))); setHover(Math.min(values.length - 1, Math.max(0, i))); };
  return (
    <div>
      <div className="bars-read">{hover === null && total ? <><b>{format(sumAll)}</b><span className="muted"> {unit} in {values.length} days · hover a day for detail</span></> : <><b>{format(values[idx])}</b><span className="muted"> {unit} · {at(days[idx]).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</span></>}</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${unit} per day`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray={t ? '3 4' : ''} /><text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{format(t)}</text></g>)}
        {rawMax === 0 && <text x={(W + L) / 2} y={(H - B) / 2} textAnchor="middle" fontSize="14" fill="var(--muted)">No data in this period yet</text>}
        <path d={`${line} L${x(values.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="var(--accent)" opacity="0.1" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {values.map((_, i) => i % labelEvery === 0 && <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{at(days[i]).getUTCDate()}</text>)}
        {hover !== null && <line x1={x(idx)} x2={x(idx)} y1={T} y2={y(0)} stroke="var(--accent)" strokeWidth="1" opacity="0.5" />}
        {hover !== null && <circle cx={x(idx)} cy={y(values[idx])} r="5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />}
      </svg>
    </div>
  );
}

/** Day x hour grid, one hue, darker means busier. Each cell carries its count in the tooltip. */
export function Heatmap({ heat }) {
  const max = Math.max(1, ...heat.rows.flat());
  const order = [1, 2, 3, 4, 5, 6, 0];
  const hr = (h) => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;
  return (
    <div className="heat">
      <div className="heat-row heat-head"><span />{heat.hours.map((h) => <span key={h}>{hr(h)}</span>)}</div>
      {order.map((d) => <div className="heat-row" key={d}><span className="heat-day">{heat.days[d]}</span>{heat.rows[d].map((v, i) => <span key={i} className="heat-cell" style={{ background: v ? `rgba(31, 78, 121, ${0.12 + 0.88 * (v / max)})` : 'var(--surface-2)', color: v / max > 0.55 ? '#fff' : 'var(--text)' }} title={`${heat.days[d]} ${hr(heat.hours[i])}: ${v} appointment${v === 1 ? '' : 's'}`}>{v || ''}</span>)}</div>)}
    </div>
  );
}

/** A single stacked bar with a legend that prints each share. For parts of a whole. */
export function StackBar({ parts, format = (v) => v, tones }) {
  const total = Math.max(1, parts.reduce((s, p) => s + p.value, 0));
  const shade = (i) => `rgba(31, 78, 121, ${1 - i * (0.7 / Math.max(1, parts.length - 1))})`;
  return (
    <div>
      <div className="stackbar" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>{parts.map((p, i) => <i key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: tones?.[p.label] || shade(i) }} />)}</div>
      <div className="stack-legend">{parts.map((p, i) => <div key={p.label}><span className="sw" style={{ background: tones?.[p.label] || shade(i) }} /><span className="grow">{p.label}</span><b className="mono">{format(p.value)}</b><span className="muted mono">{p.value / total < 0.01 ? '<1%' : `${Math.round((p.value / total) * 100)}%`}</span></div>)}</div>
    </div>
  );
}

/** Horizontal bars with a name, a figure and an optional second figure. */
export function HBars({ rows, format = (v) => v, second }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="col gap-12">
      {rows.map((r) => <div key={r.label}>
        <div className="row between small"><span>{r.label}</span><span><b className="mono">{format(r.value)}</b>{second && <span className="muted mono"> · {second(r)}</span>}</span></div>
        <div className="loadbar"><i style={{ width: `${(r.value / max) * 100}%` }} /></div>
      </div>)}
    </div>
  );
}

/** Target progress with a marker where you should be by today. */
export function GoalBar({ collected, target, dayOfMonth, daysInMonth }) {
  const pct = target ? Math.min(100, (collected / target) * 100) : 0; const pace = (dayOfMonth / daysInMonth) * 100;
  return (
    <div className="goal">
      <div className="goal-track"><i style={{ width: `${pct}%` }} />{target > 0 && <b style={{ left: `${pace}%` }} title="Where you should be by today" />}</div>
    </div>
  );
}
