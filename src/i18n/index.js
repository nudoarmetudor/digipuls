// UI-chrome translation dictionary + small label lookups for recurring
// database enum values (cycle status, change state) that appear across
// many views. Indicator/domain/level *content* lives in
// src/data/indicators.js + indicators.ro.js — this file is for everything
// around that content: navigation, buttons, page headers.
//
// Coverage note (honest, per README's "not yet built" pattern): the
// highest-traffic pages (nav, login, school dashboard/assessment/plan/
// history, ministry dashboard) are fully translated. Some lower-traffic
// pages (admin, partner, strategic, territorial, public, plan-document)
// keep some English prose — see README.md "Romanian language coverage".

const SUPPORTED_LANGS = ['en', 'ro'];

const STRINGS = {
  en: {
    brand_tagline: "Moldova's digital school maturity platform",
    nav_dashboard: 'Dashboard',
    nav_my_progress: 'My progress',
    nav_national_dashboard: 'National dashboard',
    nav_compliance: 'Compliance',
    nav_add_school: 'Add school (SIME)',
    nav_audit_log: 'Audit log',
    nav_regional_dashboard: 'Regional dashboard',
    nav_my_offers: 'School overview',
    nav_training_dashboard: 'Training-needs dashboard',
    nav_public_view: 'Public view',
    nav_login: 'Log in',
    nav_logout: 'Log out',

    login_title: 'Log in',
    login_subtitle: "Moldova's digital school maturity platform — MVP prototype.",
    login_email: 'Email',
    login_password: 'Password',
    login_button: 'Log in',
    login_error: 'Invalid email or password.',
    login_demo_accounts: 'Demo accounts',
    login_demo_password_note: 'All use password:',
    login_rate_limited: 'Too many attempts. Please wait a few minutes and try again.',

    change_password_title: 'Set a new password',
    change_password_subtitle: 'Your account was created with a temporary password. Choose a new one before continuing.',
    change_password_new_label: 'New password (minimum 10 characters)',
    change_password_confirm_label: 'Confirm new password',
    change_password_button: 'Set password and continue',
    change_password_error: 'Passwords must match and be at least 10 characters long.',

    school_welcome_title: 'Welcome to DigiPuls',
    school_welcome_body: "Your school hasn't started a self-assessment yet. The first cycle covers all 19 indicators across the four domains, plus your equipment inventory and network checklist.",
    school_start_first_cycle: 'Start first assessment cycle',
    school_cycle_in_progress: 'in progress',
    school_cycle_confirmed: 'confirmed',
    school_indicators_rated: 'of 19 indicators rated so far.',
    school_continue_assessment: 'Continue assessment',
    school_confirmed_on: 'Confirmed',
    school_next_renewal: 'Next renewal due in ~2 years.',
    school_view_assessment: 'View assessment',
    school_view_plan: 'View plan',
    school_start_renewal: 'Start renewal cycle (continuation)',
    school_cycle_history: 'Cycle history',
    th_cycle: 'Cycle', th_status: 'Status', th_started: 'Started', th_confirmed: 'Confirmed', th_plan: 'Plan',

    wheel_title: 'Maturity wheel',
    wheel_caption: '19 sectors, one per indicator, grouped by domain (A navy, B green, C purple, D amber). Ring distance from centre = current level (0 = centre hole, 5 = outer edge). Hover a sector for its exact level.',
    wheel_domains_caption: 'Shape only, no exact scores shown — consistent with the mandatory public-disclosure minimum.',
    wheel_by_cycle: 'Maturity wheel — cycle by cycle',

    assessment_confirm_title: 'Confirm this cycle',
    assessment_confirm_body: 'All 19 indicators must be rated, and every indicator rated Level 2 or above must have at least one evidence item attached, before the cycle can be confirmed.',
    assessment_confirm_button: 'Confirm cycle & proceed to plan',
    assessment_previous_cycle: 'Previous cycle:',
    assessment_now: 'now',
    assessment_select_level: 'Select a level above to see its description.',
    assessment_comment_label: 'Comment / justification (optional — e.g. a defensible reason for not pursuing a higher level)',
    assessment_save_rating: 'Save rating',
    assessment_evidence_required: 'Evidence',
    assessment_evidence_required_note: '(required — Level 2+)',
    assessment_no_evidence: 'No evidence attached yet — this cycle cannot be confirmed until you add at least one item.',
    assessment_add_evidence: 'Add evidence',

    plan_title: 'Digital Development Plan',
    plan_subtitle: 'A 2-year plan. Recommended: 3–5 priorities, each linked to a specific indicator.',
    plan_priorities: 'Priorities',
    plan_add_priority: 'Add priority',
    plan_funding_title: 'Funding, approval & consultation',
    plan_save_details: 'Save details',
    plan_publish_title: 'Publish',
    plan_publish_button: 'Publish plan',
    plan_published: 'Published',
    plan_view_document: 'View / print plan document',

    history_title: 'My progress over time',

    ministry_dashboard_title: 'National dashboard',
    ministry_dashboard_subtitle: 'All schools on DigiPuls — real-time status, aggregated.',
    stat_schools_provisioned: 'Schools provisioned',
    stat_confirmed_data: 'With confirmed data',
    stat_compliant: 'Fully Order 675 compliant',
    stat_avg_domain: 'Average domain maturity (confirmed schools)',
    all_schools: 'All schools',

    status_draft: 'Draft', status_confirmed: 'Confirmed',

    domain_label: 'Domain', previous_cycle: 'Previous cycle:', level_label: 'Level',
    order675_data_title: 'Order 675 compliance data',
    order675_data_caption: "This feeds D1 and D2's Level-0 determination directly — see the compliance panel below.",
    device_inventory: 'Device inventory', network_checklist: 'Network checklist',
    save_inventory: 'Save inventory', save_checklist: 'Save checklist',
    compliant: 'COMPLIANT', non_compliant: 'NON-COMPLIANT', missing: 'MISSING', ok: 'OK', short: 'SHORT',
    compliance_note: "If D1 or D2 above is non-compliant, that indicator's rating is capped at Level 0 regardless of what's selected in the picker — non-compliance with Order 675 is Level 0 by definition.",
    order675_scope_note: "Checks declared equipment quantities (Annex 2) and the network checklist (Annex 5) only — technical specifications (Annex 1), supplementary equipment (Annex 3), and room-usage mandates (Annex 4) are not yet verified by this system. \"Compliant\" here means \"meets the quantities/checklist DigiPuls currently checks,\" not full Order 675 verification.",
    evidence_type_label: 'Evidence type', evidence_source_label: 'Source',
    evidence_description_label: 'Description (minimum evidence statement — period, group, baseline→result)',
    requirement: 'Requirement', required: 'Required', actual: 'Actual',

    plan_previous_priorities: "Previous cycle's priorities",
    th_indicator: 'Indicator', th_target: 'Target', th_outcome: 'Outcome', not_yet_reviewed: 'not yet reviewed',
    rationale_label: 'Rationale', actions_label: 'Actions', responsible_label: 'Responsible', timeline_label: 'Timeline',
    linked_indicator: 'Linked indicator', current_level_label: 'Current level', target_level_label: 'Target level',
    rationale_field: 'Rationale (why this priority — must respond to a diagnosed blockage)',
    actions_field: 'Action plan (specific actions, not a generic aspiration)',
    responsible_persons: 'Responsible person(s)', timeline_field: 'Timeline (within the 2-year cycle)',
    funding_source: 'Funding source', approving_authority: 'Approving authority',
    consultation_notes: "Stakeholder consultation notes (pedagogical council, parents' council, student reps)",
    publish_caption: "Generates the plan document and applies your school's visibility settings.",
  },
  ro: {
    brand_tagline: 'Platforma națională pentru maturitatea digitală a școlilor din Moldova',
    nav_dashboard: 'Tablou de bord',
    nav_my_progress: 'Progresul meu',
    nav_national_dashboard: 'Tablou de bord național',
    nav_compliance: 'Conformitate',
    nav_donation_matching: 'Potrivire donații',
    nav_add_school: 'Adaugă școală (SIME)',
    nav_audit_log: 'Jurnal de audit',
    nav_regional_dashboard: 'Tablou de bord regional',
    nav_my_offers: 'Prezentare școli',
    nav_training_dashboard: 'Tablou de bord — nevoi de formare',
    nav_public_view: 'Vizualizare publică',
    nav_login: 'Autentificare',
    nav_logout: 'Deconectare',

    login_title: 'Autentificare',
    login_subtitle: 'Platforma națională pentru maturitatea digitală a școlilor din Moldova — prototip MVP.',
    login_email: 'Email',
    login_password: 'Parolă',
    login_button: 'Autentificare',
    login_error: 'Email sau parolă incorecte.',
    login_demo_accounts: 'Conturi demonstrative',
    login_demo_password_note: 'Toate folosesc parola:',
    login_rate_limited: 'Prea multe încercări. Așteptați câteva minute și încercați din nou.',

    change_password_title: 'Setați o parolă nouă',
    change_password_subtitle: 'Contul dumneavoastră a fost creat cu o parolă temporară. Alegeți una nouă înainte de a continua.',
    change_password_new_label: 'Parolă nouă (minimum 10 caractere)',
    change_password_confirm_label: 'Confirmați parola nouă',
    change_password_button: 'Setați parola și continuați',
    change_password_error: 'Parolele trebuie să coincidă și să aibă cel puțin 10 caractere.',

    school_welcome_title: 'Bine ați venit la DigiPuls',
    school_welcome_body: 'Școala dumneavoastră nu a început încă o autoevaluare. Primul ciclu acoperă toți cei 19 indicatori din cele patru domenii, plus inventarul de echipamente și lista de verificare a rețelei.',
    school_start_first_cycle: 'Începeți primul ciclu de autoevaluare',
    school_cycle_in_progress: 'în desfășurare',
    school_cycle_confirmed: 'confirmat',
    school_indicators_rated: 'din 19 indicatori evaluați până acum.',
    school_continue_assessment: 'Continuați autoevaluarea',
    school_confirmed_on: 'Confirmat',
    school_next_renewal: 'Următoarea reînnoire este scadentă în ~2 ani.',
    school_view_assessment: 'Vizualizați autoevaluarea',
    school_view_plan: 'Vizualizați planul',
    school_start_renewal: 'Începeți ciclul de reînnoire (continuare)',
    school_cycle_history: 'Istoricul ciclurilor',
    th_cycle: 'Ciclu', th_status: 'Stare', th_started: 'Început', th_confirmed: 'Confirmat', th_plan: 'Plan',

    wheel_title: 'Roata maturității',
    wheel_caption: '19 sectoare, câte unul pentru fiecare indicator, grupate pe domenii (A bleumarin, B verde, C mov, D chihlimbar). Distanța inelului față de centru = nivelul curent (0 = gaura centrală, 5 = marginea exterioară). Treceți cu mouse-ul peste un sector pentru nivelul exact.',
    wheel_domains_caption: 'Se arată doar forma, fără scoruri exacte — în conformitate cu minimul obligatoriu de divulgare publică.',
    wheel_by_cycle: 'Roata maturității — ciclu cu ciclu',

    assessment_confirm_title: 'Confirmați acest ciclu',
    assessment_confirm_body: 'Toți cei 19 indicatori trebuie evaluați, iar fiecare indicator evaluat la Nivelul 2 sau mai sus trebuie să aibă cel puțin o dovadă atașată, înainte ca ciclul să poată fi confirmat.',
    assessment_confirm_button: 'Confirmați ciclul și treceți la plan',
    assessment_previous_cycle: 'Ciclul anterior:',
    assessment_now: 'acum',
    assessment_select_level: 'Selectați un nivel mai sus pentru a vedea descrierea acestuia.',
    assessment_comment_label: 'Comentariu / justificare (opțional — de ex. un motiv întemeiat pentru a nu urmări un nivel mai înalt)',
    assessment_save_rating: 'Salvați evaluarea',
    assessment_evidence_required: 'Dovezi',
    assessment_evidence_required_note: '(obligatoriu — Nivel 2+)',
    assessment_no_evidence: 'Nu a fost atașată încă nicio dovadă — acest ciclu nu poate fi confirmat până nu adăugați cel puțin un element.',
    assessment_add_evidence: 'Adăugați dovadă',

    plan_title: 'Planul de Dezvoltare Digitală',
    plan_subtitle: 'Un plan pe 2 ani. Recomandat: 3–5 priorități, fiecare legată de un indicator specific.',
    plan_priorities: 'Priorități',
    plan_add_priority: 'Adăugați o prioritate',
    plan_funding_title: 'Finanțare, aprobare și consultare',
    plan_save_details: 'Salvați detaliile',
    plan_publish_title: 'Publicare',
    plan_publish_button: 'Publicați planul',
    plan_published: 'Publicat',
    plan_view_document: 'Vizualizați / tipăriți documentul planului',

    history_title: 'Progresul meu în timp',

    ministry_dashboard_title: 'Tablou de bord național',
    ministry_dashboard_subtitle: 'Toate școlile din DigiPuls — stare agregată, în timp real.',
    stat_schools_provisioned: 'Școli înregistrate',
    stat_confirmed_data: 'Cu date confirmate',
    stat_compliant: 'Conforme integral cu Ordinul 675',
    stat_avg_domain: 'Maturitate medie pe domenii (școli confirmate)',
    all_schools: 'Toate școlile',

    status_draft: 'Ciornă', status_confirmed: 'Confirmat',

    domain_label: 'Domeniul', previous_cycle: 'Ciclul anterior:', level_label: 'Nivel',
    order675_data_title: 'Date de conformitate cu Ordinul 675',
    order675_data_caption: 'Acestea alimentează direct determinarea Nivelului 0 pentru D1 și D2 — vezi panoul de conformitate de mai jos.',
    device_inventory: 'Inventar de echipamente', network_checklist: 'Listă de verificare a rețelei',
    save_inventory: 'Salvați inventarul', save_checklist: 'Salvați lista de verificare',
    compliant: 'CONFORM', non_compliant: 'NECONFORM', missing: 'LIPSĂ', ok: 'OK', short: 'INSUFICIENT',
    compliance_note: 'Dacă D1 sau D2 de mai sus este neconform, evaluarea acelui indicator este plafonată la Nivelul 0, indiferent de ce este selectat în panou — neconformitatea cu Ordinul 675 este, prin definiție, Nivelul 0.',
    order675_scope_note: 'Verifică doar cantitățile de echipamente declarate (Anexa 2) și lista de verificare a rețelei (Anexa 5) — specificațiile tehnice (Anexa 1), echipamentele suplimentare (Anexa 3) și cerințele de utilizare a sălilor (Anexa 4) nu sunt încă verificate de acest sistem. „Conform" înseamnă aici „îndeplinește cantitățile/lista de verificare pe care DigiPuls le verifică în prezent", nu o verificare completă a Ordinului 675.',
    evidence_type_label: 'Tipul dovezii', evidence_source_label: 'Sursă',
    evidence_description_label: 'Descriere (declarație minimă de dovadă — perioadă, grup, situație inițială→rezultat)',
    requirement: 'Cerință', required: 'Necesar', actual: 'Actual',

    plan_previous_priorities: 'Prioritățile ciclului anterior',
    th_indicator: 'Indicator', th_target: 'Țintă', th_outcome: 'Rezultat', not_yet_reviewed: 'nerevizuit încă',
    rationale_label: 'Justificare', actions_label: 'Acțiuni', responsible_label: 'Responsabil', timeline_label: 'Termen',
    linked_indicator: 'Indicator asociat', current_level_label: 'Nivel curent', target_level_label: 'Nivel țintă',
    rationale_field: 'Justificare (de ce această prioritate — trebuie să răspundă unui blocaj diagnosticat)',
    actions_field: 'Plan de acțiune (acțiuni concrete, nu o aspirație generică)',
    responsible_persons: 'Persoană(e) responsabilă(e)', timeline_field: 'Termen (în cadrul ciclului de 2 ani)',
    funding_source: 'Sursa de finanțare', approving_authority: 'Autoritatea de aprobare',
    consultation_notes: 'Note de consultare a părților interesate (consiliul pedagogic, consiliul părinților, reprezentanții elevilor)',
    publish_caption: 'Generează documentul planului și aplică setările de vizibilitate ale școlii dumneavoastră.',
  },
};

function t(lang) {
  const dict = STRINGS[lang] || STRINGS.en;
  return (key) => dict[key] || STRINGS.en[key] || key;
}

const STATUS_LABELS = {
  en: { DRAFT: 'Draft', CONFIRMED: 'Confirmed' },
  ro: { DRAFT: 'Ciornă', CONFIRMED: 'Confirmat' },
};

const CHANGE_STATE_LABELS = {
  en: { MAINTAINED: 'Maintained', GREW: 'Grew', DECAYED: 'Decayed' },
  ro: { MAINTAINED: 'Menținut', GREW: 'A crescut', DECAYED: 'A scăzut' },
};

module.exports = { t, STRINGS, SUPPORTED_LANGS, STATUS_LABELS, CHANGE_STATE_LABELS };
