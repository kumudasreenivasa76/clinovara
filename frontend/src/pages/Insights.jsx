import React, { useState } from 'react';
import { IconMessageCircleQuestion, IconClockHour4, IconRepeat, IconDental, IconTable, IconChartBar, IconCash, IconPhoneCall, IconLanguage } from '@tabler/icons-react';
import { get } from '../lib/api.js';
import { fmtDate, fmtMoney, ago } from '../lib/format.js';
import { Card, Body, Pill, Stat, usePoll, Seg, Empty } from '../components/ui.jsx';

export default function Insights({ branch, locations }) {
  const [days, setDays] = useState(30);
  const { data } = usePoll(() => get(`/api/insights?days=${days}${branch ? `&locationId=${branch}` : ''}`), [days, branch], 15000);
  if (!data) return <div className="skeleton" />;
  const b = data.bookings; const c = data.cancellations; const k = data.checkIn; const rev = data.revenue;
  const branchName = locations.find((l) => l.id === branch)?.name;
  return (
    <>
      <div className="page-head">
        <div><h1>Practice insights{branchName ? ` · ${branchName}` : ''}</h1><p>Where the team should act today: unanswered inquiries, booking rate, cancellations, check-in delays, overdue recalls, unscheduled treatment, and collections.</p></div>
        <Seg value={days} onChange={setDays} options={[{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }]} />
      </div>
      <div className="grid four mb-16">
        <Stat value={data.unansweredInquiries.count} label="Unanswered inquiries right now" hint="Waiting for staff or unanswered past the threshold" tone={data.unansweredInquiries.count ? 'bad' : 'good'} onClick={() => { window.location.hash = '#/inbox'; }} />
        <Stat value={b.rate == null ? '—' : `${b.rate}%`} label="Booking rate" hint={`${b.booked} of ${b.inquiriesWithBookingIntent} booking inquiries became appointments`} tone="accent" />
        <Stat value={c.rate == null ? '—' : `${c.rate}%`} label="Cancellations + no-shows" hint={`${c.total} cancelled (${c.late} late), ${c.noShows} no-shows of ${c.scheduled} booked`} tone={c.rate > 10 ? 'warn' : ''} />
        <Stat value={k.avgArrivalToReadyMin == null ? '—' : `${k.avgArrivalToReadyMin} min`} label="Arrival to ready" hint={k.avgReadyToChairMin != null ? `then ${k.avgReadyToChairMin} min ready to chair · ${k.kioskShare ?? 0}% via kiosk` : ''} tone={k.avgArrivalToReadyMin > 10 ? 'warn' : ''} />
        <Stat value={data.recalls.overdue} label="Overdue recalls with no visit booked" tone={data.recalls.overdue ? 'warn' : 'good'} />
        <Stat value={data.unscheduledTreatment.count} label="Patients with unscheduled treatment" hint={data.unscheduledTreatment.value ? `${fmtMoney(data.unscheduledTreatment.value)} estimated` : ''} tone={data.unscheduledTreatment.count ? 'warn' : 'good'} onClick={() => { window.location.hash = '#/treatment'; }} />
        <Stat value={fmtMoney(rev.collected)} label={`Collected in ${days} days`} hint={`${fmtMoney(rev.today)} today · ${Object.entries(rev.byMode).map(([m, v]) => `${m} ${fmtMoney(v)}`).join(' · ') || 'no payments'}`} tone="accent" />
        <Stat value={fmtMoney(rev.outstanding)} label="Outstanding after completed visits" tone={rev.outstanding ? 'warn' : 'good'} />
      </div>

      <div className="grid side mb-16">
        <Card title="Visits by day"><Body><DayChart series={data.series.slice(-Math.min(days, 30))} /></Body></Card>
        <Card title="Inquiry mix">
          <Body className="col">
            <div className="row between small"><span>Conversations in window</span><b>{b.conversations}</b></div>
            <div className="row between small"><span>Resolved by AI without staff</span><b>{b.aiResolved}</b></div>
            <div className="row between small"><span>Handed to staff</span><b>{b.escalated}</b></div>
            <div className="divider" />
            {Object.entries(b.byChannel).map(([ch, n]) => <div className="row between small" key={ch}><span className="row gap-6"><Pill status={ch} /></span><b>{n}</b></div>)}
            <div className="divider" />
            <div className="row between small"><span>Upcoming visits (3 days)</span><b>{data.forms.upcoming}</b></div>
            <div className="row between small"><span>…with forms incomplete</span><b style={{ color: data.forms.incomplete ? 'var(--warn)' : undefined }}>{data.forms.incomplete}</b></div>
          </Body>
        </Card>
      </div>

      <div className="grid two mb-16">
        <Card title="By dentist"><table className="table"><thead><tr><th>Dentist</th><th>Booked</th><th>Done</th><th>Cancelled</th><th>No-show</th><th>Collected</th></tr></thead><tbody>{data.byProvider.map((p) => <tr key={p.id}><td className="small"><b>{p.name}</b><div className="tiny muted">{p.specialty}</div></td><td>{p.scheduled}</td><td>{p.completed}</td><td>{p.cancelled}</td><td style={{ color: p.noShow ? 'var(--warn)' : undefined }}>{p.noShow}</td><td>{fmtMoney(p.collected)}</td></tr>)}</tbody></table></Card>
        <Card title="By branch"><table className="table"><thead><tr><th>Branch</th><th>Booked</th><th>Done</th><th>Cancelled</th><th>No-show</th><th>Collected</th></tr></thead><tbody>{data.byLocation.map((p) => <tr key={p.id}><td className="small strong">{p.name}</td><td>{p.scheduled}</td><td>{p.completed}</td><td>{p.cancelled}</td><td style={{ color: p.noShow ? 'var(--warn)' : undefined }}>{p.noShow}</td><td>{fmtMoney(p.collected)}</td></tr>)}</tbody></table></Card>
      </div>

      <div className="grid three">
        <Card title={<span className="row gap-6"><IconMessageCircleQuestion size={16} />Unanswered inquiries</span>}>
          <div className="list">{data.unansweredInquiries.items.map((i) => <a className="list-item clickable" key={i.id} href="#/inbox"><div className="grow"><div className="small strong">{i.contactName}</div><div className="tiny muted">{i.reason || 'No reason'} · {i.channel}</div></div><Pill tone={i.waitingMinutes > 60 ? 'bad' : 'warn'}>{i.waitingMinutes} min</Pill></a>)}{data.unansweredInquiries.items.length === 0 && <div className="empty small">All caught up.</div>}</div>
        </Card>
        <Card title={<span className="row gap-6"><IconRepeat size={16} />Overdue recalls</span>}>
          <div className="list">{data.recalls.items.slice(0, 8).map((r) => <div className="list-item" key={r.patientId}><div className="grow"><div className="small strong">{r.name}</div><div className="tiny muted">Due {fmtDate(r.dueOn)}{r.lastContacted ? ` · contacted ${ago(r.lastContacted)}` : ' · never contacted'}</div></div><Pill tone={r.daysOverdue > 90 ? 'bad' : 'warn'}>{r.daysOverdue} d</Pill></div>)}{data.recalls.items.length === 0 && <div className="empty small">No overdue recalls.</div>}</div>
        </Card>
        <Card title={<span className="row gap-6"><IconDental size={16} />Unscheduled treatment</span>}>
          <div className="list">{data.unscheduledTreatment.items.map((t) => <a className="list-item clickable" key={t.planId} href="#/treatment"><div className="grow"><div className="small strong">{t.name}</div><div className="tiny muted">{t.items.join(', ')} · {t.daysSince} days{t.openQuestions ? ` · ${t.openQuestions} open question${t.openQuestions > 1 ? 's' : ''}` : ''}</div></div><span className="small">{fmtMoney(t.value)}</span></a>)}{data.unscheduledTreatment.items.length === 0 && <div className="empty small">Every plan has a next visit.</div>}</div>
        </Card>
      </div>
      {k.waitingNow.length > 0 && <Card className="mt-16" title={<span className="row gap-6"><IconClockHour4 size={16} />Waiting right now</span>}><div className="list">{k.waitingNow.map((w) => <div className="list-item" key={w.visitId}><span className="token-chip">{w.token}</span><div className="grow small strong">{w.patientName}</div><Pill status={w.status} /><Pill tone={w.waitingMinutes > 20 ? 'bad' : ''}>{w.waitingMinutes} min</Pill>{w.helpRequested && <Pill tone="bad">Asked for help</Pill>}</div>)}</div></Card>}
      {data.calls && <Card className="mt-16" title={<span className="row gap-6"><IconPhoneCall size={16} />Virtual assistant calls</span>}>
        <Body className="col">
          <div className="row wrap gap-16">
            <div><div className="tiny muted">Calls answered</div><div className="mono" style={{ fontSize: 20 }}>{data.calls.total}</div></div>
            <div><div className="tiny muted">After hours</div><div className="mono" style={{ fontSize: 20 }}>{data.calls.afterHours}</div></div>
            <div><div className="tiny muted">Booked</div><div className="mono" style={{ fontSize: 20, color: 'var(--good)' }}>{data.calls.booked}</div></div>
            <div><div className="tiny muted">Messages taken</div><div className="mono" style={{ fontSize: 20 }}>{data.calls.messages}</div></div>
            <div><div className="tiny muted">Possible emergencies</div><div className="mono" style={{ fontSize: 20, color: data.calls.emergencies ? 'var(--bad)' : undefined }}>{data.calls.emergencies}</div></div>
            <div><div className="tiny muted">Conversion to booking</div><div className="mono" style={{ fontSize: 20 }}>{data.calls.conversion == null ? '—' : `${data.calls.conversion}%`}</div></div>
          </div>
          {data.calls.byLanguage.length > 0 && <div className="tag-list mt-8">{data.calls.byLanguage.map((l) => <span key={l.code} className="pill outline"><IconLanguage size={11} />{l.name} · {l.n}</span>)}</div>}
          <a className="tiny" href="#/calls">See every call →</a>
        </Body>
      </Card>}
    </>
  );
}

/** Stacked bars: completed (series 1) and cancelled + no-show (series 2), one hue each, legend + hover tooltip + table view. */
function DayChart({ series }) {
  const [view, setView] = useState('chart');
  const [tip, setTip] = useState(null);
  const rows = series.map((s) => ({ ...s, lost: s.cancelled + s.noShow }));
  const max = Math.max(1, ...rows.map((r) => r.completed + r.lost + r.scheduled));
  const W = 640; const H = 200; const padL = 28; const padB = 24; const padT = 8;
  const plotW = W - padL - 8; const plotH = H - padB - padT;
  const bw = plotW / rows.length; const barW = Math.max(4, Math.min(22, bw * 0.55));
  const y = (v) => padT + plotH - (v / max) * plotH;
  const ticks = [0, Math.ceil(max / 2), max];
  if (!rows.length) return <Empty>No data.</Empty>;
  return (
    <div className="col">
      <div className="row between">
        <div className="viz-legend"><span><i style={{ background: 'var(--series-1)' }} />Completed</span><span><i style={{ background: 'var(--series-2)' }} />Cancelled or no-show</span><span><i style={{ background: 'var(--border-strong)' }} />Upcoming</span></div>
        <Seg value={view} onChange={setView} options={[{ value: 'chart', label: <IconChartBar size={14} /> }, { value: 'table', label: <IconTable size={14} /> }]} />
      </div>
      {view === 'table' ? (
        <table className="table"><thead><tr><th>Day</th><th>Completed</th><th>Cancelled</th><th>No-show</th><th>Upcoming</th></tr></thead><tbody>{rows.map((r) => <tr key={r.day}><td>{fmtDate(r.day)}</td><td>{r.completed}</td><td>{r.cancelled}</td><td>{r.noShow}</td><td>{r.scheduled}</td></tr>)}</tbody></table>
      ) : (
        <div style={{ position: 'relative' }}>
          <svg className="viz" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Visits per day">
            <g className="grid">{ticks.map((t) => <line key={t} x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} strokeDasharray={t === 0 ? undefined : '2 3'} />)}</g>
            <g className="axis">{ticks.map((t) => <text key={t} x={padL - 6} y={y(t) + 4} textAnchor="end">{t}</text>)}</g>
            {rows.map((r, i) => {
              const x = padL + i * bw + (bw - barW) / 2;
              const segs = [{ v: r.completed, c: 'var(--series-1)' }, { v: r.lost, c: 'var(--series-2)' }, { v: r.scheduled, c: 'var(--border-strong)' }].filter((s) => s.v > 0);
              let acc = 0;
              const show = rows.length <= 14 || i % Math.ceil(rows.length / 10) === 0;
              return (
                <g key={r.day} onMouseEnter={() => setTip({ r, x: x + barW / 2, y: y(r.completed + r.lost + r.scheduled) })} onMouseLeave={() => setTip(null)}>
                  <rect x={x - 4} y={padT} width={barW + 8} height={plotH} fill="transparent" />
                  {segs.map((s, j) => { const y1 = y(acc + s.v); const h = Math.max(0, y(acc) - y1 - (j < segs.length - 1 ? 2 : 0)); acc += s.v; const last = j === segs.length - 1; return <rect key={j} x={x} y={y1} width={barW} height={h} fill={s.c} rx={last ? 4 : 0} />; })}
                  {show && <text className="axis" x={x + barW / 2} y={H - 6} textAnchor="middle" style={{ fontSize: 10, fill: 'var(--muted)' }}>{fmtDate(r.day).split(', ')[1] || fmtDate(r.day)}</text>}
                </g>
              );
            })}
          </svg>
          {tip && <div className="viz-tip" style={{ left: `${(tip.x / W) * 100}%`, top: `${(tip.y / H) * 100}%` }}>{fmtDate(tip.r.day)} · {tip.r.completed} completed · {tip.r.cancelled} cancelled · {tip.r.noShow} no-show{tip.r.scheduled ? ` · ${tip.r.scheduled} upcoming` : ''}</div>}
        </div>
      )}
    </div>
  );
}
