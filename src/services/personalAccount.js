// One account, one person.
//
// A school fields a team, and the tempting shortcut is to give the team one
// login. The pilot started that way: every school had a single account called
// "Echipa digitală — <school>", handed round the staffroom. It has to go, for
// three reasons that are not about tidiness:
//
//   accountability  The audit trail is the point of this platform. "Echipa
//                   digitală confirmed the assessment" names nobody, so a
//                   confirmed cycle stops being a signature and becomes a
//                   shrug.
//   the two tracks  The administration and the team assess in parallel and
//                   then reconcile. A login shared across both sides cannot
//                   be on one side of that, so the whole workflow collapses
//                   into one person filling in both columns.
//   the obvious one A password known to eight people is a password known to
//                   whoever they told, and it survives every one of them
//                   leaving the school.
//
// Software cannot prove a name belongs to a real individual. What it can do
// is refuse the names that are plainly not individuals, and refuse to let an
// unclaimed credential be *used* until a person puts their own name on it —
// which is the pair of rules implemented here and in routes/auth.js.

/**
 * Words that name a body rather than a person, in the three languages this
 * platform runs in. Matched against whole words on a diacritic-stripped,
 * lowercased copy of the name, so "Echipa digitală", "ECHIPA DIGITALA" and
 * "echipa digitala" are all caught, while "Echim" — a real surname — is not.
 *
 * Deliberately a list of collective nouns and institution words, not a list
 * of blocked strings: a person is never called "the council", and nobody's
 * surname is "liceul".
 */
const COLLECTIVE_WORDS = [
  // Romanian
  'echipa', 'echipe', 'echipei', 'colectiv', 'colectivul', 'administratia',
  'administratie', 'directia', 'directiunea', 'institutia', 'institutie',
  'liceu', 'liceul', 'gimnaziu', 'gimnaziul', 'scoala', 'scolii', 'catedra',
  'comisia', 'consiliul', 'consiliu', 'secretariat', 'cancelaria',
  'departament', 'departamentul', 'grup', 'grupul', 'cont', 'contul',
  'conturi', 'utilizator', 'test', 'demo',
  // English
  'team', 'staff', 'group', 'office', 'account', 'accounts', 'shared',
  'admin', 'administrator', 'administration', 'school', 'lyceum',
  'department', 'committee', 'council', 'user', 'users',
  // Russian
  'komanda', 'kollektiv', 'shkola', 'litsey', 'gimnaziya', 'administratsiya',
  'otdel', 'gruppa', 'sovet', 'kabinet', 'kafedra', 'uchetnaya',
];

// Cyrillic is transliterated rather than listed twice, so the Russian entries
// above can stay in one alphabet and be read by someone who does not have a
// Cyrillic keyboard.
const CYRILLIC = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Lowercased, diacritic-free, Latin-alphabet copy — for matching only. */
function fold(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[а-яё]/g, (ch) => (CYRILLIC[ch] !== undefined ? CYRILLIC[ch] : ch))
    // Romanian ș/ț are written both with a comma below and with a cedilla,
    // and the two are different code points. Normalising to the decomposed
    // form and dropping the marks makes them the same letter here.
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ș|ş/g, 's')
    .replace(/ț|ţ/g, 't');
}

/** Whitespace tidied, so " Ion   Popescu " and "Ion Popescu" are one name. */
function normaliseName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/**
 * What is wrong with this as the name of a person, or null when nothing is.
 *
 * @returns {null|'missing'|'incomplete'|'collective'}
 */
function nameProblem(value) {
  const name = normaliseName(value);
  if (!name) return 'missing';

  const folded = fold(name);
  const words = folded.split(/[^a-z0-9]+/).filter(Boolean);
  if (words.some((w) => COLLECTIVE_WORDS.includes(w))) return 'collective';

  // A family name and a given name. One word is a handle, a nickname or a
  // department; it is not how anyone in this programme is addressed on a
  // document that goes to the Ministry.
  const nameLike = words.filter((w) => /^[a-z]/.test(w) && w.length >= 2);
  if (nameLike.length < 2) return 'incomplete';

  return null;
}

/** True when this name may be worn by a school-level account. */
function isPersonalName(value) {
  return nameProblem(value) === null;
}

// Matches routes/schoolAccounts.js and routes/adminUsers.js: a handle, not an
// address, though an address-shaped handle is still accepted because the
// seeded accounts use them.
const LOGIN_PATTERN = /^[a-z0-9][a-z0-9._@-]{2,63}$/;

/**
 * A personal handle derived from a personal name: "Guriță Elena" becomes
 * "gurita.elena". Offered as a default when someone claims an account that
 * was provisioned under an institutional login, so the school mailbox handle
 * does not outlive the shared account it belonged to.
 *
 * Returns null when nothing usable can be derived — a name written entirely
 * in an alphabet this does not transliterate — rather than a mangled handle
 * the person would have to correct anyway.
 */
function suggestLogin(value) {
  const words = fold(normaliseName(value))
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);
  if (words.length < 2) return null;
  const handle = `${words[0]}.${words[1]}`;
  return LOGIN_PATTERN.test(handle) ? handle : null;
}

module.exports = {
  COLLECTIVE_WORDS,
  LOGIN_PATTERN,
  fold,
  normaliseName,
  nameProblem,
  isPersonalName,
  suggestLogin,
};
