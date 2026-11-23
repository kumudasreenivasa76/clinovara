import React, { useEffect, useState } from 'react';
import { IconSparkles, IconCalendarPlus, IconChevronLeft, IconChevronRight, IconPlus, IconBell, IconListDetails, IconCalendarX, IconCalendarRepeat, IconCheck, IconSend, IconClockPause, IconTrash } from '@tabler/icons-react';
import { get, post, del } from '../lib/api.js';
import { todayKey, dayKey, minutesOfDay, zonedToIso, addDaysKey, fmtDateLong, fmtTime, fmtWhen, fmtDate, fullName, fmtPhone, ago, fmtMoney } from '../lib/format.js';
import { Card, Body, Pill, Avatar, Empty, usePoll, useAction, Modal, Field, Stat } from '../components/ui.jsx';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export default function Schedule({ hash = '', branch, locations = [], providerId = null, defaultView = null }) {
  const params = new URLSearchParams(hash.split('?')[1] || '');
  const [date, setDate] = useState(todayKey());
  // Doctor mode (providerId set) shows only that dentist and opens on the week; the front desk sees every dentist by day or one dentist by week.
  const [view, setView] = useState(defaultView || (providerId ? 'week' : 'day'));
  const [weekProv, setWeekProv] = useState(providerId || '');
  const monday = addDaysKey(date, -((new Date(date + 'T12:00:00').getDay() + 6) % 7));
  const rangeFrom = view === 'week' ? monday : date; const rangeTo = view === 'week' ? addDaysKey(monday, 6) : date;
  const step = view === 'week' ? 7 : 1;
  const settings = usePoll(() => get('/api/settings'), []);
  const appts = usePoll(() => get(`/api/appointments?from=${rangeFrom}&to=${rangeTo}${branch ? `&locationId=${branch}` : ''}`), [rangeFrom, rangeTo, branch], 6000);
  const blocks = usePoll(() => get(`/api/blocks?from=${rangeFrom}&to=${rangeTo}`), [rangeFrom, rangeTo], 15000);
  const waitlist = usePoll(() => get('/api/waitlist'), [], 15000);
  const reminders = usePoll(() => get('/api/reminders/due'), [], 15000);
  const [booking, setBooking] = useState(params.get('patient') ? { patientId: params.get('patient') } : params.get('new') ? {} : null);
  const [blocking, setBlocking] = useState(null);
  const [open, setOpen] = useState(null);
  const [run] = useAction();
  const refresh = () => { appts.reload(); waitlist.reload(); reminders.reload(); blocks.reload(); };
  useEffect(() => { if (params.get('appointment')) get(`/api/appointments/${params.get('appointment')}`).then((a) => { setDate(a.start.slice(0, 10)); setOpen(a); }).catch(() => {}); }, [hash]); // eslint-disable-line

  const s = settings.data;
  const loc = s?.locations?.find((l) => l.id === branch);
  const hoursSrc = loc?.hours || s?.practice.hours;
  const hours = hoursSrc ? hoursSrc[DAYS[new Date(date + 'T12:00:00').getDay()]] : null;
  const startH = hours ? Number(hours[0].split(':')[0]) : 9;
  const endH = hours ? Number(hours[1].split(':')[0]) : 19;
  const slotMin = 15; const slotPx = 24;
  const providers = (s?.providers || []).filter((p) => (!providerId || p.id === providerId) && (!branch || !p.locationIds?.length || p.locationIds.includes(branch)));
  const weekProvider = providers.find((p) => p.id === (weekProv || providers[0]?.id)) || providers[0];
  const weekLabel = `${fmtDate(monday)} – ${fmtDate(addDaysKey(monday, 6))}`;
  const list = appts.data || [];
  const blk = blocks.data || [];
  const statList = providerId ? list.filter((a) => a.providerId === providerId) : view === 'week' && weekProvider ? list.filter((a) => a.providerId === weekProvider.id) : list;

  return (
    <>
      <div className="page-head">
        <div><h1>{providerId ? 'My calendar' : `Schedule${loc ? ` · ${loc.name}` : ''}`}</h1><p>{providerId ? 'The same calendar the front desk books into. Click an empty slot to book, a visit to open it.' : 'Visit types set the length and fee, dentists set the columns, and the AI books into the same calendar. Block time for leave, lunch or lab work.'}</p></div>
        <div className="row"><button className="btn" onClick={() => setBlocking({})}><IconClockPause size={16} />Block time</button><button className="btn primary" onClick={() => setBooking(providerId ? { providerId } : {})}><IconPlus size={16} />Book appointment</button></div>
      </div>
      <div className="grid side">
        <Card>
          <div className="card-head">
            <div className="row"><button className="btn icon" onClick={() => setDate(addDaysKey(date, -step))}><IconChevronLeft size={16} /></button><h3 style={{ minWidth: 220, textAlign: 'center' }}>{view === 'week' ? weekLabel : fmtDateLong(date)}</h3><button className="btn icon" onClick={() => setDate(addDaysKey(date, step))}><IconChevronRight size={16} /></button><button className="btn sm ghost" onClick={() => setDate(todayKey())}>Today</button></div>
            <div className="row gap-6"><div className="seg"><button className={view === 'day' ? 'active' : ''} onClick={() => setView('day')}>Day</button><button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Week</button></div>
            {view === 'week' && !providerId && <select className="input" style={{ width: 190, padding: '6px 10px' }} value={weekProvider?.id || ''} onChange={(e) => setWeekProv(e.target.value)}>{providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
            <input className="input" type="date" style={{ width: 160, padding: '6px 10px' }} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
          </div>
          {view === 'week' ? <WeekGrid s={s} branch={branch} monday={monday} prov={weekProvider} list={list} blk={blk} onBook={setBooking} onOpen={setOpen} onDay={(d) => { setDate(d); setView('day'); }} providerFixed={!!providerId} /> : !hours ? <Empty icon={<IconCalendarX size={28} />}>The clinic is closed on this day.</Empty> : (
            <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 230px)' }}>
              <div className="sched" style={{ '--cols': providers.length }}>
                <div className="sched-head" style={{ borderLeft: 'none' }} />
                {providers.map((p) => <div className="sched-head" key={p.id}>{p.name}<div className="tiny muted" style={{ fontWeight: 400 }}>{p.specialty || p.role}{!branch && p.locationIds?.length ? ` · ${p.locationIds.map((l) => locations.find((x) => x.id === l)?.name).filter(Boolean).join(', ')}` : ''}</div></div>)}
                <div>{Array.from({ length: (endH - startH) * 4 }, (_, i) => <div key={i} className="sched-time" style={{ height: slotPx, borderTop: i % 4 ? 'none' : undefined }}>{i % 4 === 0 ? `${((startH + i / 4) % 12) || 12}${startH + i / 4 < 12 ? 'a' : 'p'}` : ''}</div>)}</div>
                {providers.map((p) => (
                  <div className="sched-col" key={p.id}>
                    {Array.from({ length: (endH - startH) * 4 }, (_, i) => <div key={i} className={`sched-slot ${i % 4 === 0 ? 'hour' : ''}`} onClick={() => setBooking({ providerId: p.id, start: slotIso(date, startH, i * slotMin), locationId: branch || p.locationIds?.[0] })} title="Book here" style={{ cursor: 'pointer' }} />)}
                    {blk.filter((b) => b.providerId === p.id && (!branch || !b.locationId || b.locationId === branch)).map((b) => { const d = new Date(b.start); const top = Math.max(0, (minutesOfDay(b.start) - startH * 60) / slotMin * slotPx); const h = Math.max(slotPx, (new Date(b.end) - d) / 60000 / slotMin * slotPx - 2); return <div key={b.id} className="appt" style={{ top, height: h, background: 'repeating-linear-gradient(135deg, #eef2f5, #eef2f5 6px, #e3e9ee 6px, #e3e9ee 7px)', color: 'var(--muted)', cursor: 'default' }} title={b.reason}><div className="who truncate"><IconClockPause size={11} /> {b.reason || 'Blocked'}</div><div className="tiny">{fmtTime(b.start)} – {fmtTime(b.end)}</div><button className="btn sm ghost icon" style={{ position: 'absolute', right: 2, top: 2, padding: 2 }} onClick={() => run(async () => { await del(`/api/blocks/${b.id}`); refresh(); }, 'Block removed')}><IconTrash size={11} /></button></div>; })}
                    {list.filter((a) => a.providerId === p.id && a.status !== 'cancelled').map((a) => {
                      const d = new Date(a.start); const top = (minutesOfDay(a.start) - startH * 60) / slotMin * slotPx;
                      const h = Math.max(slotPx, (new Date(a.end) - d) / 60000 / slotMin * slotPx - 2);
                      return <div key={a.id} className={`appt ${a.status}`} style={{ top, height: h }} onClick={() => setOpen(a)}><div className="who truncate">{a.visit?.token ? `${a.visit.token} · ` : ''}{fullName(a.patient)}</div><div className="truncate">{a.visitType?.name} · {fmtTime(a.start)}{!branch && a.location ? ` · ${a.location.name}` : ''}</div>{a.source === 'ai' && <div className="tiny">booked by AI</div>}</div>;
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
        <div className="col gap-16">
          <div className="grid two">
            <Stat value={statList.filter((a) => !['cancelled', 'no_show'].includes(a.status)).length} label={view === 'week' ? 'Visits this week' : 'Visits this day'} />
            <Stat value={statList.filter((a) => a.status === 'scheduled').length} label="Unconfirmed" tone={statList.some((a) => a.status === 'scheduled') ? 'warn' : ''} />
          </div>
          {!providerId && <Card title={<span className="row gap-6"><IconBell size={16} />Reminders due</span>} actions={reminders.data?.length > 0 && <button className="btn sm primary" onClick={() => run(async () => { await post('/api/reminders/send'); refresh(); }, 'Reminders sent')}><IconSend size={14} />Send all</button>}>
            <div className="list">
              {(reminders.data || []).slice(0, 8).map((r) => <div className="list-item" key={r.appointment.id + r.hoursBefore}><div className="grow"><div className="small strong">{fullName(r.appointment.patient)}</div><div className="tiny muted">{r.hoursBefore}h reminder · {fmtWhen(r.appointment.start)} · {r.appointment.location?.name}</div></div><button className="btn sm" onClick={() => run(async () => { await post('/api/reminders/send', { appointmentId: r.appointment.id }); refresh(); }, 'Reminder sent')}>Send</button></div>)}
              {reminders.data?.length === 0 && <div className="empty small">All reminders are sent.</div>}
            </div>
          </Card>}
          {!providerId && <Card title={<span className="row gap-6"><IconListDetails size={16} />Waitlist</span>}>
            <div className="list">
              {(waitlist.data || []).filter((w) => w.status !== 'booked').map((w) => (
                <div className="list-item" key={w.id}>
                  <div className="grow"><div className="small strong">{fullName(w.patient)}</div><div className="tiny muted">{w.visitType?.name} · {w.location?.name || 'any branch'} · {w.preferredDays.join('/')} · {w.preferredTime}{w.note ? ` · ${w.note}` : ''}</div>
                    {w.status === 'offered' && w.offer && <div className="tiny" style={{ color: 'var(--accent-strong)' }}>Offered {fmtWhen(w.offer.start)} · {ago(w.offer.offeredAt)}</div>}
                  </div>
                  {w.status === 'offered' ? <div className="col gap-4"><button className="btn sm primary" onClick={() => run(async () => { await post(`/api/waitlist/${w.id}/accept`); refresh(); }, 'Booked from waitlist')}>Accepted</button><button className="btn sm ghost" onClick={() => run(async () => { await post(`/api/waitlist/${w.id}/decline`); refresh(); })}>Declined</button></div> : <button className="btn sm ghost" onClick={() => run(async () => { await del(`/api/waitlist/${w.id}`); refresh(); }, 'Removed')}>Remove</button>}
                </div>
              ))}
              {(waitlist.data || []).filter((w) => w.status !== 'booked').length === 0 && <div className="empty small">Nobody is waiting.</div>}
            </div>
          </Card>}
        </div>
      </div>
      {booking && s && <BookModal init={{ ...booking, locationId: booking.locationId || branch || undefined }} settings={s} onClose={() => setBooking(null)} onDone={(a) => { setBooking(null); setDate(a.start.slice(0, 10)); refresh(); }} />}
      {blocking && s && <BlockModal settings={s} providers={providers} date={date} branch={branch} onClose={() => setBlocking(null)} onDone={() => { setBlocking(null); refresh(); }} />}
      {open && s && <ApptModal appt={list.find((a) => a.id === open.id) || open} settings={s} onClose={() => setOpen(null)} onChange={refresh} onReschedule={() => { setBooking({ reschedule: open }); setOpen(null); }} />}
    </>
  );
}

function slotIso(date, startH, offsetMin) { return zonedToIso(date, startH + Math.floor(offsetMin / 60), offsetMin % 60); }

export function PatientPicker({ value, onChange, autoFocus }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', dob: '', phone: '', email: '', preferredLanguage: 'en' });
  const [run] = useAction();
  useEffect(() => { if (!value) get(`/api/patients?q=${encodeURIComponent(q)}`).then(setResults).catch(() => {}); }, [q, value]);
  if (value) return <div className="row card soft" style={{ padding: '8px 12px' }}><Avatar patient={value} /><div className="grow"><div className="strong">{fullName(value)}</div><div className="tiny muted">{value.dob} · {fmtPhone(value.phone)}{value.abhaNumber ? ` · ABHA ${value.abhaNumber}` : ''}</div></div><button className="btn sm ghost" onClick={() => onChange(null)}>Change</button></div>;
  return (
    <div className="col gap-6">
      <input className="input" placeholder="Search by name, mobile, ABHA, or date of birth" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus} />
      {!creating && <div className="list card soft" style={{ maxHeight: 180, overflow: 'auto' }}>
        {results.slice(0, 6).map((p) => <div key={p.id} className="list-item clickable" style={{ padding: '8px 12px' }} onClick={() => onChange(p)}><Avatar patient={p} /><div className="grow"><div className="small strong">{fullName(p)}</div><div className="tiny muted">{p.dob} · {fmtPhone(p.phone)}{p.upcoming ? ` · next ${fmtDate(p.upcoming.start)}` : ''}</div></div></div>)}
        <div className="list-item clickable" style={{ padding: '8px 12px' }} onClick={() => setCreating(true)}><IconPlus size={16} className="muted" /><span className="small">New patient…</span></div>
      </div>}
      {creating && <div className="card soft" style={{ padding: 12 }}><div className="grid two">
        <Field label="First name"><input className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
        <Field label="Last name"><input className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
        <Field label="Date of birth"><input className="input" type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></Field>
        <Field label="Mobile (+91)"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field label="Email"><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Language"><select className="input" value={form.preferredLanguage} onChange={(e) => setForm({ ...form, preferredLanguage: e.target.value })}><option value="en">English</option><option value="hi">हिन्दी</option><option value="kn">ಕನ್ನಡ</option></select></Field>
      </div><div className="row mt-8"><button className="btn primary sm" onClick={() => run(async () => { const p = await post('/api/patients', form); onChange(p); }, 'Patient added')}>Add patient</button><button className="btn sm ghost" onClick={() => setCreating(false)}>Cancel</button></div></div>}
    </div>
  );
}

export function SlotPicker({ visitTypeId, providerId, locationId, date, onPick, value, durationMin }) {
  const [day, setDay] = useState(date || todayKey());
  const [slots, setSlots] = useState(null);
  useEffect(() => { if (visitTypeId) get(`/api/availability?visitTypeId=${visitTypeId}&date=${day}${providerId ? `&providerId=${providerId}` : ''}${locationId ? `&locationId=${locationId}` : ''}${durationMin ? `&durationMin=${durationMin}` : ''}`).then(setSlots).catch(() => setSlots([])); }, [visitTypeId, providerId, locationId, day, durationMin]);
  return (
    <div className="col gap-6">
      <div className="row"><button className="btn sm icon" onClick={() => setDay(addDaysKey(day, -1))}><IconChevronLeft size={14} /></button><span className="small strong" style={{ minWidth: 150, textAlign: 'center' }}>{fmtDateLong(day)}</span><button className="btn sm icon" onClick={() => setDay(addDaysKey(day, 1))}><IconChevronRight size={14} /></button><input className="input" type="date" style={{ width: 150, padding: '4px 8px' }} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} /></div>
      {!visitTypeId ? <div className="tiny muted">Choose a visit type to see openings.</div> : slots === null ? <div className="skeleton" /> : slots.length === 0 ? <div className="tiny muted">No openings that day.</div> : (
        <div className="tag-list">{slots.map((s) => <button key={s.start + s.providerId + s.locationId} className={`btn sm ${value?.start === s.start && value?.providerId === s.providerId ? 'primary' : ''}`} onClick={() => onPick(s)}>{fmtTime(s.start)}<span className="tiny" style={{ opacity: 0.7 }}> · {s.providerName.replace('Dr. ', '').split(' ')[0]}{!locationId ? ` · ${s.locationName}` : ''}</span></button>)}</div>
      )}
    </div>
  );
}

function BookModal({ init, settings, onClose, onDone }) {
  const resched = init.reschedule || null;
  const [patient, setPatient] = useState(resched?.patient || null);
  const [visitTypeId, setVisitTypeId] = useState(resched?.visitTypeId || init.visitTypeId || '');
  const [providerId, setProviderId] = useState(resched?.providerId || init.providerId || '');
  const [locationId, setLocationId] = useState(resched?.locationId || init.locationId || '');
  const [slot, setSlot] = useState(init.start ? { start: init.start, providerId: init.providerId, locationId: init.locationId } : null);
  const [notes, setNotes] = useState('');
  const [est, setEst] = useState(null);
  const [useEst, setUseEst] = useState(true);
  useEffect(() => { if (!visitTypeId) { setEst(null); return; } const t = setTimeout(() => post('/api/estimates/appointment', { visitTypeId, providerId: providerId || undefined, patientId: patient?.id, notes }).then(setEst).catch(() => setEst(null)), 300); return () => clearTimeout(t); }, [visitTypeId, providerId, patient?.id, notes]);
  const durationMin = est && useEst && est.minutes !== est.scheduled ? est.minutes : undefined;
  const [sendForms, setSendForms] = useState(true);
  const [run, busy] = useAction();
  useEffect(() => { if (init.patientId && !patient) get(`/api/patients/${init.patientId}`).then((p) => { setPatient(p); if (!locationId && p.locationId) setLocationId(p.locationId); }).catch(() => {}); }, [init.patientId]); // eslint-disable-line
  const vt = settings.visitTypes.find((v) => v.id === visitTypeId);
  const provs = settings.providers.filter((p) => (!vt || !vt.providerRole || p.role === vt.providerRole) && (!locationId || !p.locationIds?.length || p.locationIds.includes(locationId)));
  const submit = () => run(async () => {
    const a = resched ? await post(`/api/appointments/${resched.id}/reschedule`, { start: slot.start, providerId: slot.providerId || providerId, locationId: slot.locationId || locationId || undefined })
      : await post('/api/appointments', { patientId: patient.id, visitTypeId, providerId: slot.providerId || providerId || undefined, locationId: slot.locationId || locationId || undefined, start: slot.start, notes, sendForms, durationMin });
    onDone(a);
  }, resched ? 'Appointment moved' : 'Appointment booked');
  return (
    <Modal title={resched ? `Reschedule ${fullName(resched.patient)}` : 'Book an appointment'} onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !patient || !visitTypeId || !slot} onClick={submit}><IconCheck size={16} />{resched ? 'Move appointment' : 'Book'}</button></>}>
      {!resched && <Field label="Patient"><PatientPicker value={patient} onChange={(p) => { setPatient(p); if (p?.locationId && !init.locationId) setLocationId(p.locationId); }} autoFocus /></Field>}
      <div className="grid three">
        <Field label="Visit type"><select className="input" value={visitTypeId} onChange={(e) => { setVisitTypeId(e.target.value); setSlot(null); }} disabled={!!resched}><option value="">Choose…</option>{settings.visitTypes.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.durationMin} min{v.fee ? ` · ${fmtMoney(v.fee)}` : ''}</option>)}</select></Field>
        <Field label="Branch"><select className="input" value={locationId} onChange={(e) => { setLocationId(e.target.value); setProviderId(''); setSlot(null); }}><option value="">Any branch</option>{settings.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <Field label="Dentist"><select className="input" value={providerId} onChange={(e) => { setProviderId(e.target.value); setSlot(null); }}><option value="">Any available</option>{provs.map((p) => <option key={p.id} value={p.id}>{p.name}{p.specialty ? ` · ${p.specialty}` : ''}</option>)}</select></Field>
      </div>
      {!resched && <Field label="Notes"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. RCT #36 sitting 2, crown prep #46" /></Field>}
      {!resched && est && <div className="callout small"><div className="row between wrap"><span><IconSparkles size={14} /> <b>Estimated chair time: {est.minutes} min</b> <span className="muted">(scheduled length {est.scheduled} min · confidence {est.confidence})</span></span><label className="check tiny"><input type="checkbox" checked={useEst} onChange={(e) => setUseEst(e.target.checked)} />Book for {est.minutes} min</label></div><div className="tiny muted" style={{ marginTop: 4 }}>{est.breakdown.map((b) => `${b.label}: ${b.minutes > 0 ? '+' : ''}${b.minutes} min`).join(' · ')}</div></div>}
      <Field label="Time"><SlotPicker visitTypeId={visitTypeId} providerId={providerId} locationId={locationId} durationMin={durationMin} date={slot?.start ? slot.start.slice(0, 10) : undefined} value={slot} onPick={setSlot} /></Field>
      {slot && <div className="callout">{resched ? 'Moving to' : 'Booking'} <b>{vt?.name}</b> on <b>{fmtWhen(slot.start)}</b>{slot.providerName ? ` with ${slot.providerName}` : ''}{slot.locationName ? ` at ${slot.locationName}` : ''}.{vt?.fee ? ` Fee ${fmtMoney(vt.fee)}.` : ''}</div>}
      {!resched && <>
        <label className="check small"><input type="checkbox" checked={sendForms} onChange={(e) => setSendForms(e.target.checked)} />Send pre-visit form link on WhatsApp now</label></>}
    </Modal>
  );
}

function BlockModal({ settings, providers, date, branch, onClose, onDone }) {
  const [providerId, setProviderId] = useState(providers[0]?.id || '');
  const [day, setDay] = useState(date);
  const [from, setFrom] = useState('13:00');
  const [to, setTo] = useState('14:00');
  const [allDay, setAllDay] = useState(false);
  const [reason, setReason] = useState('');
  const [result, setResult] = useState(null);
  const [run, busy] = useAction();
  const mk = (t) => { const [h, m] = t.split(':').map(Number); return zonedToIso(day, h, m); };
  return (
    <Modal title="Block time" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn primary" disabled={busy || !providerId} onClick={() => run(async () => { const r = await post('/api/blocks', { providerId, locationId: branch || undefined, start: allDay ? mk('00:00') : mk(from), end: allDay ? mk('23:59') : mk(to), reason }); setResult(r); if (!r.affectedAppointments.length) onDone(); }, 'Time blocked')}><IconCheck size={16} />Block</button></>}>
      <div className="grid two">
        <Field label="Dentist / hygienist"><select className="input" value={providerId} onChange={(e) => setProviderId(e.target.value)}>{providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Date"><input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
        <label className="check small"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />Whole day (leave / holiday)</label>
        {!allDay && <div className="row"><input className="input" type="time" value={from} onChange={(e) => setFrom(e.target.value)} /><span className="muted">to</span><input className="input" type="time" value={to} onChange={(e) => setTo(e.target.value)} /></div>}
      </div>
      <Field label="Reason"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Leave, lunch, lab work, conference…" /></Field>
      {result?.affectedAppointments?.length > 0 && <div className="callout warn small"><b>{result.affectedAppointments.length} appointment(s) fall inside this block</b> and need rescheduling: {result.affectedAppointments.map((a) => `${fullName(a.patient)} ${fmtTime(a.start)}`).join(', ')}. The block is saved; open each appointment to move it and the waitlist will be offered the old slot.</div>}
    </Modal>
  );
}

function ApptModal({ appt, settings, onClose, onChange, onReschedule }) {
  const [run, busy] = useAction();
  const [cal, setCal] = useState(null);
  useEffect(() => { get(`/api/calendar/links/${appt.id}`).then(setCal).catch(() => {}); }, [appt.id]);
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const act = (fn, msg) => run(async () => { await fn(); onChange(); onClose(); }, msg);
  const active = ['scheduled', 'confirmed', 'arrived', 'ready', 'in_chair'].includes(appt.status);
  return (
    <Modal title={fullName(appt.patient)} onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="row wrap gap-6"><Pill status={appt.status} /><Pill tone="outline">{appt.visitType?.name}</Pill><Pill tone="outline">{fmtWhen(appt.start)} – {fmtTime(appt.end)}</Pill><Pill tone="outline">{appt.provider?.name}</Pill><Pill tone="outline">{appt.location?.name}</Pill>{appt.source === 'ai' && <Pill tone="accent">Booked by AI</Pill>}{appt.source === 'ehr' && <Pill tone="violet">From EHR</Pill>}{appt.fee ? <Pill status={appt.paymentStatus || 'unpaid'}>{fmtMoney(appt.fee)} · {appt.paymentStatus || 'unpaid'}</Pill> : null}</div>
      <div className="grid two">
        <div className="small"><div className="muted">Mobile</div>{fmtPhone(appt.patient?.phone) || '—'}</div>
        <div className="small"><div className="muted">Forms</div><Pill status={appt.packetStatus || 'created'} /></div>
        <div className="small"><div className="muted">Confirmed</div>{appt.confirmedAt ? fmtWhen(appt.confirmedAt) : 'Not yet'}</div>
        <div className="small"><div className="muted">Reminders sent</div>{appt.reminders?.length ? appt.reminders.map((r) => `${r.hoursBefore}h`).join(', ') : 'None'}</div>
      </div>
      {appt.notes && <div className="callout small">{appt.notes}</div>}
      {cal && <div className="row gap-6 wrap tiny"><IconCalendarPlus size={14} className="muted" /><a className="btn sm ghost" href={cal.google} target="_blank" rel="noreferrer">Add to Google Calendar</a><a className="btn sm ghost" href={cal.outlook} target="_blank" rel="noreferrer">Outlook</a><a className="btn sm ghost" href={`/api/calendar/appointment/${appt.id}.ics?t=${settings.tenant?.slug || ''}`} download>.ics file</a></div>}
      {appt.status === 'cancelled' && <div className="callout bad small">Cancelled {ago(appt.cancelledAt)}{appt.cancelReason ? ` · ${appt.cancelReason}` : ''}{appt.cancelledLate ? ' · inside the notice window' : ''}</div>}
      {active && (
        <div className="row wrap gap-6">
          {appt.status === 'scheduled' && <button className="btn" onClick={() => act(() => post(`/api/appointments/${appt.id}/confirm`), 'Confirmed')}><IconCheck size={16} />Confirm</button>}
          <button className="btn" onClick={onReschedule}><IconCalendarRepeat size={16} />Reschedule</button>
          {!appt.packetStatus && <button className="btn" onClick={() => act(() => post('/api/forms/send', { appointmentId: appt.id }), 'Forms sent')}><IconSend size={16} />Send forms</button>}
          <button className="btn danger" onClick={() => setCancelling(true)}><IconCalendarX size={16} />Cancel visit</button>
        </div>
      )}
      {cancelling && <div className="card soft" style={{ padding: 12 }}><Field label="Reason"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. patient request" autoFocus /></Field><div className="row mt-8"><button className="btn danger" disabled={busy} onClick={() => act(() => post(`/api/appointments/${appt.id}/cancel`, { reason }), 'Cancelled; waitlist checked')}>Confirm cancellation</button><button className="btn ghost" onClick={() => setCancelling(false)}>Keep</button></div><div className="tiny muted mt-8">If a waitlisted patient matches, Clinovara offers them this time automatically on WhatsApp.</div></div>}
    </Modal>
  );
}

/** Seven days for one dentist, on the same grid the front desk uses. Click an empty slot to book, a card to open it, a day heading to zoom into that day. */
function WeekGrid({ s, branch, monday, prov, list, blk, onBook, onOpen, onDay }) {
  if (!s || !prov) return <div className="skeleton" />;
  const days = Array.from({ length: 7 }, (_, i) => addDaysKey(monday, i));
  const loc = s.locations?.find((l) => l.id === branch);
  const src = loc?.hours || s.practice.hours;
  const open = days.map((d) => src[DAYS[new Date(d + 'T12:00:00').getDay()]]).filter(Boolean);
  const startH = open.length ? Math.min(...open.map((h) => Number(h[0].split(':')[0]))) : 9;
  const endH = open.length ? Math.max(...open.map((h) => Math.ceil(Number(h[1].split(':')[0]) + Number(h[1].split(':')[1]) / 60))) : 19;
  const slotMin = 15; const slotPx = 24; const today = todayKey();
  const mine = list.filter((a) => a.providerId === prov.id && a.status !== 'cancelled');
  return (
    <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 230px)' }}>
      <div className="sched" style={{ '--cols': 7 }}>
        <div className="sched-head" style={{ borderLeft: 'none' }} />
        {days.map((d) => <div className="sched-head" key={d} style={{ cursor: 'pointer', background: d === today ? 'var(--accent-soft)' : undefined }} onClick={() => onDay(d)}>{fmtDate(d).split(',')[0]} <b>{d.slice(8)}</b><div className="tiny muted" style={{ fontWeight: 400 }}>{mine.filter((a) => a.start.slice(0, 10) === d || dayKey(a.start) === d).length} visits</div></div>)}
        <div>{Array.from({ length: (endH - startH) * 4 }, (_, i) => <div key={i} className="sched-time" style={{ height: slotPx, borderTop: i % 4 ? 'none' : undefined }}>{i % 4 === 0 ? `${((startH + i / 4) % 12) || 12}${startH + i / 4 < 12 ? 'a' : 'p'}` : ''}</div>)}</div>
        {days.map((d) => {
          const h = src[DAYS[new Date(d + 'T12:00:00').getDay()]];
          const dayAppts = mine.filter((a) => dayKey(a.start) === d);
          const dayBlocks = blk.filter((b) => b.providerId === prov.id && dayKey(b.start) === d);
          const inHours = (i) => { if (!h) return false; const mins = startH * 60 + i * slotMin; const [a, b] = [h[0], h[1]].map((t) => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1])); return mins >= a && mins < b; };
          return (
            <div className="sched-col" key={d} style={!h ? { background: 'var(--surface-2)' } : undefined}>
              {Array.from({ length: (endH - startH) * 4 }, (_, i) => <div key={i} className={`sched-slot ${i % 4 === 0 ? 'hour' : ''}`} style={{ cursor: inHours(i) ? 'pointer' : 'default', background: inHours(i) ? undefined : 'var(--surface-2)' }} title={inHours(i) ? 'Book here' : 'Closed'} onClick={() => inHours(i) && onBook({ providerId: prov.id, start: slotIso(d, startH, i * slotMin), locationId: branch || prov.locationIds?.[0] })} />)}
              {dayBlocks.map((b) => { const t = new Date(b.start); const top = Math.max(0, (minutesOfDay(b.start) - startH * 60) / slotMin * slotPx); const ht = Math.max(slotPx, (new Date(b.end) - t) / 60000 / slotMin * slotPx); return <div key={b.id} className="appt blocked" style={{ top, height: ht, background: 'repeating-linear-gradient(45deg,var(--surface-2),var(--surface-2) 6px,var(--border) 6px,var(--border) 12px)', color: 'var(--muted)' }}><div className="who truncate">{b.reason || 'Blocked'}</div></div>; })}
              {dayAppts.map((a) => { const t = new Date(a.start); const top = (minutesOfDay(a.start) - startH * 60) / slotMin * slotPx; const ht = Math.max(slotPx, (new Date(a.end) - t) / 60000 / slotMin * slotPx - 2); return <div key={a.id} className={`appt ${a.status}`} style={{ top, height: ht }} onClick={() => onOpen(a)}><div className="who truncate">{a.visit?.token ? `${a.visit.token} · ` : ''}{fullName(a.patient)}</div><div className="truncate">{a.visitType?.name} · {fmtTime(a.start)}</div></div>; })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
