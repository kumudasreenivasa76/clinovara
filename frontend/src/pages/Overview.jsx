import React, { useState } from 'react';
import { IconCalendarPlus, IconUserPlus, IconTarget, IconCheck } from '@tabler/icons-react';
import { get, put } from '../lib/api.js';
import { fmtMoney } from '../lib/format.js';
import { Card, Body, usePoll, Seg, useAction } from '../components/ui.jsx';
import { PageHeader, ApptTable, ActionList, MetricTile, TrendChart, Heatmap, StackBar, HBars, GoalBar, dayKey, longDate } from '../components/dash.jsx';

const safe = (p, fallback) => p.catch(() => fallback);
const compact = (v) => (v >= 1e7 ? `₹${(v / 1e7).toFixed(1)}Cr` : v >= 1e5 ? `₹${(v / 1e5).toFixed(1)}L` : v >= 1e3 ? `₹${Math.round(v / 1e3)}k` : `₹${Math.round(v)}`);
const STATUS = { completed: 'Completed', scheduled: 'Scheduled', confirmed: 'Confirmed', arrived: 'Arrived', no_show: 'No-show', cancelled: 'Cancelled' };
const STATUS_TONE = { Completed: 'var(--good)', Scheduled: '#8da4b8', Confirmed: 'var(--accent)', Arrived: '#4f7aa6', 'No-show': 'var(--bad)', Cancelled: '#c9cfcc' };

/** Owner and admin home: how the clinic is doing against the last period, today's appointments, what needs a decision, and where time and money go. */
export default function Overview({ branch, locations, me }) {
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState('revenue');
  const [target, setTarget] = useState('');
  const [run, busy] = useAction();
  const q = branch ? `&locationId=${branch}` : '';
  const { data, reload } = usePoll(async () => {
    const today = dayKey(new Date());
    const [dash, todays, ins, convs, cbs, mk, gr, team] = await Promise.all([
      get(`/api/dashboard?days=${days}${q}`), get(`/api/appointments?from=${today}&to=${today}${q}`), get(`/api/insights?days=30${q}`),
      safe(get('/api/conversations'), []), safe(get('/api/callbacks'), { items: [] }), safe(get('/api/marketing'), { pendingApprovals: 0 }), safe(get(`/api/marketing/growth?days=30`), null), safe(get('/api/team'), null),
    ]);
    return { dash, todays: todays.filter((a) => a.status !== 'cancelled'), ins, convs, callbacks: cbs.items.length, approvals: mk.pendingApprovals || 0, gr, team };
  }, [branch, days], 30000);
  if (!data) return <div className="skeleton" />;
  const { dash: d, todays, ins, convs, callbacks, approvals, gr, team } = data;
  const branchName = locations.find((l) => l.id === branch)?.name;
  // A clinic with no patients and no appointments yet gets a checklist instead of a wall of zeros.
  const anyActivity = d.patients.total > 0 || d.now.appointments + d.previous.appointments > 0 || todays.length > 0;
  if (!anyActivity) {
    const slug = me?.tenant?.slug; const members = (team?.members || []).length;
    const steps = [
      ['Add your first patient', 'Type one in, or import a CSV from your current software.', '#/patients', 'Add a patient', false],
      ['Book an appointment', 'Pick a patient, a visit type and an open time.', '#/schedule', 'Open the schedule', false],
      ['Share your booking page', 'Patients can book and chat on your clinic website. Put the link on Google Maps and your signboard.', `#/site?t=${slug}`, 'Open it', false],
      ['Invite your team', 'Front desk and dentists each get a login that shows only what they need.', '#/settings?tab=team', 'Invite someone', members > 1],
      ['Add your Google review link', 'So patients can be asked for a review after a visit.', '#/marketing', 'Set it up', !!gr?.reviews?.linkSet],
    ];
    return (
      <>
        <PageHeader title="Overview" sub={`${longDate()} · ${branchName || 'All branches'}`} />
        <Card title="Get started">
          <Body className="col gap-12">
            <div className="small muted">Your clinic is live. Do these in any order. Your numbers, charts and marketing results appear here as soon as you have patients and appointments.</div>
            {steps.map(([title, text, to, cta, done], i) => <div className="review-row" key={title}>
              <span className={`review-dot ${done ? 'ok' : ''}`}>{done ? '✓' : i + 1}</span>
              <div className="grow"><div className="small strong">{title}</div><div className="small muted">{text}</div></div>
              <a className={`btn ${done ? 'ghost' : 'primary'} sm`} href={to} {...(title === 'Share your booking page' ? { target: '_blank', rel: 'noreferrer' } : {})}>{done ? 'Done' : cta}</a>
            </div>)}
          </Body>
        </Card>
      </>
    );
  }
  const n = d.now; const p = d.previous; const s = d.series;
  const col = (k) => s.map((x) => x[k]);
  const needsStaff = convs.filter((c) => c.status === 'needs_staff').length;
  const actions = [
    [needsStaff, 'Patient messages waiting for staff', '#/inbox', 'high'], [callbacks, 'Callbacks to make', '#/callbacks', 'med'],
    [ins.revenue.outstanding > 0 ? 1 : 0, `Unpaid after completed visits (${fmtMoney(ins.revenue.outstanding)})`, '#/dashboard', 'high'], [approvals, 'Marketing items to approve', '#/marketing', 'med'],
    [ins.forms.incomplete || 0, 'Upcoming patients with incomplete forms', '#/previsit', ''], [ins.recalls.overdue, 'Patients overdue for recall', '#/patients', ''],
    [ins.unscheduledTreatment.count, `Patients with unscheduled treatment${ins.unscheduledTreatment.value ? ` (${fmtMoney(ins.unscheduledTreatment.value)})` : ''}`, '#/treatment', ''],
  ].filter(([c]) => c > 0);
  const g = d.goal; const onPace = g.target ? g.projected >= g.target : null;
  const saveTarget = () => run(async () => { await put('/api/settings', { goals: { monthlyRevenue: Number(target) || 0 } }); setTarget(''); reload(); }, 'Target saved');
  const metricCfg = { revenue: { label: 'Collected', values: col('revenue'), format: compact, unit: 'collected' }, appointments: { label: 'Appointments', values: col('appointments'), format: (v) => Math.round(v), unit: 'appointments' }, newPatients: { label: 'New patients', values: col('newPatients'), format: (v) => Math.round(v), unit: 'new patients' } }[metric];
  const range = `Last ${days} days vs previous ${days}`;

  return (
    <>
      <PageHeader title="Overview" sub={`${longDate()} · ${branchName || 'All branches'}`}
        actions={<><Seg value={days} onChange={setDays} options={[{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }]} /><a className="btn" href="#/patients"><IconUserPlus size={16} />Add patient</a><a className="btn primary" href="#/schedule"><IconCalendarPlus size={16} />New appointment</a></>} />

      <div className="mgrid">
        <MetricTile label="Revenue collected" value={compact(n.revenue)} cur={n.revenue} prev={p.revenue} series={col('revenue')} hint={range === '' ? '' : `${compact(p.revenue)} before`} />
        <MetricTile label="Appointments" value={n.appointments} cur={n.appointments} prev={p.appointments} series={col('appointments')} hint={`${n.completed} completed`} />
        <MetricTile label="New patients" value={n.newPatients} cur={n.newPatients} prev={p.newPatients} series={col('newPatients')} hint={`${d.patients.total} on file`} />
        <MetricTile label="Average bill" value={fmtMoney(n.avgTicket)} cur={n.avgTicket} prev={p.avgTicket} hint="per paid visit" />
        <MetricTile label="No-show rate" value={`${n.noShowRate}%`} cur={n.noShowRate} prev={p.noShowRate} invert series={col('noShows')} unitLabel="No-shows per day" hint={`${n.noShows} missed`} />
        <MetricTile label="Cancellations" value={n.cancellations} cur={n.cancellations} prev={p.cancellations} invert hint="in the period" />
        <MetricTile label="Chair utilisation" value={`${n.utilisation}%`} cur={n.utilisation} prev={p.utilisation} hint="booked time vs open hours" />
        <MetricTile label="Visits per open day" value={Math.round(n.appointments / Math.max(1, s.filter((x) => x.appointments > 0).length))} hint={`${d.patients.returningPercent}% returning patients`} />
      </div>

      <div className="grid side mb-16">
        <Card title={metricCfg.label} actions={<Seg value={metric} onChange={setMetric} options={[{ value: 'revenue', label: 'Collected' }, { value: 'appointments', label: 'Appointments' }, { value: 'newPatients', label: 'New patients' }]} />}>
          <Body><TrendChart days={s.map((x) => x.day)} values={metricCfg.values} format={metricCfg.format} unit={metricCfg.unit} /></Body>
        </Card>
        <Card title={<span className="row gap-6"><IconTarget size={15} />Monthly target</span>}>
          <Body className="col gap-12">
            {g.target > 0 ? (<>
              <div><div className="goal-big">{compact(g.collected)} <span className="muted">of {compact(g.target)}</span></div><div className="small muted">{Math.round((g.collected / g.target) * 100)}% · day {g.dayOfMonth} of {g.daysInMonth}</div></div>
              <GoalBar collected={g.collected} target={g.target} dayOfMonth={g.dayOfMonth} daysInMonth={g.daysInMonth} />
              <div className="small">{onPace ? <span className="delta up"><IconCheck size={13} /> On pace</span> : <span className="delta down">Behind pace</span>} <span className="muted">Projected month end {compact(g.projected)}</span></div>
            </>) : <div className="small muted">Set a revenue target for {new Date().toLocaleDateString('en-IN', { month: 'long' })} to track pace and a month-end projection. Collected so far: <b>{compact(g.collected)}</b>.</div>}
            <div className="row gap-6"><input className="input" type="number" min="0" placeholder={g.target ? `Target (${g.target})` : 'Monthly target in ₹'} value={target} onChange={(e) => setTarget(e.target.value)} /><button className="btn" disabled={busy || !target} onClick={saveTarget}>Save</button></div>
          </Body>
        </Card>
      </div>

      <div className="grid side mb-16">
        <Card title={`Appointments today (${todays.length})`} actions={<a className="btn sm ghost" href="#/schedule">Open schedule</a>}><ApptTable appts={todays} empty="No appointments today." /></Card>
        <Card title="Action required"><ActionList items={actions} /></Card>
      </div>

      <div className="grid mb-16" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
        <Card title="Treatments"><Body><HBars rows={d.treatments.map((t) => ({ label: t.name, value: t.count, revenue: t.revenue }))} format={(v) => `${v}`} second={(r) => compact(r.revenue)} /></Body></Card>
        <Card title="Payment methods"><Body>{d.paymentModes.length ? <StackBar parts={d.paymentModes.map((m) => ({ label: m.mode, value: m.amount }))} format={compact} /> : <div className="small muted">No payments in this period.</div>}</Body></Card>
        {gr && <Card title="Marketing, 30 days" actions={<a className="btn sm ghost" href="#/marketing">Open growth</a>}><Body className="col gap-8 small">
          <div className="row between"><span className="muted">Messages sent</span><b className="mono">{gr.now.messages}</b></div>
          <div className="row between"><span className="muted">Bookings that followed</span><b className="mono">{gr.now.bookings}</b></div>
          <div className="row between"><span className="muted">Collected from those</span><b className="mono">{fmtMoney(gr.now.revenue)}</b></div>
          <div className="row between"><span className="muted">Review requests</span><b className="mono">{gr.now.reviewRequests}</b></div>
          {gr.opportunities[0] && <a className="callout" href="#/marketing" style={{ marginTop: 4 }}><b>{gr.opportunities[0].count}</b> {gr.opportunities[0].title.toLowerCase()}. Draft a message</a>}
        </Body></Card>}
        <Card title="Where bookings come from"><Body><HBars rows={d.sources.map((x) => ({ label: x.source, value: x.count }))} /></Body></Card>
      </div>

      <div className="grid side mb-16">
        <Card title="Busiest times"><Body><Heatmap heat={d.heat} /></Body></Card>
        <Card title="Appointment outcomes"><Body><StackBar parts={d.statusMix.map((x) => ({ label: STATUS[x.status], value: x.count }))} tones={STATUS_TONE} /></Body></Card>
      </div>

      <Card title={`Team performance, last ${days} days`}>
        <table className="table">
          <thead><tr><th>Dentist</th><th style={{ textAlign: 'right' }}>Appointments</th><th style={{ textAlign: 'right' }}>Completed</th><th style={{ textAlign: 'right' }}>No-shows</th><th style={{ textAlign: 'right' }}>Collected</th><th style={{ width: 180 }}>Chair time used</th></tr></thead>
          <tbody>{d.team.map((t) => <tr key={t.id}><td><span className="strong">{t.name}</span> <span className="muted tiny">{t.role}</span></td><td className="mono" style={{ textAlign: 'right' }}>{t.appointments}</td><td className="mono" style={{ textAlign: 'right' }}>{t.completed}</td><td className="mono" style={{ textAlign: 'right' }}>{t.noShows}</td><td className="mono" style={{ textAlign: 'right' }}>{fmtMoney(t.revenue)}</td><td><div className="row gap-8"><div className="loadbar grow" style={{ margin: 0 }}><i style={{ width: `${t.utilisation}%` }} /></div><span className="mono small">{t.utilisation}%</span></div></td></tr>)}</tbody>
        </table>
      </Card>
    </>
  );
}
