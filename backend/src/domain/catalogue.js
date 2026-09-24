/**
 * Procedure and fee catalogue. The owner/admin sets it; dentists pick from it.
 * The fee policy decides how much room a dentist has:
 *   fixed     — the catalogue fee is used as-is (default)
 *   range     — the dentist may quote anywhere between minFee and maxFee for that procedure
 *   flexible  — the dentist may quote any fee, with a note
 * `allowCustom` lets a dentist add a procedure that is not in the catalogue (fee open, note required).
 * Every price a dentist records passes through priceItem(), so the policy is enforced server-side.
 */
import { bad } from '../lib.js';

export function defaultProcedures() {
  const P = (id, name, category, fee, minFee, maxFee, durationMin, keywords, aftercareId = null, quote = true) => ({ id, name, category, fee, minFee, maxFee, durationMin, keywords, aftercareId, quote, active: true });
  return [
    P('pr_consult', 'Consultation & examination', 'Diagnosis', 500, 300, 800, 20, ['consult', 'consultation', 'examination', 'check', 'checkup'], 'ac_general'),
    P('pr_iopa', 'X-ray (IOPA)', 'Diagnosis', 250, 200, 400, 10, ['iopa', 'x-ray', 'xray', 'radiograph'], null),
    P('pr_opg', 'X-ray (OPG panoramic)', 'Diagnosis', 800, 600, 1200, 15, ['opg', 'panoramic'], null),
    P('pr_scaling', 'Scaling & polishing', 'Preventive', 1500, 1000, 2500, 45, ['scaling', 'cleaning', 'polish', 'polishing', 'prophylaxis'], 'ac_cleaning'),
    P('pr_fluoride', 'Fluoride application', 'Preventive', 800, 500, 1200, 15, ['fluoride', 'varnish'], 'ac_general'),
    P('pr_sealant', 'Pit & fissure sealant (per tooth)', 'Preventive', 700, 500, 1000, 15, ['sealant', 'fissure'], 'ac_general'),
    P('pr_composite', 'Composite filling', 'Restorative', 1800, 1200, 3000, 30, ['composite', 'filling', 'tooth coloured filling', 'restoration'], 'ac_filling'),
    P('pr_gic', 'GIC filling', 'Restorative', 1200, 800, 1800, 30, ['gic', 'glass ionomer'], 'ac_filling'),
    P('pr_rct_anterior', 'Root canal treatment (front tooth)', 'Endodontics', 4500, 3500, 7000, 60, ['rct anterior', 'root canal front', 'anterior rct', 'root canal incisor', 'root canal canine'], 'ac_rct'),
    P('pr_rct_molar', 'Root canal treatment (molar)', 'Endodontics', 6500, 5000, 10000, 75, ['rct', 'root canal', 'molar rct', 'premolar rct', 'pulpitis'], 'ac_rct'),
    P('pr_post_core', 'Post & core', 'Endodontics', 2500, 1800, 4000, 30, ['post and core', 'post & core', 'post core', 'fibre post'], 'ac_rct'),
    P('pr_crown_pfm', 'Crown — PFM (metal-ceramic)', 'Prosthodontics', 6500, 5000, 9000, 45, ['pfm', 'pfm crown', 'metal ceramic', 'cap'], 'ac_crown'),
    P('pr_crown_zirconia', 'Crown — zirconia', 'Prosthodontics', 12000, 9000, 18000, 45, ['zirconia', 'zirconia crown', 'all ceramic', 'e-max', 'emax'], 'ac_crown'),
    P('pr_bridge', 'Bridge (per unit)', 'Prosthodontics', 7000, 5000, 12000, 60, ['bridge'], 'ac_crown'),
    P('pr_veneer', 'Veneer (per tooth)', 'Cosmetic', 12000, 8000, 20000, 60, ['veneer', 'laminate'], 'ac_crown'),
    P('pr_whitening', 'Teeth whitening (in-clinic)', 'Cosmetic', 8000, 6000, 15000, 60, ['whitening', 'bleaching', 'bleach'], 'ac_whitening'),
    P('pr_ext_simple', 'Extraction — simple', 'Oral surgery', 1500, 1000, 2500, 30, ['extraction', 'remove tooth', 'pull', 'nikalna'], 'ac_extraction'),
    P('pr_ext_surgical', 'Extraction — surgical / wisdom tooth', 'Oral surgery', 5000, 3500, 9000, 60, ['wisdom', 'surgical extraction', 'impacted', 'third molar'], 'ac_extraction'),
    P('pr_implant', 'Dental implant (per unit, incl. crown)', 'Implants', 35000, 25000, 60000, 90, ['implant'], 'ac_implant'),
    P('pr_denture_complete', 'Complete denture (per arch)', 'Prosthodontics', 15000, 10000, 30000, 60, ['complete denture', 'full denture', 'denture'], 'ac_general'),
    P('pr_denture_partial', 'Partial denture', 'Prosthodontics', 8000, 5000, 15000, 45, ['partial denture', 'rpd'], 'ac_general'),
    P('pr_braces_metal', 'Braces — metal (full treatment)', 'Orthodontics', 35000, 25000, 55000, 45, ['metal braces', 'braces'], 'ac_ortho'),
    P('pr_braces_ceramic', 'Braces — ceramic (full treatment)', 'Orthodontics', 55000, 40000, 80000, 45, ['ceramic braces'], 'ac_ortho'),
    P('pr_aligners', 'Clear aligners (full treatment)', 'Orthodontics', 90000, 60000, 200000, 45, ['aligner', 'aligners', 'invisalign', 'clear aligner'], 'ac_ortho'),
    P('pr_nightguard', 'Night guard', 'Appliances', 3500, 2500, 6000, 20, ['night guard', 'nightguard', 'splint', 'grinding'], 'ac_general'),
    P('pr_pulpotomy', 'Pulpotomy (child)', 'Pediatric', 2500, 1800, 4000, 30, ['pulpotomy', 'pulpectomy', 'milk tooth rct'], 'ac_rct'),
    P('pr_ss_crown', 'Stainless steel crown (child)', 'Pediatric', 2500, 1800, 4000, 30, ['stainless steel crown', 'ss crown'], 'ac_crown'),
    P('pr_gum', 'Gum treatment (deep cleaning, per quadrant)', 'Periodontics', 2500, 1500, 4000, 45, ['deep cleaning', 'gum treatment', 'curettage', 'root planing', 'flap'], 'ac_cleaning'),
  ];
}

export function defaultFeePolicy() {
  return { mode: 'fixed', allowCustom: true, noteOnChange: true, quoteToPatients: true, quoteNote: 'Final fee is confirmed by the dentist after examination.' };
}

export const procedures = (db) => (db.settings.procedures ||= defaultProcedures());
export const feePolicy = (db) => (db.settings.fees ||= defaultFeePolicy());

/** Finds a catalogue entry by id, exact name, or keyword. */
export function findProcedure(db, { procedureId = null, procedure = '' } = {}) {
  const list = procedures(db).filter((p) => p.active !== false);
  if (procedureId) return list.find((p) => p.id === procedureId) || null;
  const t = String(procedure || '').toLowerCase().trim();
  if (!t) return null;
  return list.find((p) => p.name.toLowerCase() === t) || list.find((p) => (p.keywords || []).some((k) => t.includes(k))) || null;
}

/** Fee text a front-desk assistant may quote (or null when quoting is off). */
export function quoteFor(db, text) {
  const pol = feePolicy(db);
  if (!pol.quoteToPatients) return null;
  const sym = db.settings.locale?.currencySymbol || '₹';
  const t = String(text || '').toLowerCase();
  const hits = procedures(db).filter((p) => p.active !== false && p.quote !== false && (p.keywords || []).some((k) => t.includes(k)));
  if (!hits.length) return null;
  const fmt = (n) => `${sym}${Number(n).toLocaleString('en-IN')}`;
  const lines = hits.slice(0, 3).map((p) => (pol.mode === 'fixed' || !p.minFee || !p.maxFee ? `${p.name}: ${fmt(p.fee)}` : `${p.name}: ${fmt(p.minFee)}–${fmt(p.maxFee)}`));
  return { procedures: hits.slice(0, 3), text: `${lines.join('; ')}. ${pol.quoteNote || ''}`.trim() };
}

/**
 * Applies the fee policy to one plan item. Returns the item to store.
 * Throws a 400 when the dentist tries something the policy does not allow, with a message a person can act on.
 */
export function priceItem(db, item, { by = 'dentist' } = {}) {
  const pol = feePolicy(db);
  const cat = findProcedure(db, { procedureId: item.procedureId, procedure: item.procedure });
  const wanted = item.estCost === '' || item.estCost == null ? null : Number(item.estCost);
  if (!cat) {
    if (!pol.allowCustom) bad(`"${item.procedure}" is not in the clinic's procedure list. Ask the owner to add it under Settings → Procedures & fees.`);
    if (pol.noteOnChange && wanted && !item.note) bad(`Add a short note for the custom procedure "${item.procedure}" and its fee.`);
    return { procedure: item.procedure, procedureId: null, estCost: wanted || 0, feeSource: 'custom', durationMin: Number(item.durationMin) || null, note: item.note || '' };
  }
  const base = { procedure: cat.name, procedureId: cat.id, durationMin: cat.durationMin, note: item.note || '' };
  if (pol.mode === 'fixed' || wanted == null || wanted === cat.fee) return { ...base, estCost: cat.fee, feeSource: 'catalogue' };
  if (pol.mode === 'range') {
    const lo = cat.minFee ?? cat.fee; const hi = cat.maxFee ?? cat.fee;
    if (wanted < lo || wanted > hi) bad(`${cat.name} can be quoted between ${lo} and ${hi} (set by the clinic). ${wanted} is outside that range.`);
  }
  if (pol.noteOnChange && !item.note) bad(`Add a short note explaining the fee change for ${cat.name} (catalogue fee ${cat.fee}).`);
  void by;
  return { ...base, estCost: wanted, feeSource: 'adjusted', catalogueFee: cat.fee };
}

/** Normalises a catalogue sent from Settings. */
export function sanitizeProcedures(list) {
  if (!Array.isArray(list)) return defaultProcedures();
  return list.filter((p) => p && p.name).map((p, i) => ({
    id: p.id || `pr_${String(p.name).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24)}_${i}`,
    name: String(p.name).trim(), category: p.category || 'General',
    fee: Number(p.fee) || 0, minFee: p.minFee === '' || p.minFee == null ? null : Number(p.minFee), maxFee: p.maxFee === '' || p.maxFee == null ? null : Number(p.maxFee),
    durationMin: Number(p.durationMin) || 30, keywords: Array.isArray(p.keywords) ? p.keywords : String(p.keywords || '').split(',').map((k) => k.trim().toLowerCase()).filter(Boolean),
    aftercareId: p.aftercareId || null, quote: p.quote !== false, active: p.active !== false,
  }));
}
