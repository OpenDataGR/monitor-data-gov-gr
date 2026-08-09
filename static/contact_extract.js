// Shared best-effort extraction of a real correspondent's contact details
// (name/phone/position) from an inbound email's own thread message body --
// used by both the admin panel's "Register Contact" flow and the main
// dashboard's "Attach Email to a Case" flow, so the two don't carry two
// independently-drifting copies of the same heuristics. Loaded as a plain
// classic script (no module system in this codebase, see i18n_shared.js/
// org_search.js for the same pattern) before whichever page-specific
// script actually calls these.
//
// Every one of these is just a starting point -- the caller's own form
// fields stay fully editable either way, never auto-submitted blind.

function _findSenderMessage(r, email) {
  if (!r.thread_messages || !email) return null;
  return r.thread_messages.find(m => (m.from_email || '').toLowerCase() === email.toLowerCase()) || null;
}

// Loose candidate scan (any digit-heavy run with plausible separators)
// then strict validation on the digits alone -- Greek landlines (2 + 9
// digits) and mobiles (69 + 8 digits) are both exactly 10 digits once a
// +30/0030/leading-0 prefix is stripped, so this rejects things that
// merely look like a phone number (case/reference numbers, dates) at
// the validation step instead of trying to make one giant regex do it.
function _extractPhone(text) {
  if (!text) return '';
  const candidates = text.match(/(?:\+?30[\s.-]?)?0?\(?\d[\d\s().-]{7,}\d/g) || [];
  for (const c of candidates) {
    let digits = c.replace(/\D/g, '');
    if (digits.startsWith('30') && digits.length > 10) digits = digits.slice(2);
    if (digits.startsWith('0') && digits.length > 10) digits = digits.slice(1);
    if (/^(2\d{9}|69\d{8})$/.test(digits)) return digits;
  }
  return '';
}

// Job-title line in a signature -- inherently fuzzy (titles vary
// endlessly), so this only looks for a short line containing a known
// title-indicating word/phrase rather than trying to parse structure.
const _POSITION_KEYWORDS_RE = /προϊστ|διευθ|τμηματάρχ|υπεύθυν|στέλεχ|σύμβουλ|γραμματέ|πρόεδρ|manager|officer|director|specialist|engineer|analyst|coordinator|head of|chief/i;
function _extractPosition(text) {
  if (!text) return '';
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.length > 80) continue;  // titles are short lines, not paragraphs
    if (_POSITION_KEYWORDS_RE.test(line)) return line;
  }
  return '';
}

// Only a fallback for when the header-derived name (a message's own
// "From:" display name) is missing -- an address swept in from a To:/Cc:
// line rather than an actual "From:" has no name to offer that way.
const _SIG_START_RE = /^--$/;
const _CLOSING_PHRASE_RE = /^(με\s+εκτ[ίι]μηση|φιλικ[άα]\s+χαιρετ[ίι]σματα|ευχαριστ(?:[ώω]|ούμε)|best regards|kind regards|warm regards|regards|sincerely|thanks|thank you)[,.\s]*$/i;
// Rejects a "name" that's really a phone number, email address, a
// position title ("Προϊστάμενος" alone, if the backward walk in Tier B
// below ever bottoms out on the anchor paragraph itself), or a line
// that reads as a finished sentence (ends in . ! ?) -- ordinary prose
// ends that way, a signature's own lines (name/title/department/
// address) essentially never do.
const _isPlausibleName = s => !!s && s.length <= 60 && !_extractPhone(s) && !s.includes('@')
  && !_POSITION_KEYWORDS_RE.test(s) && !/[.!?]$/.test(s);
function _extractName(text) {
  if (!text) return '';
  // Tier A: an explicit "--" delimiter (same one the backend's
  // _strip_signature_delimiter looks for) or a closing phrase
  // ("Με εκτίμηση,", "Best regards,", ...) right before the name.
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length - 1; i++) {
    if (!_SIG_START_RE.test(lines[i]) && !_CLOSING_PHRASE_RE.test(lines[i])) continue;
    // A "--" delimiter is sometimes immediately followed by its own
    // closing phrase ("--\nBest regards,\nName") rather than the name
    // directly -- skip past any further closing-phrase lines before
    // taking the next one as the candidate.
    let j = i + 1;
    while (j < lines.length && _CLOSING_PHRASE_RE.test(lines[j])) j++;
    if (j < lines.length && _isPlausibleName(lines[j])) return lines[j];
  }
  // Tier B: no textual marker at all -- the more common real-world
  // shape (most signatures, especially Outlook-style ones, are just
  // their own blank-line-separated block with nothing announcing
  // them). Anchor on the first paragraph containing a phone number or
  // a known position keyword -- both strong "this is definitely the
  // signature" signals -- then walk backward through short,
  // signature-shaped paragraphs (not full sentences) to the earliest
  // one; its first line is the name.
  const paragraphs = text.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
  let anchor = -1;
  for (let i = 0; i < paragraphs.length; i++) {
    if (_extractPhone(paragraphs[i]) || _POSITION_KEYWORDS_RE.test(paragraphs[i])) { anchor = i; break; }
  }
  if (anchor === -1) return '';
  const looksLikeSigParagraph = p => {
    const pLines = p.split('\n').map(l => l.trim()).filter(Boolean);
    return pLines.length > 0 && pLines.length <= 5 && pLines.every(l => l.length <= 80)
      && !/[.!?]$/.test(pLines[pLines.length - 1]);
  };
  let start = anchor;
  // If the anchor paragraph's OWN first line is already a plausible
  // name (name and position/phone sharing one paragraph), use it
  // directly -- only walk backward into earlier paragraphs when the
  // anchor itself doesn't start with the name (e.g. a lone
  // "Προϊστάμενος" paragraph with nothing else in it).
  if (!_isPlausibleName(paragraphs[anchor].split('\n')[0].trim())) {
    while (start > 0 && looksLikeSigParagraph(paragraphs[start - 1])) start--;
  }
  const firstLine = paragraphs[start].split('\n')[0].trim();
  return _isPlausibleName(firstLine) ? firstLine : '';
}

// Weakest of the three name signals -- only reached when neither the
// signature nor the message's own "From:" display name gave anything.
// Only fires on a local-part that's clearly first.last/first_name/
// first-name shaped (2+ segments, no digits) -- a single opaque token
// ("vpapath") or a shared mailbox ("info", "support2024") is far more
// likely to produce a wrong guess than no guess at all.
function _guessNameFromEmail(email) {
  if (!email) return '';
  const local = (email.split('@')[0] || '');
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length < 2 || parts.some(p => /\d/.test(p))) return '';
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
}
