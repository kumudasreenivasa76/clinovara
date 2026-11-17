/**
 * Common dental prescribing list and the safety checks a dentist would do in their head:
 * drug allergy, blood thinners, pregnancy, stomach/kidney/liver/asthma/BP issues, and children.
 * The list is a convenience, not clinical advice: the dentist always decides and can override a
 * high-severity warning with a written reason, which is kept on the prescription.
 */
export const DRUGS = [
  { id: 'amox500', name: 'Amoxicillin', strength: '500 mg', form: 'Capsule', dose: '1 capsule', frequency: 'Three times a day', days: 5, cls: 'penicillin' },
  { id: 'amoxclav625', name: 'Amoxicillin + Clavulanic acid', strength: '625 mg', form: 'Tablet', dose: '1 tablet', frequency: 'Twice a day', days: 5, cls: 'penicillin' },
  { id: 'azithro500', name: 'Azithromycin', strength: '500 mg', form: 'Tablet', dose: '1 tablet', frequency: 'Once a day', days: 3, cls: 'macrolide' },
  { id: 'clinda300', name: 'Clindamycin', strength: '300 mg', form: 'Capsule', dose: '1 capsule', frequency: 'Four times a day', days: 5, cls: 'lincosamide' },
  { id: 'metro400', name: 'Metronidazole', strength: '400 mg', form: 'Tablet', dose: '1 tablet', frequency: 'Three times a day', days: 5, cls: 'nitroimidazole' },
  { id: 'ibu400', name: 'Ibuprofen', strength: '400 mg', form: 'Tablet', dose: '1 tablet', frequency: 'Three times a day, after food', days: 3, cls: 'nsaid' },
  { id: 'diclo50', name: 'Diclofenac', strength: '50 mg', form: 'Tablet', dose: '1 tablet', frequency: 'Twice a day, after food', days: 3, cls: 'nsaid' },
  { id: 'aceclo', name: 'Aceclofenac + Paracetamol', strength: '100 mg + 325 mg', form: 'Tablet', dose: '1 tablet', frequency: 'Twice a day, after food', days: 3, cls: 'nsaid' },
  { id: 'para650', name: 'Paracetamol', strength: '650 mg', form: 'Tablet', dose: '1 tablet', frequency: 'When needed for pain (max 4 a day)', days: 3, cls: 'paracetamol' },
  { id: 'panto40', name: 'Pantoprazole', strength: '40 mg', form: 'Tablet', dose: '1 tablet', frequency: 'Once a day, before breakfast', days: 5, cls: 'ppi' },
  { id: 'chx02', name: 'Chlorhexidine mouthwash', strength: '0.2%', form: 'Mouthwash', dose: '10 ml, rinse 30 seconds, do not swallow', frequency: 'Twice a day', days: 7, cls: 'antiseptic' },
];

const has = (text, re) => re.test(String(text || ''));
const ALLERGY_CLASS = {
  penicillin: /penicillin|amoxicillin|amoxyclav|augmentin|ampicillin|cloxacillin/i,
  macrolide: /macrolide|azithro|erythro|clarithro/i,
  lincosamide: /clindamycin|lincomycin/i,
  nitroimidazole: /metronidazole|flagyl|nitroimidazole/i,
  nsaid: /nsaid|ibuprofen|diclofenac|aspirin|aceclofenac|brufen/i,
  paracetamol: /paracetamol|acetaminophen|crocin|dolo/i,
};

/** facts = { allergies, conditions[], bloodThinners, pregnant, ageYears, medicines } gathered from the patient's pre-visit form. */
export function checkRx(facts, drugIds) {
  const out = [];
  const add = (drug, level, text) => out.push({ drugId: drug.id, drug: drug.name, level, text });
  const conds = (facts.conditions || []).join(' ').toLowerCase();
  const picked = drugIds.map((id) => DRUGS.find((d) => d.id === id)).filter(Boolean);
  for (const d of picked) {
    if (ALLERGY_CLASS[d.cls] && has(facts.allergies, ALLERGY_CLASS[d.cls])) add(d, 'high', `Patient reports an allergy that matches ${d.cls === 'nsaid' ? 'NSAIDs' : d.name}. Do not prescribe unless you have checked.`);
    if (d.cls === 'nsaid') {
      if (facts.bloodThinners) add(d, 'high', 'On blood thinners: NSAIDs raise bleeding risk. Paracetamol is usually preferred.');
      if (/ulcer|gastric|acidity|gerd|kidney|renal|asthma/.test(conds)) add(d, 'high', 'History of ulcer, kidney disease or asthma: NSAIDs may be unsafe.');
      if (/hypertension|blood pressure|heart/.test(conds) || has(facts.medicines, /telmisartan|amlodipine|losartan|atenolol|metoprolol|enalapril/i)) add(d, 'medium', 'Blood pressure or heart condition: NSAIDs can raise blood pressure and blunt BP medicines.');
      if (facts.pregnant) add(d, 'high', 'Pregnant or nursing: avoid NSAIDs.');
      if (facts.ageYears != null && facts.ageYears < 12) add(d, 'medium', 'Child: use a weight-based dose.');
    }
    if (d.cls === 'nitroimidazole') {
      if (facts.bloodThinners && has(facts.medicines, /warfarin|acitrom|acenocoumarol/i)) add(d, 'high', 'Metronidazole strongly increases the effect of warfarin-type blood thinners.');
      if (facts.pregnant) add(d, 'medium', 'Pregnant or nursing: avoid in the first trimester and check before use.');
      add(d, 'low', 'Advise no alcohol during and for 48 hours after.');
    }
    if (d.cls === 'paracetamol' && /liver|hepat/.test(conds)) add(d, 'medium', 'Liver disease: reduce the dose or avoid.');
    if (d.cls === 'penicillin' && /kidney|renal/.test(conds)) add(d, 'low', 'Kidney disease: the dose may need adjusting.');
    if (d.cls === 'macrolide' && has(facts.medicines, /atorvastatin|simvastatin|warfarin/i)) add(d, 'low', 'Can interact with statins and warfarin. Keep the course short.');
    if (facts.ageYears != null && facts.ageYears < 12 && ['penicillin', 'macrolide', 'lincosamide', 'nitroimidazole', 'paracetamol'].includes(d.cls)) add(d, 'medium', 'Child: use a weight-based dose, not the adult tablet.');
  }
  if (picked.some((d) => d.cls === 'nsaid') && !picked.some((d) => d.cls === 'ppi') && !out.some((w) => w.level === 'high' && w.drugId && picked.find((x) => x.id === w.drugId)?.cls === 'nsaid')) {
    out.push({ drugId: null, drug: 'Stomach cover', level: 'low', text: 'Consider adding pantoprazole when an NSAID is prescribed for more than two days.' });
  }
  if (picked.filter((d) => d.cls === 'nsaid').length > 1) out.push({ drugId: null, drug: 'Duplicate', level: 'high', text: 'Two NSAIDs selected. Use only one.' });
  return out;
}
