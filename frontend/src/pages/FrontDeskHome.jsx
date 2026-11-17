import React from 'react';
import { get, post } from '../lib/api.js';
import { fmtMoney, fmtTime, dayKey } from '../lib/format.js';
import { Card, Body, Stat, usePoll, useAction } from '../components/ui.jsx';
import { PageHeader, ApptTable, ActionList, MetricTile, longDate, nameOf } from '../components/dash.jsx';

const safe = (p, fallback) => p.catch(() => fallback);
const ymd = (d) => dayKey(d);
const clock = (iso) => fmtTime(iso);

/** Front desk home: today's appointments and the open items that keep the day on track. */
export default function FrontDeskHome({ branch, locations }) {
  const [run, busy] = useAction();
  const now = new Date(); const tomorrow = new Date(now.getTime() + 864e5);
  const q = branch ? `&locationId=${branch}` : '';
  const { data, reload } = usePoll(async () => {
    const [today, next, convs, cbs, ins] = await Promise.all([
      get(`/api/appointments?from=${ymd(now)}&to=${ymd(now)}${q}`), get(`/api/appointments?from=${ymd(tomorrow)}&to=${ymd(tomorrow)}${q}`),
      safe(get('/api/conversations'), []), safe(get('/api/callbacks'), { items: [] }), safe(get(`/api/insights?days=7${q}`), null),
    ]);
    return { today: today.filter((a) => a.status !== 'cancelled'), toConfirm: next.filter((a) => a.status === 'scheduled'), convs, callbacks: cbs.items, ins };
  }, [branch], 15000);
  if (!data) return <div className="skeleton" />;
  const { today, toConfirm, convs, callbacks, ins } = data;
  const branchName = locations.find((l) => l.id === branch)?.name;
  const waitingChats = convs.filter((c) => c.status === 'needs_staff' || (c.unread && c.status !== 'closed')).length;
  const unpaid = today.filter((a) => a.status === 'completed' && a.paymentStatus !== 'paid');
  const inRoom = today.filter((a) => ['arrived', 'checking_in', 'ready'].includes(a.visit?.status));
  const expected = today.filter((a) => ['scheduled', 'confirmed'].includes(a.status) && new Date(a.start) > now).sort((a, b) => a.start.localeCompare(b.start));
  const longestWait = inRoom.length ? Math.max(0, ...inRoom.map((a) => Math.round((now - new Date(a.visit.arrivedAt || a.start)) / 60000))) : 0;
  const formsIncomplete = ins?.forms?.incomplete || 0;
  const collected = today.filter((a) => a.paymentStatus === 'paid').reduce((s, a) => s + (a.paidAmount || 0), 0);
  const confirm = (a) => run(async () => { await post(`/api/appointments/${a.id}/confirm`); reload?.(); }, 'Appointment confirmed');
  const actions = [
    [waitingChats, 'Patient messages waiting', '#/inbox', 'high'],
    [callbacks.length, 'Callbacks to make', '#/callbacks', 'med'],
    [unpaid.length, `Visits to collect payment${unpaid.length ? ` (${fmtMoney(unpaid.reduce((s, a) => s + (a.fee || 0), 0))})` : ''}`, '#/dashboard', 'high'],
    [toConfirm.length, "Tomorrow's appointments to confirm", '#/schedule', 'med'],
    [formsIncomplete, 'Patients with incomplete forms', '#/previsit', ''],
  ].filter(([n]) => n > 0);

  return (
    <>
      <PageHeader title="Today" sub={`${longDate()} · ${branchName || 'All branches'}`}
        actions={<><a className="btn" href="#/dashboard">Live queue</a><a className="btn" href="#/patients">Add patient</a><a className="btn primary" href="#/schedule">New appointment</a></>} />

      <div className="mgrid">
        <MetricTile label="In waiting room" value={inRoom.length} hint={longestWait ? `Longest wait ${longestWait} min` : 'No one waiting'} />
        <MetricTile label="Still expected today" value={expected.length} hint={expected[0] ? `Next: ${nameOf(expected[0].patient)}, ${clock(expected[0].start)}` : 'No more arrivals'} />
        <MetricTile label="Collected today" value={fmtMoney(collected)} hint={unpaid.length ? `${unpaid.length} to collect` : 'Nothing outstanding'} />
        <MetricTile label="Incomplete forms" value={formsIncomplete} hint="Appointments in the next 3 days" />
      </div>

      <div className="grid side">
        <Card title={`Appointments today (${today.length})`} actions={<a className="btn sm ghost" href="#/dashboard">Live queue</a>}>
          <ApptTable appts={today} empty="No appointments today." action={(a) => a.status === 'scheduled' && <button className="btn sm" disabled={busy} onClick={() => confirm(a)}>Confirm</button>} />
        </Card>
        <div className="col gap-16">
          <Card title="Action required"><ActionList items={actions} /></Card>
          <Card title={`Tomorrow, awaiting confirmation (${toConfirm.length})`}><Body className="col gap-8">
            {toConfirm.length === 0 && <div className="small muted">All appointments are confirmed.</div>}
            {toConfirm.slice(0, 6).map((a) => <div className="row between small" key={a.id}><span><span className="mono">{clock(a.start)}</span> {nameOf(a.patient)}</span><button className="btn sm" disabled={busy} onClick={() => confirm(a)}>Confirm</button></div>)}
          </Body></Card>
          <Card title="Recalls due" actions={<a className="btn sm ghost" href="#/patients">All patients</a>}><Body className="col gap-8">
            {(!ins || ins.recalls.items.length === 0) && <div className="small muted">No overdue recalls.</div>}
            {ins?.recalls.items.slice(0, 5).map((r) => <a key={r.patientId} href={`#/patients/${r.patientId}`} className="row between small" style={{ color: 'inherit' }}><span>{r.name}</span><span className="muted">{r.daysOverdue} {r.daysOverdue === 1 ? 'day' : 'days'} overdue</span></a>)}
          </Body></Card>
        </div>
      </div>
    </>
  );
}
