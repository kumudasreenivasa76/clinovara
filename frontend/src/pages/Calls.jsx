import React, { useState } from 'react';
import { IconPhoneCall, IconLanguage, IconAlertTriangle, IconCheck, IconCalendarPlus, IconX, IconClockHour4 } from '@tabler/icons-react';
import { get } from '../lib/api.js';
import { ago, fmtWhen, fmtPhone, fullName } from '../lib/format.js';
import { Card, Body, Pill, Avatar, Empty, usePoll, Seg, Modal, Stat } from '../components/ui.jsx';

const OUTCOME_TONE = { booked: 'good', rescheduled: 'good', cancelled: 'outline', info: 'outline', message: 'warn', clinical_question: 'warn', emergency: 'bad', abandoned: 'outline' };
const OUTCOME_LABEL = { booked: 'Booked', rescheduled: 'Rescheduled', cancelled: 'Cancelled', info: 'Question answered', message: 'Message taken', clinical_question: 'Sent to dentist', emergency: 'Emergency — ER/108', abandoned: 'Caller hung up' };

/** Calls the virtual assistant answered: what it did, in which language, and what it could not handle. */
export default function Calls() {
  const { data } = usePoll(() => get('/api/calls?limit=200'), [], 8000);
  const [filter, setFilter] = useState('all');
  const [openCall, setOpenCall] = useState(null);
  if (!data) return <div className="skeleton" />;
  const list = data.filter((c) => filter === 'all' || (filter === 'open' ? c.status === 'open' : c.outcome === filter));
  const counts = { total: data.length, afterHours: data.filter((c) => c.afterHours).length, open: data.filter((c) => c.status === 'open').length, needsReply: data.filter((c) => ['message', 'clinical_question'].includes(c.outcome)).length, emergencies: data.filter((c) => c.outcome === 'emergency').length };
  return (
    <>
      <div className="page-head">
        <div><h1>Calls</h1><p>Every call the virtual assistant answered, mainly after hours and at night. It books, reschedules and answers general questions in the caller's own language, and hands anything clinical to the dentist.</p></div>
        <Seg value={filter} onChange={setFilter} options={[{ value: 'all', label: `All (${data.length})` }, { value: 'open', label: `In progress (${counts.open})` }, { value: 'message', label: 'Messages left' }, { value: 'clinical_question', label: 'Sent to dentist' }, { value: 'booked', label: 'Booked' }]} />
      </div>
      <div className="grid four mb-16">
        <Stat value={counts.total} label="Calls answered" />
        <Stat value={counts.afterHours} label="After hours" tone={counts.afterHours ? 'warn' : ''} />
        <Stat value={counts.needsReply} label="Waiting on a reply from staff" tone={counts.needsReply ? 'warn' : 'good'} onClick={() => setFilter('message')} />
        <Stat value={counts.emergencies} label="Possible emergencies" tone={counts.emergencies ? 'bad' : 'good'} />
      </div>
      <Card>
        <div className="list">
          {list.map((c) => (
            <div className="list-item clickable" key={c.id} onClick={() => setOpenCall(c)}>
              <Avatar patient={c.patient} name={c.contactName} />
              <div className="grow">
                <div className="row gap-6 wrap"><span className="strong">{c.contactName}</span><Pill tone="outline"><IconLanguage size={11} />{c.language?.toUpperCase()}</Pill>{c.afterHours && <Pill tone="violet">After hours</Pill>}{c.status === 'open' && <Pill tone="accent">In progress</Pill>}</div>
                <div className="tiny muted">{fmtPhone(c.phone)} · {ago(c.startedAt)}{c.notes?.summary ? ` · ${c.notes.summary}` : ''}</div>
              </div>
              {c.outcome && <Pill tone={OUTCOME_TONE[c.outcome] || 'outline'}>{c.outcome === 'emergency' && <IconAlertTriangle size={11} />}{OUTCOME_LABEL[c.outcome] || c.outcome}</Pill>}
            </div>
          ))}
          {list.length === 0 && <Empty icon={<IconPhoneCall size={28} />}>No calls yet. Connect a phone system under Settings → Virtual assistant, or try one from there.</Empty>}
        </div>
      </Card>
      {openCall && <CallDrawer call={openCall} onClose={() => setOpenCall(null)} />}
    </>
  );
}

function CallDrawer({ call, onClose }) {
  const n = call.notes || {};
  return (
    <Modal title={`Call with ${call.contactName}`} onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="row wrap gap-6">
        <Pill tone="outline">{fmtPhone(call.phone)}</Pill>
        <Pill tone="outline"><IconLanguage size={11} />{call.language?.toUpperCase()}</Pill>
        <Pill tone="outline"><IconClockHour4 size={11} />{fmtWhen(call.startedAt)}</Pill>
        {call.afterHours && <Pill tone="violet">After hours</Pill>}
        {call.outcome && <Pill tone={OUTCOME_TONE[call.outcome] || 'outline'}>{OUTCOME_LABEL[call.outcome] || call.outcome}</Pill>}
      </div>
      {n.summary && <div className="callout small mt-8"><b>Summary:</b> {n.summary}</div>}
      {n.clinicalQuestion && <div className="callout small warn mt-8"><IconAlertTriangle size={14} /> <b>For the dentist:</b> "{n.clinicalQuestion}"</div>}
      <div className="list card soft mt-16">
        {call.transcript?.map((t, i) => (
          <div className="list-item start" key={i} style={{ padding: '8px 14px' }}>
            <span className={`pill ${t.from === 'assistant' ? 'accent' : 'outline'}`} style={{ minWidth: 76, textAlign: 'center', flexShrink: 0 }}>{t.from === 'assistant' ? 'Assistant' : 'Caller'}</span>
            <div className="small grow">{t.text}{t.escalated && <IconAlertTriangle size={12} style={{ color: 'var(--warn)', marginLeft: 6 }} />}</div>
          </div>
        ))}
        {(!call.transcript || call.transcript.length === 0) && <Empty>No transcript.</Empty>}
      </div>
      {call.appointmentId && <div className="callout small good mt-8"><IconCalendarPlus size={14} /> Booked appointment {call.appointmentId}</div>}
      {call.callbackId && <div className="callout small mt-8"><IconCheck size={14} /> Added to Callbacks for a staff follow-up.</div>}
      {call.status === 'open' && <div className="callout small warn mt-8"><IconX size={14} /> This call has not ended in the log yet.</div>}
    </Modal>
  );
}
