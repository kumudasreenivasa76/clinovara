/**
 * Virtual assistant for phone calls, mainly after hours and at night.
 *
 * It answers the phone in the caller's language, books or changes appointments, shares hours, address,
 * fees and other approved answers, and takes a note of anything it cannot do — a message for the team,
 * an unclear request, a full diary. It never acts like a doctor: any clinical, medicine or "is this
 * normal" question is acknowledged, written down for the dentist, and answered with the emergency line
 * when needed.
 *
 * Language: the caller's words are detected by script and common words for the 22 scheduled Indian
 * languages plus English. The assistant's own sentences (greeting, closed notice, "I have noted",
 * "I cannot give medical advice", emergency line, goodbye) are in this file for 13 languages; the other
 * languages fall back to Hindi and English unless Claude is enabled, in which case Claude replies in the
 * caller's language. The booking logic itself is shared with the WhatsApp/web front desk (frontDesk.js),
 * so a call can do everything a chat can.
 */
import { id, nowIso, digits, fullName, log } from '../lib.js';
import { respond, applyActions } from './frontDesk.js';
import { isOpen, nextOpening, fmtOpening, addCallback } from './hours.js';
import { rescheduleAppointment, cancelAppointment, acceptWaitlistOffer } from './scheduling.js';
import { packetFor, sendPacket } from './visits.js';
import { emit } from './webhooks.js';

/** The 22 scheduled languages of India plus English. `script` is used for detection. */
export const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', script: 'Latin' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', script: 'Devanagari' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', script: 'Bengali' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', script: 'Telugu' },
  { code: 'mr', name: 'Marathi', native: 'मराठी', script: 'Devanagari' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', script: 'Tamil' },
  { code: 'ur', name: 'Urdu', native: 'اردو', script: 'Arabic' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', script: 'Gujarati' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', script: 'Kannada' },
  { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ', script: 'Oriya' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം', script: 'Malayalam' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', script: 'Gurmukhi' },
  { code: 'as', name: 'Assamese', native: 'অসমীয়া', script: 'Bengali' },
  { code: 'mai', name: 'Maithili', native: 'मैथिली', script: 'Devanagari' },
  { code: 'sat', name: 'Santali', native: 'ᱥᱟᱱᱛᱟᱲᱤ', script: 'Ol_Chiki' },
  { code: 'ks', name: 'Kashmiri', native: 'کٲشُر', script: 'Arabic' },
  { code: 'ne', name: 'Nepali', native: 'नेपाली', script: 'Devanagari' },
  { code: 'sd', name: 'Sindhi', native: 'سنڌي', script: 'Arabic' },
  { code: 'kok', name: 'Konkani', native: 'कोंकणी', script: 'Devanagari' },
  { code: 'doi', name: 'Dogri', native: 'डोगरी', script: 'Devanagari' },
  { code: 'mni', name: 'Manipuri (Meitei)', native: 'ꯃꯤꯇꯩꯂꯣꯟ', script: 'Meetei_Mayek' },
  { code: 'brx', name: 'Bodo', native: 'बड़ो', script: 'Devanagari' },
  { code: 'sa', name: 'Sanskrit', native: 'संस्कृतम्', script: 'Devanagari' },
];
export const LANG = Object.fromEntries(LANGUAGES.map((l) => [l.code, l]));

const SCRIPT_RE = {
  Devanagari: /[ऀ-ॿ]/, Bengali: /[ঀ-৿]/, Gurmukhi: /[਀-੿]/, Gujarati: /[઀-૿]/, Oriya: /[଀-୿]/, Tamil: /[஀-௿]/,
  Telugu: /[ఀ-౿]/, Kannada: /[ಀ-೿]/, Malayalam: /[ഀ-ൿ]/, Arabic: /[؀-ۿݐ-ݿ]/, Ol_Chiki: /[᱐-᱿]/, Meetei_Mayek: /[ꯀ-꯿]/,
};
// Common words that tell Devanagari / Bengali / Arabic-script languages apart, and romanised speech apart.
const MARKERS = {
  mr: ['आहे', 'मला', 'तुम्ही', 'पाहिजे', 'कधी', 'करा', 'नाही', 'माझ्या', 'भेट'], ne: ['छ', 'हो', 'गर्नुहोस्', 'मलाई', 'कहिले', 'छैन'], mai: ['अछि', 'हमरा', 'कहिया'], kok: ['आसा', 'म्हाका', 'केन्ना'], doi: ['ऐ', 'मिगी', 'कदूं'], brx: ['दं', 'आं', 'नों'], sa: ['अस्ति', 'अहम्', 'कदा'],
  as: ['ৰ', 'ৱ', 'আছে', 'মোৰ', 'কেতিয়া'], ks: ['چھُ', 'مے', 'کر'], sd: ['آهي', 'مون', 'ڪڏهن'],
};
const ROMAN = {
  hi: ['hai', 'nahi', 'kya', 'kab', 'kal', 'subah', 'sham', 'chahiye', 'dard', 'mujhe', 'appointment chahiye', 'kitna', 'kitne', 'karna', 'milega', 'bataiye', 'namaste', 'haan', 'ji'],
  kn: ['ide', 'beku', 'yaavaga', 'yavaga', 'naale', 'illa', 'nange', 'novu', 'hallu', 'eshtu', 'madi', 'namaskara', 'agutta', 'bandu'],
  ta: ['irukku', 'venum', 'eppo', 'naalaikku', 'illai', 'enakku', 'vali', 'pallu', 'evlo', 'vanakkam', 'pannunga', 'seri'],
  te: ['undi', 'kavali', 'eppudu', 'repu', 'ledu', 'naaku', 'noppi', 'pannu', 'entha', 'namaskaram', 'cheyandi', 'sare'],
  ml: ['undu', 'venam', 'eppol', 'naale', 'illa', 'enikku', 'vedana', 'pallu', 'ethra', 'namaskaram', 'cheyyu', 'sheri'],
  mr: ['aahe', 'pahije', 'kadhi', 'udya', 'nahi', 'mala', 'dukhtoy', 'daat', 'kiti', 'namaskar', 'kara'],
  bn: ['ache', 'chai', 'kokhon', 'kal', 'nei', 'amar', 'betha', 'daant', 'koto', 'nomoskar', 'korun'],
  gu: ['chhe', 'joie', 'kyare', 'kale', 'nathi', 'mane', 'dukhe', 'daant', 'ketlu', 'kem cho'],
  pa: ['hai ji', 'chahida', 'kadon', 'kal nu', 'nahi ji', 'mainu', 'dard', 'dand', 'kinna', 'sat sri akal'],
};

/** Detects the caller's language from the text; falls back to `fallback`. */
export function detectLanguage(text, fallback = 'en') {
  const t = String(text || '');
  for (const [script, re] of Object.entries(SCRIPT_RE)) {
    if (!re.test(t)) continue;
    if (script === 'Devanagari') { for (const c of ['mr', 'ne', 'mai', 'kok', 'doi', 'brx', 'sa']) if (MARKERS[c].some((w) => t.includes(w))) return c; return 'hi'; }
    if (script === 'Bengali') return MARKERS.as.some((w) => t.includes(w)) ? 'as' : 'bn';
    if (script === 'Arabic') { for (const c of ['ks', 'sd']) if (MARKERS[c].some((w) => t.includes(w))) return c; return 'ur'; }
    const hit = LANGUAGES.find((l) => l.script === script); if (hit) return hit.code;
  }
  const low = ` ${t.toLowerCase().replace(/[^a-z ]+/g, ' ')} `;
  let best = null; let bestN = 0;
  for (const [code, words] of Object.entries(ROMAN)) { const n = words.filter((w) => low.includes(` ${w} `)).length; if (n > bestN) { best = code; bestN = n; } }
  return bestN >= 1 ? best : fallback;
}

/**
 * The assistant's own sentences. {{clinic}} {{opens}} {{phone}} {{note}} {{emergency}} are filled in.
 * These are plain, formal phrasings; owners can edit any of them under Settings → Languages.
 */
export const PHRASES = {
  en: { greetingOpen: 'Namaste, this is the assistant at {{clinic}}. How can I help you?', greetingClosed: 'Namaste, this is the assistant at {{clinic}}. The clinic is closed right now and opens {{opens}}. I can book or change an appointment, share our hours, address and fees, or take a message for the team.', noMedical: 'I am an assistant, not a dentist, so I cannot advise on symptoms or medicines. I have written your question down for the dentist, and the team will call you when we open {{opens}}.', emergency: 'If this is an emergency — heavy bleeding, swelling spreading to the eye or neck, or trouble breathing — please go to the nearest emergency room or call 108 now.', noted: 'I have noted: {{note}}. The team will call you back at {{phone}} when we open {{opens}}.', askName: 'May I have your name, please?', bye: 'Thank you for calling {{clinic}}. Take care.', missedCall: 'Sorry we missed your call to {{clinic}}. We are closed now and open {{opens}}. Reply here to book or leave a message and we will call you back first thing.' },
  hi: { greetingOpen: 'नमस्ते, मैं {{clinic}} की सहायक बोल रही हूँ। मैं आपकी क्या मदद कर सकती हूँ?', greetingClosed: 'नमस्ते, मैं {{clinic}} की सहायक बोल रही हूँ। क्लिनिक अभी बंद है और {{opens}} खुलेगा। मैं अपॉइंटमेंट बुक या बदल सकती हूँ, समय, पता और फीस बता सकती हूँ, या टीम के लिए संदेश ले सकती हूँ।', noMedical: 'मैं सहायक हूँ, डॉक्टर नहीं, इसलिए लक्षण या दवा के बारे में सलाह नहीं दे सकती। मैंने आपका प्रश्न डॉक्टर के लिए लिख लिया है; क्लिनिक {{opens}} खुलने पर टीम आपको कॉल करेगी।', emergency: 'अगर यह आपातकाल है — बहुत खून बहना, आँख या गर्दन तक सूजन, या साँस लेने में तकलीफ़ — तो कृपया अभी नज़दीकी अस्पताल जाएँ या 108 पर कॉल करें।', noted: 'मैंने नोट कर लिया: {{note}}। क्लिनिक {{opens}} खुलने पर टीम आपको {{phone}} पर कॉल करेगी।', askName: 'कृपया अपना नाम बताएँ।', bye: '{{clinic}} को कॉल करने के लिए धन्यवाद। अपना ध्यान रखें।', missedCall: 'क्षमा करें, {{clinic}} पर आपकी कॉल छूट गई। हम अभी बंद हैं और {{opens}} खुलेंगे। बुक करने या संदेश छोड़ने के लिए यहाँ जवाब दें, हम सुबह सबसे पहले कॉल करेंगे।' },
  kn: { greetingOpen: 'ನಮಸ್ಕಾರ, ನಾನು {{clinic}} ಸಹಾಯಕಿ. ನಾನು ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?', greetingClosed: 'ನಮಸ್ಕಾರ, ನಾನು {{clinic}} ಸಹಾಯಕಿ. ಕ್ಲಿನಿಕ್ ಈಗ ಮುಚ್ಚಿದೆ, {{opens}} ತೆರೆಯುತ್ತದೆ. ನಾನು ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಬುಕ್ ಮಾಡಬಹುದು ಅಥವಾ ಬದಲಾಯಿಸಬಹುದು, ಸಮಯ, ವಿಳಾಸ ಮತ್ತು ಶುಲ್ಕ ತಿಳಿಸಬಹುದು, ಅಥವಾ ತಂಡಕ್ಕೆ ಸಂದೇಶ ದಾಖಲಿಸಬಹುದು.', noMedical: 'ನಾನು ಸಹಾಯಕಿ, ದಂತವೈದ್ಯರಲ್ಲ; ಲಕ್ಷಣ ಅಥವಾ ಔಷಧಿ ಬಗ್ಗೆ ಸಲಹೆ ನೀಡಲಾರೆ. ನಿಮ್ಮ ಪ್ರಶ್ನೆಯನ್ನು ವೈದ್ಯರಿಗಾಗಿ ಬರೆದಿಟ್ಟಿದ್ದೇನೆ; ಕ್ಲಿನಿಕ್ {{opens}} ತೆರೆದಾಗ ತಂಡ ನಿಮಗೆ ಕರೆ ಮಾಡುತ್ತದೆ.', emergency: 'ಇದು ತುರ್ತು ಪರಿಸ್ಥಿತಿಯಾದರೆ — ಹೆಚ್ಚು ರಕ್ತಸ್ರಾವ, ಕಣ್ಣು ಅಥವಾ ಕುತ್ತಿಗೆಯವರೆಗೆ ಊತ, ಅಥವಾ ಉಸಿರಾಟದ ತೊಂದರೆ — ದಯವಿಟ್ಟು ಈಗಲೇ ಹತ್ತಿರದ ಆಸ್ಪತ್ರೆಗೆ ಹೋಗಿ ಅಥವಾ 108ಕ್ಕೆ ಕರೆ ಮಾಡಿ.', noted: 'ನಾನು ದಾಖಲಿಸಿದ್ದೇನೆ: {{note}}. ಕ್ಲಿನಿಕ್ {{opens}} ತೆರೆದಾಗ ತಂಡ {{phone}}ಗೆ ಕರೆ ಮಾಡುತ್ತದೆ.', askName: 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ಹೆಸರು ತಿಳಿಸಿ.', bye: '{{clinic}}ಗೆ ಕರೆ ಮಾಡಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದಗಳು. ಆರೋಗ್ಯವಾಗಿರಿ.', missedCall: 'ಕ್ಷಮಿಸಿ, {{clinic}}ಗೆ ನಿಮ್ಮ ಕರೆ ತಪ್ಪಿಹೋಯಿತು. ನಾವು ಈಗ ಮುಚ್ಚಿದ್ದೇವೆ, {{opens}} ತೆರೆಯುತ್ತೇವೆ. ಬುಕ್ ಮಾಡಲು ಅಥವಾ ಸಂದೇಶ ಬಿಡಲು ಇಲ್ಲಿ ಉತ್ತರಿಸಿ; ಬೆಳಿಗ್ಗೆ ಮೊದಲು ಕರೆ ಮಾಡುತ್ತೇವೆ.' },
  ta: { greetingOpen: 'வணக்கம், நான் {{clinic}} உதவியாளர். நான் எப்படி உதவலாம்?', greetingClosed: 'வணக்கம், நான் {{clinic}} உதவியாளர். கிளினிக் இப்போது மூடப்பட்டுள்ளது, {{opens}} திறக்கும். நான் அப்பாயிண்ட்மென்ட் பதிவு செய்யலாம் அல்லது மாற்றலாம், நேரம், முகவரி, கட்டணம் சொல்லலாம், அல்லது குழுவிற்கு செய்தி எடுத்துக்கொள்ளலாம்.', noMedical: 'நான் உதவியாளர், பல் மருத்துவர் அல்ல; அறிகுறி அல்லது மருந்து பற்றி ஆலோசனை தர முடியாது. உங்கள் கேள்வியை மருத்துவருக்காக எழுதி வைத்துள்ளேன்; கிளினிக் {{opens}} திறந்ததும் குழு உங்களை அழைக்கும்.', emergency: 'இது அவசரம் என்றால் — அதிக ரத்தப்போக்கு, கண் அல்லது கழுத்து வரை வீக்கம், அல்லது மூச்சுத் திணறல் — தயவுசெய்து இப்போதே அருகிலுள்ள மருத்துவமனைக்குச் செல்லுங்கள் அல்லது 108ஐ அழைக்கவும்.', noted: 'குறித்துக்கொண்டேன்: {{note}}. கிளினிக் {{opens}} திறந்ததும் குழு {{phone}} எண்ணுக்கு அழைக்கும்.', askName: 'தயவுசெய்து உங்கள் பெயரைச் சொல்லுங்கள்.', bye: '{{clinic}}ஐ அழைத்ததற்கு நன்றி. நலமாக இருங்கள்.', missedCall: 'மன்னிக்கவும், {{clinic}}க்கு உங்கள் அழைப்பு தவறிவிட்டது. நாங்கள் இப்போது மூடியுள்ளோம், {{opens}} திறப்போம். பதிவு செய்ய அல்லது செய்தி விட இங்கே பதிலளிக்கவும்; காலையில் முதலில் அழைக்கிறோம்.' },
  te: { greetingOpen: 'నమస్కారం, నేను {{clinic}} సహాయకురాలిని. నేను ఎలా సహాయం చేయగలను?', greetingClosed: 'నమస్కారం, నేను {{clinic}} సహాయకురాలిని. క్లినిక్ ఇప్పుడు మూసివుంది, {{opens}} తెరుస్తుంది. నేను అపాయింట్‌మెంట్ బుక్ చేయగలను లేదా మార్చగలను, సమయం, చిరునామా, ఫీజు చెప్పగలను, లేదా టీమ్ కోసం సందేశం తీసుకోగలను.', noMedical: 'నేను సహాయకురాలిని, డాక్టర్ కాదు; లక్షణాలు లేదా మందుల గురించి సలహా ఇవ్వలేను. మీ ప్రశ్నను డాక్టర్ కోసం రాసుకున్నాను; క్లినిక్ {{opens}} తెరిచాక టీమ్ మీకు కాల్ చేస్తుంది.', emergency: 'ఇది అత్యవసరమైతే — ఎక్కువ రక్తస్రావం, కన్ను లేదా మెడ వరకు వాపు, లేదా శ్వాస ఇబ్బంది — దయచేసి ఇప్పుడే దగ్గరి ఆసుపత్రికి వెళ్లండి లేదా 108కి కాల్ చేయండి.', noted: 'నోట్ చేసుకున్నాను: {{note}}. క్లినిక్ {{opens}} తెరిచాక టీమ్ {{phone}}కి కాల్ చేస్తుంది.', askName: 'దయచేసి మీ పేరు చెప్పండి.', bye: '{{clinic}}కి కాల్ చేసినందుకు ధన్యవాదాలు. జాగ్రత్తగా ఉండండి.', missedCall: 'క్షమించండి, {{clinic}}కి మీ కాల్ మిస్ అయింది. మేము ఇప్పుడు మూసివున్నాము, {{opens}} తెరుస్తాము. బుక్ చేయడానికి లేదా సందేశం వదలడానికి ఇక్కడ రిప్లై చేయండి; ఉదయం ముందుగా కాల్ చేస్తాము.' },
  ml: { greetingOpen: 'നമസ്കാരം, ഞാൻ {{clinic}} സഹായി. എങ്ങനെ സഹായിക്കാം?', greetingClosed: 'നമസ്കാരം, ഞാൻ {{clinic}} സഹായി. ക്ലിനിക് ഇപ്പോൾ അടച്ചിരിക്കുന്നു, {{opens}} തുറക്കും. അപ്പോയിന്റ്മെന്റ് ബുക്ക് ചെയ്യാനോ മാറ്റാനോ, സമയം, വിലാസം, ഫീസ് അറിയിക്കാനോ, ടീമിനായി സന്ദേശം എടുക്കാനോ എനിക്ക് കഴിയും.', noMedical: 'ഞാൻ സഹായിയാണ്, ഡോക്ടറല്ല; ലക്ഷണങ്ങളെക്കുറിച്ചോ മരുന്നിനെക്കുറിച്ചോ ഉപദേശിക്കാൻ കഴിയില്ല. നിങ്ങളുടെ ചോദ്യം ഡോക്ടർക്കായി കുറിച്ചിട്ടുണ്ട്; ക്ലിനിക് {{opens}} തുറക്കുമ്പോൾ ടീം വിളിക്കും.', emergency: 'ഇത് അടിയന്തരമാണെങ്കിൽ — അമിത രക്തസ്രാവം, കണ്ണിലേക്കോ കഴുത്തിലേക്കോ പടരുന്ന നീർവീക്കം, അല്ലെങ്കിൽ ശ്വാസതടസ്സം — ദയവായി ഉടൻ അടുത്തുള്ള ആശുപത്രിയിൽ പോകുക അല്ലെങ്കിൽ 108 വിളിക്കുക.', noted: 'കുറിച്ചിട്ടുണ്ട്: {{note}}. ക്ലിനിക് {{opens}} തുറക്കുമ്പോൾ ടീം {{phone}} നമ്പറിൽ വിളിക്കും.', askName: 'ദയവായി പേര് പറയാമോ?', bye: '{{clinic}} വിളിച്ചതിന് നന്ദി. സുഖമായിരിക്കുക.', missedCall: 'ക്ഷമിക്കണം, {{clinic}} ലേക്കുള്ള നിങ്ങളുടെ കോൾ എടുക്കാനായില്ല. ഞങ്ങൾ ഇപ്പോൾ അടച്ചിരിക്കുന്നു, {{opens}} തുറക്കും. ബുക്ക് ചെയ്യാനോ സന്ദേശം നൽകാനോ ഇവിടെ മറുപടി നൽകുക; രാവിലെ ആദ്യം വിളിക്കാം.' },
  mr: { greetingOpen: 'नमस्कार, मी {{clinic}} ची सहाय्यक बोलत आहे. मी कशी मदत करू?', greetingClosed: 'नमस्कार, मी {{clinic}} ची सहाय्यक बोलत आहे. क्लिनिक आता बंद आहे आणि {{opens}} उघडेल. मी अपॉइंटमेंट बुक करू किंवा बदलू शकते, वेळ, पत्ता आणि फी सांगू शकते, किंवा टीमसाठी निरोप घेऊ शकते.', noMedical: 'मी सहाय्यक आहे, डॉक्टर नाही; लक्षणे किंवा औषधांबद्दल सल्ला देऊ शकत नाही. तुमचा प्रश्न डॉक्टरांसाठी लिहून ठेवला आहे; क्लिनिक {{opens}} उघडल्यावर टीम तुम्हाला फोन करेल.', emergency: 'ही आणीबाणी असल्यास — जास्त रक्तस्राव, डोळ्यापर्यंत किंवा मानेपर्यंत सूज, किंवा श्वास घेण्यास त्रास — कृपया लगेच जवळच्या रुग्णालयात जा किंवा 108 वर फोन करा.', noted: 'नोंद केली: {{note}}. क्लिनिक {{opens}} उघडल्यावर टीम {{phone}} वर फोन करेल.', askName: 'कृपया तुमचे नाव सांगा.', bye: '{{clinic}} ला फोन केल्याबद्दल धन्यवाद. काळजी घ्या.', missedCall: 'क्षमस्व, {{clinic}} ला तुमचा फोन आम्ही घेऊ शकलो नाही. आम्ही आता बंद आहोत आणि {{opens}} उघडू. बुक करण्यासाठी किंवा निरोप ठेवण्यासाठी इथे उत्तर द्या; सकाळी सर्वप्रथम फोन करू.' },
  bn: { greetingOpen: 'নমস্কার, আমি {{clinic}}-এর সহকারী। কীভাবে সাহায্য করতে পারি?', greetingClosed: 'নমস্কার, আমি {{clinic}}-এর সহকারী। ক্লিনিক এখন বন্ধ, {{opens}} খুলবে। আমি অ্যাপয়েন্টমেন্ট বুক বা পরিবর্তন করতে পারি, সময়, ঠিকানা ও ফি জানাতে পারি, বা টিমের জন্য বার্তা নিতে পারি।', noMedical: 'আমি সহকারী, ডাক্তার নই; উপসর্গ বা ওষুধ নিয়ে পরামর্শ দিতে পারি না। আপনার প্রশ্ন ডাক্তারের জন্য লিখে রেখেছি; ক্লিনিক {{opens}} খুললে টিম আপনাকে ফোন করবে।', emergency: 'জরুরি হলে — বেশি রক্তপাত, চোখ বা ঘাড় পর্যন্ত ফোলা, বা শ্বাসকষ্ট — অনুগ্রহ করে এখনই নিকটস্থ হাসপাতালে যান বা 108-এ ফোন করুন।', noted: 'নোট করেছি: {{note}}। ক্লিনিক {{opens}} খুললে টিম {{phone}} নম্বরে ফোন করবে।', askName: 'অনুগ্রহ করে আপনার নাম বলুন।', bye: '{{clinic}}-এ ফোন করার জন্য ধন্যবাদ। ভালো থাকবেন।', missedCall: 'দুঃখিত, {{clinic}}-এ আপনার কল ধরতে পারিনি। আমরা এখন বন্ধ, {{opens}} খুলব। বুক করতে বা বার্তা রাখতে এখানে উত্তর দিন; সকালে প্রথমেই ফোন করব।' },
  gu: { greetingOpen: 'નમસ્તે, હું {{clinic}} ની સહાયક બોલું છું. હું કેવી રીતે મદદ કરી શકું?', greetingClosed: 'નમસ્તે, હું {{clinic}} ની સહાયક બોલું છું. ક્લિનિક હમણાં બંધ છે અને {{opens}} ખુલશે. હું અપોઈન્ટમેન્ટ બુક કરી કે બદલી શકું, સમય, સરનામું અને ફી જણાવી શકું, અથવા ટીમ માટે સંદેશ લઈ શકું.', noMedical: 'હું સહાયક છું, ડૉક્ટર નહીં; લક્ષણો કે દવા વિશે સલાહ આપી શકતી નથી. તમારો પ્રશ્ન ડૉક્ટર માટે લખી લીધો છે; ક્લિનિક {{opens}} ખુલે ત્યારે ટીમ તમને ફોન કરશે.', emergency: 'જો આ કટોકટી હોય — વધુ લોહી વહેવું, આંખ કે ગરદન સુધી સોજો, અથવા શ્વાસ લેવામાં તકલીફ — તો કૃપા કરીને હમણાં નજીકની હોસ્પિટલ જાઓ અથવા 108 પર ફોન કરો.', noted: 'નોંધ્યું: {{note}}. ક્લિનિક {{opens}} ખુલે ત્યારે ટીમ {{phone}} પર ફોન કરશે.', askName: 'કૃપા કરીને તમારું નામ જણાવો.', bye: '{{clinic}} ને ફોન કરવા બદલ આભાર. કાળજી રાખજો.', missedCall: 'માફ કરશો, {{clinic}} પર તમારો ફોન ચૂકી ગયા. અમે હમણાં બંધ છીએ અને {{opens}} ખુલીશું. બુક કરવા કે સંદેશ મૂકવા અહીં જવાબ આપો; સવારે સૌથી પહેલા ફોન કરીશું.' },
  pa: { greetingOpen: 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ, ਮੈਂ {{clinic}} ਦੀ ਸਹਾਇਕ ਬੋਲ ਰਹੀ ਹਾਂ। ਮੈਂ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦੀ ਹਾਂ?', greetingClosed: 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ, ਮੈਂ {{clinic}} ਦੀ ਸਹਾਇਕ ਬੋਲ ਰਹੀ ਹਾਂ। ਕਲੀਨਿਕ ਹੁਣ ਬੰਦ ਹੈ ਅਤੇ {{opens}} ਖੁੱਲ੍ਹੇਗਾ। ਮੈਂ ਅਪਾਇੰਟਮੈਂਟ ਬੁੱਕ ਜਾਂ ਬਦਲ ਸਕਦੀ ਹਾਂ, ਸਮਾਂ, ਪਤਾ ਅਤੇ ਫੀਸ ਦੱਸ ਸਕਦੀ ਹਾਂ, ਜਾਂ ਟੀਮ ਲਈ ਸੁਨੇਹਾ ਲੈ ਸਕਦੀ ਹਾਂ।', noMedical: 'ਮੈਂ ਸਹਾਇਕ ਹਾਂ, ਡਾਕਟਰ ਨਹੀਂ; ਲੱਛਣਾਂ ਜਾਂ ਦਵਾਈ ਬਾਰੇ ਸਲਾਹ ਨਹੀਂ ਦੇ ਸਕਦੀ। ਤੁਹਾਡਾ ਸਵਾਲ ਡਾਕਟਰ ਲਈ ਲਿਖ ਲਿਆ ਹੈ; ਕਲੀਨਿਕ {{opens}} ਖੁੱਲ੍ਹਣ ਤੇ ਟੀਮ ਤੁਹਾਨੂੰ ਫ਼ੋਨ ਕਰੇਗੀ।', emergency: 'ਜੇ ਇਹ ਐਮਰਜੈਂਸੀ ਹੈ — ਬਹੁਤ ਖੂਨ ਵਗਣਾ, ਅੱਖ ਜਾਂ ਗਰਦਨ ਤੱਕ ਸੋਜ, ਜਾਂ ਸਾਹ ਲੈਣ ਵਿੱਚ ਤਕਲੀਫ਼ — ਤਾਂ ਕਿਰਪਾ ਕਰਕੇ ਹੁਣੇ ਨੇੜਲੇ ਹਸਪਤਾਲ ਜਾਓ ਜਾਂ 108 ਤੇ ਫ਼ੋਨ ਕਰੋ।', noted: 'ਨੋਟ ਕਰ ਲਿਆ: {{note}}। ਕਲੀਨਿਕ {{opens}} ਖੁੱਲ੍ਹਣ ਤੇ ਟੀਮ {{phone}} ਤੇ ਫ਼ੋਨ ਕਰੇਗੀ।', askName: 'ਕਿਰਪਾ ਕਰਕੇ ਆਪਣਾ ਨਾਮ ਦੱਸੋ।', bye: '{{clinic}} ਨੂੰ ਫ਼ੋਨ ਕਰਨ ਲਈ ਧੰਨਵਾਦ। ਆਪਣਾ ਖਿਆਲ ਰੱਖੋ।', missedCall: 'ਮਾਫ਼ ਕਰਨਾ, {{clinic}} ਤੇ ਤੁਹਾਡਾ ਫ਼ੋਨ ਛੁੱਟ ਗਿਆ। ਅਸੀਂ ਹੁਣ ਬੰਦ ਹਾਂ ਅਤੇ {{opens}} ਖੁੱਲ੍ਹਾਂਗੇ। ਬੁੱਕ ਕਰਨ ਜਾਂ ਸੁਨੇਹਾ ਛੱਡਣ ਲਈ ਇੱਥੇ ਜਵਾਬ ਦਿਓ; ਸਵੇਰੇ ਸਭ ਤੋਂ ਪਹਿਲਾਂ ਫ਼ੋਨ ਕਰਾਂਗੇ।' },
  or: { greetingOpen: 'ନମସ୍କାର, ମୁଁ {{clinic}} ର ସହାୟିକା। ମୁଁ କିପରି ସାହାଯ୍ୟ କରିପାରିବି?', greetingClosed: 'ନମସ୍କାର, ମୁଁ {{clinic}} ର ସହାୟିକା। କ୍ଲିନିକ୍ ବର୍ତ୍ତମାନ ବନ୍ଦ ଅଛି ଏବଂ {{opens}} ଖୋଲିବ। ମୁଁ ଆପଏଣ୍ଟମେଣ୍ଟ ବୁକ୍ କିମ୍ବା ବଦଳାଇ ପାରିବି, ସମୟ, ଠିକଣା ଓ ଫି ଜଣାଇ ପାରିବି, କିମ୍ବା ଟିମ୍ ପାଇଁ ବାର୍ତ୍ତା ନେଇ ପାରିବି।', noMedical: 'ମୁଁ ସହାୟିକା, ଡାକ୍ତର ନୁହେଁ; ଲକ୍ଷଣ କିମ୍ବା ଔଷଧ ବିଷୟରେ ପରାମର୍ଶ ଦେଇପାରିବି ନାହିଁ। ଆପଣଙ୍କ ପ୍ରଶ୍ନ ଡାକ୍ତରଙ୍କ ପାଇଁ ଲେଖି ରଖିଛି; କ୍ଲିନିକ୍ {{opens}} ଖୋଲିଲେ ଟିମ୍ ଆପଣଙ୍କୁ ଫୋନ୍ କରିବ।', emergency: 'ଯଦି ଏହା ଜରୁରୀ — ଅଧିକ ରକ୍ତସ୍ରାବ, ଆଖି କିମ୍ବା ବେକ ପର୍ଯ୍ୟନ୍ତ ଫୁଲା, କିମ୍ବା ନିଶ୍ୱାସ ନେବାରେ କଷ୍ଟ — ଦୟାକରି ଏବେ ନିକଟସ୍ଥ ଡାକ୍ତରଖାନା ଯାଆନ୍ତୁ କିମ୍ବା 108 କୁ ଫୋନ୍ କରନ୍ତୁ।', noted: 'ଲେଖି ରଖିଲି: {{note}}। କ୍ଲିନିକ୍ {{opens}} ଖୋଲିଲେ ଟିମ୍ {{phone}} କୁ ଫୋନ୍ କରିବ।', askName: 'ଦୟାକରି ଆପଣଙ୍କ ନାମ କୁହନ୍ତୁ।', bye: '{{clinic}} କୁ ଫୋନ୍ କରିଥିବାରୁ ଧନ୍ୟବାଦ। ଯତ୍ନ ନିଅନ୍ତୁ।', missedCall: 'କ୍ଷମା କରନ୍ତୁ, {{clinic}} କୁ ଆପଣଙ୍କ କଲ୍ ଛାଡି ଗଲା। ଆମେ ଏବେ ବନ୍ଦ, {{opens}} ଖୋଲିବୁ। ବୁକ୍ କରିବାକୁ କିମ୍ବା ବାର୍ତ୍ତା ଛାଡିବାକୁ ଏଠାରେ ଉତ୍ତର ଦିଅନ୍ତୁ; ସକାଳେ ପ୍ରଥମେ ଫୋନ୍ କରିବୁ।' },
  ur: { greetingOpen: 'السلام علیکم، میں {{clinic}} کی معاون بول رہی ہوں۔ میں آپ کی کیا مدد کر سکتی ہوں؟', greetingClosed: 'السلام علیکم، میں {{clinic}} کی معاون بول رہی ہوں۔ کلینک ابھی بند ہے اور {{opens}} کھلے گا۔ میں اپائنٹمنٹ بک یا تبدیل کر سکتی ہوں، اوقات، پتہ اور فیس بتا سکتی ہوں، یا ٹیم کے لیے پیغام لے سکتی ہوں۔', noMedical: 'میں معاون ہوں، ڈاکٹر نہیں؛ علامات یا دوا کے بارے میں مشورہ نہیں دے سکتی۔ آپ کا سوال ڈاکٹر کے لیے لکھ لیا ہے؛ کلینک {{opens}} کھلنے پر ٹیم آپ کو فون کرے گی۔', emergency: 'اگر یہ ایمرجنسی ہے — زیادہ خون بہنا، آنکھ یا گردن تک سوجن، یا سانس لینے میں دشواری — تو براہ کرم ابھی قریبی ہسپتال جائیں یا 108 پر فون کریں۔', noted: 'نوٹ کر لیا: {{note}}۔ کلینک {{opens}} کھلنے پر ٹیم {{phone}} پر فون کرے گی۔', askName: 'براہ کرم اپنا نام بتائیں۔', bye: '{{clinic}} کو فون کرنے کا شکریہ۔ اپنا خیال رکھیں۔', missedCall: 'معذرت، {{clinic}} پر آپ کی کال چھوٹ گئی۔ ہم ابھی بند ہیں اور {{opens}} کھلیں گے۔ بک کرنے یا پیغام چھوڑنے کے لیے یہاں جواب دیں؛ صبح سب سے پہلے فون کریں گے۔' },
  as: { greetingOpen: 'নমস্কাৰ, মই {{clinic}}ৰ সহায়িকা। মই কেনেকৈ সহায় কৰিব পাৰোঁ?', greetingClosed: 'নমস্কাৰ, মই {{clinic}}ৰ সহায়িকা। ক্লিনিক এতিয়া বন্ধ আছে আৰু {{opens}} খুলিব। মই এপইণ্টমেণ্ট বুক বা সলনি কৰিব পাৰোঁ, সময়, ঠিকনা আৰু মাচুল জনাব পাৰোঁ, বা টীমৰ বাবে বাৰ্তা ল’ব পাৰোঁ।', noMedical: 'মই সহায়িকা, ডাক্তৰ নহয়; লক্ষণ বা ঔষধৰ বিষয়ে পৰামৰ্শ দিব নোৱাৰোঁ। আপোনাৰ প্ৰশ্ন ডাক্তৰৰ বাবে লিখি থৈছোঁ; ক্লিনিক {{opens}} খুলিলে টীমে আপোনাক ফোন কৰিব।', emergency: 'যদি এয়া জৰুৰী — বেছি তেজ ওলোৱা, চকু বা ডিঙিলৈকে ফুলা, বা উশাহ লোৱাত অসুবিধা — অনুগ্ৰহ কৰি এতিয়াই ওচৰৰ চিকিৎসালয়লৈ যাওক বা 108 লৈ ফোন কৰক।', noted: 'লিখি থলোঁ: {{note}}। ক্লিনিক {{opens}} খুলিলে টীমে {{phone}}ত ফোন কৰিব।', askName: 'অনুগ্ৰহ কৰি আপোনাৰ নাম কওক।', bye: '{{clinic}}লৈ ফোন কৰাৰ বাবে ধন্যবাদ। ভালে থাকিব।', missedCall: 'ক্ষমা কৰিব, {{clinic}}লৈ আপোনাৰ কল ধৰিব নোৱাৰিলোঁ। আমি এতিয়া বন্ধ, {{opens}} খুলিম। বুক কৰিবলৈ বা বাৰ্তা থৈ যাবলৈ ইয়াত উত্তৰ দিয়ক; ৰাতিপুৱা প্ৰথমে ফোন কৰিম।' },
};
export const PHRASE_KEYS = Object.keys(PHRASES.en);

/** A phrase in the caller's language, with the owner's overrides applied; Hindi + English when the language has no built-in text. */
export function phrase(db, lang, key, vars = {}) {
  const over = db.settings.assistant?.phrases?.[lang]?.[key];
  let text = over || PHRASES[lang]?.[key];
  if (!text) text = lang === 'en' ? PHRASES.en[key] : `${PHRASES.hi[key]}\n${PHRASES.en[key]}`;
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? ''));
}
export const assistantSettings = (db) => (db.settings.assistant ||= { enabled: true, answerWhen: 'closed', takeNotes: true, phrases: {} });

/* ---------- Calls ---------- */

function commonVars(db, call) {
  const opening = nextOpening(db);
  return { clinic: db.settings.practice.name, opens: opening ? fmtOpening(opening.at) : 'soon', phone: call.phone ? `+${db.settings.locale?.phoneCountryCode || '91'} ${call.phone}` : '', emergency: db.settings.afterHours?.emergency || '' };
}

/** Starts a call: identifies the caller, opens (or reuses) a conversation on the "call" channel, and returns the greeting. */
export function startCall(db, { phone, contactName = '', at = nowIso(), language = null, externalId = null }) {
  const cc = db.settings.locale?.phoneCountryCode || '91';
  const num = digits(phone || '', cc);
  const patient = num ? db.patients.find((p) => digits(p.phone, cc) === num) || null : null;
  const lang = language || patient?.preferredLanguage || db.settings.locale?.defaultLanguage || 'en';
  const open = isOpen(db, at);
  let conv = num ? db.conversations.find((c) => (patient ? c.patientId === patient.id : c.contactPhone === num) && c.status !== 'closed') : null;
  if (!conv) {
    conv = { id: id('cnv'), patientId: patient?.id || null, contactName: patient ? fullName(patient) : (contactName || (num ? `+${cc} ${num}` : 'Unknown caller')), contactPhone: num, channel: 'call', status: 'ai', reason: '', createdAt: at, updatedAt: at, messages: [], assignedTo: null, unread: false, ai: {} };
    db.conversations.unshift(conv);
  }
  const call = { id: id('call'), externalId, phone: num, patientId: patient?.id || null, contactName: conv.contactName, startedAt: at, endedAt: null, afterHours: !open, language: lang, transcript: [], notes: { reason: '', summary: '', urgency: 'normal', preferredTime: '', callbackRequested: false, missed: [], clinicalQuestion: '' }, outcome: null, appointmentId: null, callbackId: null, conversationId: conv.id, status: 'open', engine: null };
  db.calls ||= []; db.calls.unshift(call);
  const vars = commonVars(db, call);
  const greeting = phrase(db, lang, open ? 'greetingOpen' : 'greetingClosed', vars);
  call.transcript.push({ from: 'assistant', text: greeting, at, lang });
  conv.messages.push({ id: id('msg'), from: 'ai', text: `[Call started] ${greeting}`, at, intent: 'call_start', outbound: true });
  conv.updatedAt = at;
  return { call, say: greeting, language: lang, patient, open };
}

/** One caller turn. Runs the shared front-desk engine and wraps its reply in the caller's language. */
export async function callerSays(db, call, text, { frontendBase = '' } = {}) {
  const conv = db.conversations.find((c) => c.id === call.conversationId);
  const at = nowIso();
  const lang = detectLanguage(text, call.language);
  call.language = lang;
  call.transcript.push({ from: 'caller', text, at, lang });
  conv.messages.push({ id: id('msg'), from: 'patient', text, at, channel: 'call' });
  const result = await respond(db, conv, text);
  call.engine = result.engine;
  const deps = {
    reschedule: (apptId, opts) => rescheduleAppointment(db, apptId, opts),
    cancel: (apptId, opts) => cancelAppointment(db, apptId, opts),
    acceptWaitlist: (wlId, opts) => acceptWaitlistOffer(db, wlId, opts),
    afterBooking: (appt) => { call.appointmentId = appt.id; call.outcome = 'booked'; const pk = packetFor(db, appt.id, { create: true }); sendPacket(db, pk, { frontendBase }); },
  };
  let applied = [];
  try { applied = applyActions(db, conv, result, deps); } catch (err) { result.escalate = true; result.escalationReason = `Action failed: ${err.message}`; }
  if (applied.some((a) => a.type === 'reschedule')) call.outcome = 'rescheduled';
  if (applied.some((a) => a.type === 'cancel')) call.outcome = 'cancelled';
  conv.ai = result.state || {};
  if (result.visitTypeId && !conv.visitTypeId) conv.visitTypeId = result.visitTypeId;

  // Notes: what the caller wants, in the team's words.
  const n = call.notes;
  if (!n.reason && result.intent && !['greeting', 'thanks', 'identify', 'other'].includes(result.intent)) n.reason = REASON[result.intent] || result.intent;
  if (result.preferredTime && result.preferredTime !== 'any') n.preferredTime = result.preferredTime;
  if (['urgent', 'emergency'].includes(result.intent)) n.urgency = result.intent === 'emergency' ? 'emergency' : 'high';
  if (result.intent === 'clinical') n.clinicalQuestion = text;
  if (result.escalate) { n.callbackRequested = true; n.missed.push(result.escalationReason || 'Needs a person'); }

  // The reply, framed in the caller's language. The engine's own sentences (slots, FAQ answers) stay as the clinic wrote them.
  const vars = commonVars(db, call);
  let say = result.reply;
  if (result.intent === 'emergency') say = `${phrase(db, lang, 'emergency', vars)} ${lang === 'en' ? '' : result.reply}`.trim();
  else if (result.intent === 'clinical') say = `${phrase(db, lang, 'noMedical', vars)}${n.urgency === 'high' ? ' ' + phrase(db, lang, 'emergency', vars) : ''}`;
  else if (result.escalate) say = phrase(db, lang, 'noted', { ...vars, note: result.escalationReason || text.slice(0, 80) });
  else if (lang !== 'en' && result.afterHours && call.transcript.filter((t) => t.from === 'assistant').length === 1) say = result.reply.replace(/^[^\n]*\n\n/, ''); // the English closed-notice was already said in the caller's language at the greeting
  call.transcript.push({ from: 'assistant', text: say, at: nowIso(), lang, intent: result.intent, escalated: !!result.escalate, engine: result.engine });
  conv.messages.push({ id: id('msg'), from: 'ai', text: say, at: nowIso(), intent: result.intent, escalated: !!result.escalate, engine: result.engine, actions: applied });
  conv.updatedAt = nowIso();
  if (result.intent && !conv.reason) conv.reason = REASON[result.intent] || 'Call';
  if (result.escalate && conv.status === 'ai') { conv.status = 'needs_staff'; conv.escalation = { reason: result.escalationReason || 'Needs staff', at: nowIso() }; conv.unread = true; emit(db, 'conversation.escalated', { conversationId: conv.id, patientId: conv.patientId, contactName: conv.contactName, channel: 'call', reason: conv.escalation.reason, lastMessage: text }); }
  const done = ['booked', 'cancel', 'confirm', 'thanks'].includes(result.intent) && !result.state?.step;
  return { say, language: lang, intent: result.intent, escalated: !!result.escalate, actions: applied, suggestHangup: done };
}
const REASON = { book: 'Wants to book', booked: 'Booked an appointment', urgent: 'In pain — wants the soonest visit', reschedule: 'Wants to reschedule', cancel: 'Wants to cancel', faq: 'Asked a general question', clinical: 'Clinical question for the dentist', sensitive: 'Billing, records or complaint', emergency: 'Possible emergency', confirm: 'Confirmed appointment' };

/** Ends the call: writes the summary, files a callback when a person is needed, and says goodbye. */
export function endCall(db, call, { by = 'Assistant', reason = 'hangup' } = {}) {
  if (call.status === 'ended') return { call, say: '' };
  const conv = db.conversations.find((c) => c.id === call.conversationId);
  const at = nowIso();
  const n = call.notes;
  const callerLines = call.transcript.filter((t) => t.from === 'caller').map((t) => t.text);
  n.summary = summarize(db, call);
  if (!call.outcome) call.outcome = n.clinicalQuestion ? 'clinical_question' : n.callbackRequested ? 'message' : callerLines.length ? 'info' : 'abandoned';
  if (n.urgency === 'emergency') call.outcome = 'emergency';
  if ((n.callbackRequested || n.clinicalQuestion || call.outcome === 'abandoned') && call.phone) {
    const cb = addCallback(db, { source: call.afterHours ? 'after_hours' : 'missed_call', conversationId: conv?.id, patientId: call.patientId, contactName: call.contactName, contactPhone: call.phone, reason: `Call (${LANG[call.language]?.name || call.language}): ${n.summary}`, channel: 'call', priority: ['high', 'emergency'].includes(n.urgency) || n.clinicalQuestion ? 'high' : 'normal' });
    call.callbackId = cb.id;
  }
  call.endedAt = at; call.status = 'ended'; call.endReason = reason;
  const say = phrase(db, call.language, 'bye', commonVars(db, call));
  call.transcript.push({ from: 'assistant', text: say, at, lang: call.language });
  if (conv) { conv.messages.push({ id: id('msg'), from: 'ai', text: `[Call ended — ${OUTCOME[call.outcome] || call.outcome}] ${n.summary}`, at, intent: 'call_end', outbound: true }); conv.updatedAt = at; if (conv.status === 'ai' && !['booked', 'rescheduled', 'cancelled', 'info'].includes(call.outcome)) conv.unread = true; }
  log(db, 'call', `${by}: call from ${call.contactName} ended — ${OUTCOME[call.outcome] || call.outcome}`, { conversationId: conv?.id, patientId: call.patientId });
  emit(db, 'call.ended', { call: { ...call, transcript: undefined }, summary: n.summary, outcome: call.outcome });
  return { call, say };
}
export const OUTCOME = { booked: 'Booked', rescheduled: 'Rescheduled', cancelled: 'Cancelled', info: 'Question answered', message: 'Message taken', clinical_question: 'Clinical question noted for the dentist', emergency: 'Emergency — told to go to ER / 108', abandoned: 'Caller hung up' };

function summarize(db, call) {
  const n = call.notes;
  const lines = call.transcript.filter((t) => t.from === 'caller').map((t) => t.text.trim()).filter(Boolean);
  const parts = [];
  if (n.reason) parts.push(n.reason);
  if (call.appointmentId) { const a = db.appointments.find((x) => x.id === call.appointmentId); if (a) parts.push(`booked ${db.settings.visitTypes.find((v) => v.id === a.visitTypeId)?.name || 'visit'} on ${new Date(a.start).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`); }
  if (n.preferredTime) parts.push(`prefers ${n.preferredTime}`);
  if (n.clinicalQuestion) parts.push(`asked the dentist: "${n.clinicalQuestion.slice(0, 120)}"`);
  if (n.missed.length) parts.push(`could not handle: ${[...new Set(n.missed)].join('; ')}`);
  if (!parts.length && lines.length) parts.push(`said: "${lines.join(' / ').slice(0, 160)}"`);
  return parts.join(' · ') || 'No request made';
}

/** Conversion and language mix for Insights. */
export function callStats(db, { since }) {
  const calls = (db.calls || []).filter((c) => c.startedAt >= since);
  const ah = calls.filter((c) => c.afterHours);
  const count = (list, f) => list.filter(f).length;
  const byLanguage = {};
  for (const c of calls) byLanguage[c.language] = (byLanguage[c.language] || 0) + 1;
  const handled = count(calls, (c) => ['booked', 'rescheduled', 'cancelled', 'info'].includes(c.outcome));
  return { total: calls.length, afterHours: ah.length, booked: count(calls, (c) => c.outcome === 'booked'), rescheduled: count(calls, (c) => c.outcome === 'rescheduled'), messages: count(calls, (c) => ['message', 'clinical_question'].includes(c.outcome)), emergencies: count(calls, (c) => c.outcome === 'emergency'), abandoned: count(calls, (c) => c.outcome === 'abandoned'), handledByAssistant: handled, conversion: calls.length ? Math.round((count(calls, (c) => c.outcome === 'booked') / calls.length) * 100) : null, byLanguage: Object.entries(byLanguage).map(([code, n]) => ({ code, name: LANG[code]?.name || code, n })).sort((a, b) => b.n - a.n) };
}
