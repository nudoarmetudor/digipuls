// Traducere în limba română a instrumentului MDSF de autoevaluare
// (Annex A v2/v3). Structură identică cu indicators.js (aceleași coduri,
// aceeași ordine) — doar textul afișat diferă. A se vedea indicators.js
// pentru sursa engleză și proveniența conținutului.

const LEVEL_NAMES = [
  'Sub prag',
  'Accidental',
  'Coordonare inițială',
  'Reproiectarea proceselor',
  'Integrare deplină',
  'Inovare continuă',
];

function levels(descs, benchmarks = []) {
  return descs.map((description, level) => ({
    level,
    levelName: LEVEL_NAMES[level],
    description,
    engagementBenchmark: benchmarks[level]?.engagement || null,
    frequencyBenchmark: benchmarks[level]?.frequency || null,
    evidenceBenchmark: benchmarks[level]?.evidence || null,
  }));
}

const DOMAINS = {
  A: 'Conducere, guvernanță și managementul schimbării',
  B: 'Predare, învățare și evaluare',
  C: 'Capacitate umană și competență digitală',
  D: 'Infrastructură, platforme și ecosistem digital',
};

const INDICATORS = [
  // ---------------- DOMENIUL A ----------------
  {
    code: 'A1', domain: 'A', name: 'Planificare strategică participativă',
    description: 'Obiective și planuri de acțiune bine definite, bazate pe o evaluare critică a situației actuale a școlii, aliniate la strategia națională de transformare digitală.',
    levels: levels([
      'Nu există niciun plan de dezvoltare digitală, sub nicio formă — nici măcar un document formal.',
      'Există un plan, dar doar pentru că a fost impus de superiori; nu are niciun impact asupra managementului resurselor sau operațional; personalul, elevii și părinții nu sunt informați.',
      'Plan elaborat împreună de conducere și unii profesori; ≥20% din personalul didactic este informat și contribuie.',
      'Plan strategic și de acțiune detaliat, cu contribuția multor profesori, elevi și părinți; ≥50% din personal este informat și contribuie regulat; planul influențează deciziile privind echipamentele, bugetul și angajările.',
      'Cadru de planificare strategică sistematic, bine cunoscut, susținut de instrumente digitale; deciziile participative, bazate pe date, sunt norma.',
      'Școala a dezvoltat un cadru original de planificare strategică, folosit de alte școli; organizează ateliere regionale de planificare.',
    ], [
      {}, {},
      { engagement: '≥20% din personal (prag: 2), informați și contribuind', frequency: '≥1 întâlnire de consultare/an', evidence: 'Listă de prezență' },
      { engagement: '≥50% (prag: 4), din ≥2 catedre', frequency: '≥1 ședință a consiliului pedagogic/an + ≥1 ședință a echipei digitale/trimestru', evidence: 'Proces-verbal + extras din plan' },
      { engagement: 'Majoritatea + ≥1 ședință a consiliului părinților + ≥1 ședință a consiliului elevilor/an', frequency: 'Planul revizuit ≥2×/an', evidence: 'Comparație înainte/după a planului' },
      { engagement: '≥1 altă școală instruită', frequency: '≥1 atelier regional organizat/an', evidence: 'Confirmare externă' },
    ]),
  },
  {
    code: 'A2', domain: 'A', name: 'Luarea deciziilor bazate pe date',
    description: 'Deciziile strategice și operaționale se bazează pe colectarea și analiza sistematică a datelor.',
    levels: levels([
      'Nu se colectează niciun fel de date, calitative sau cantitative, pentru fundamentarea deciziilor — nici măcar informal.',
      'Există unele date, dar nu sunt folosite; deciziile se iau ad-hoc, de la caz la caz.',
      'Conducerea promovează decizii bazate pe date pentru diferențiere, sprijin personalizat, gestionarea resurselor și a incidentelor.',
      'Conducerea dezvoltă și revizuiește sistematic sistemele și procesele de sprijinire a deciziilor pe bază de date.',
      'Majoritatea profesorilor sunt implicați regulat; aceasta este norma la nivelul întregii școli.',
      'Școala a dezvoltat sau adoptat un cadru original și un instrument digital pentru decizii bazate pe date; este un reper regional/național.',
    ]),
  },
  {
    code: 'A3', domain: 'A', name: 'Organizație care învață și schimb de cunoștințe',
    description: 'Colectarea și distribuirea bunelor practici; analiza experienței și a incidentelor pentru revizuirea planurilor și rutinelor.',
    levels: levels([
      'Nu există nicio practică în școală care ar putea fi numită schimb de cunoștințe — profesorii lucrează complet izolat.',
      'Schimbul izolat are loc doar întâmplător; nu există colectare sau distribuire sistematică a bunelor practici.',
      'Profesorii inovatori organizează ocazional, din proprie inițiativă, ateliere sau prezentări; unele materiale sunt distribuite prin site-ul școlii sau bloguri.',
      'Conducerea preia inițiativa, organizează schimburi lunare de experiență legate de planul de dezvoltare; activitatea este documentată și sintetizată periodic.',
      'Școala funcționează ca o organizație care învață — dezvoltare continuă bazată pe dovezi, colectare sistematică de date de către mulți profesori folosind instrumente digitale.',
      'Școala este lider regional/sectorial în dezvoltarea transformării digitale; inițiază și gestionează rețele de dezvoltare, găzduiește regulat conferințe, târguri, expoziții.',
    ]),
  },
  {
    code: 'A4', domain: 'A', name: 'Monitorizare și evaluare',
    description: 'Utilizarea indicatorilor, a instrumentelor de colectare a datelor și a planului de acțiune pentru a analiza și monitoriza regulat progresul transformării digitale.',
    levels: levels([
      'Nu are loc nicio monitorizare a progresului transformării digitale, nici măcar raportarea minimă cerută de stat.',
      'Datele sunt colectate doar în măsura și cu frecvența cerută de stat; sunt analizate doar pentru raportarea formală, fără decizii sau modificări ale planului.',
      'Începe autoanaliza regulată, bazată pe dovezi, realizată de conducere și profesori.',
      'Datele sunt distribuite comunității școlare (cu respectarea protecției datelor); conducerea analizează temeinic, rezultatele alimentează autoevaluarea.',
      'Conducerea folosește seturile de date pentru a planifica și anticipa dezvoltarea, combinând analiza calitativă și cantitativă; rezultatele sunt validate extern.',
      'Seturile de date colectate sunt folosite în cercetări realizate de profesori, catedre sau elevi; rezultatele sunt disponibile public.',
    ]),
  },
  {
    code: 'A5', domain: 'A', name: 'Sprijin și motivare din partea conducerii',
    description: 'Sprijinul activ și motivarea personalului de către conducere pentru implementarea inovației digitale.',
    levels: levels([
      'Conducerea este complet neinformată sau indiferentă față de orice activitate de inovație digitală.',
      'Conducerea nu acordă atenție specială inițiativelor de inovație digitală; nu este o prioritate, dar nici nu este obstrucționată activ.',
      'Conducerea încurajează profesorii, sprijină pionierii prin laude și recunoaștere publică.',
      'Conducerea introduce primele măsuri de motivare și sprijin — recompense financiare, formare, deplasări la conferințe, sprijin pentru proiecte, echipamente.',
      'Conducerea este responsabilă, organizează cooperarea între părți pentru diseminarea ideilor inovatoare și adoptarea lor pe scară largă.',
      'Școala/grupurile de lucru conduc dezvoltarea măsurilor de sprijin regional sau național, diseminând sistematic experiența documentată.',
    ]),
  },

  // ---------------- DOMENIUL B ----------------
  {
    code: 'B1', domain: 'B', name: 'STEAM integrat / învățare interdisciplinară bazată pe proiecte',
    description: 'Schimbare pedagogică către învățare creativă, colaborativă, interdisciplinară, bazată pe probleme din lumea reală.',
    levels: levels([
      'Nu are loc nicio predare interdisciplinară sau bazată pe proiecte în școală.',
      'Predarea tradițională este dominantă; proiectele inovatoare sunt rare, necoordonate și nu sunt distribuite între profesori.',
      'Conducerea este informată și coordonează distribuirea experienței.',
      'Predarea interdisciplinară, bazată pe proiecte, devine o practică regulată pentru o parte semnificativă a personalului.',
      'Aceasta a devenit „noua normalitate" pentru aproape toți profesorii.',
      'Școala este un model regional, găzduiește conferințe și ateliere pentru alte școli.',
    ]),
  },
  {
    code: 'B2', domain: 'B', name: 'Schimbarea rolurilor profesorilor și elevilor',
    description: 'Trecerea către o cultură colegială: planificare comună, integrare interdisciplinară, observare și feedback între colegi, predare în echipă; elevii contribuie la planificare și materiale.',
    levels: levels([
      'Predarea este complet individuală și izolată — nu există niciun caz de planificare comună, observare între colegi sau contribuție a elevilor la proiectarea predării.',
      'Colaborarea între profesori este rară, aleatorie, necoordonată.',
      'O minoritate în creștere se implică în activități de predare colaborativă.',
      'Observarea și feedback-ul între colegi devin o practică regulată, coordonată de conducere; elevii au încrederea necesară pentru a contribui la proiectarea resurselor.',
      'Majoritatea profesorilor, același model, coordonat de conducere la nivelul întregii școli.',
      'Școala este un model; profesorii planifică în echipă scenarii inovatoare; elevii co-creează experiențe și resurse de învățare.',
    ]),
  },
  {
    code: 'B3', domain: 'B', name: 'Evaluare centrată pe elev',
    description: 'Evaluare formativă, diagnostică și sumativă centrată pe elev; feedback personalizat; auto- și co-evaluare.',
    levels: levels([
      'Evaluarea este exclusiv tradițională (doar sumativă, notată de profesor), fără niciun caz de evaluare formativă, auto- sau co-evaluare.',
      'Metodele noi, centrate pe elev, sunt folosite rar sau aleatoriu, nepromovate de conducere.',
      'Uneori promovate sau coordonate de conducere.',
      'Metodele sunt promovate și coordonate sistematic ca practică de bază, folosite în majoritatea unităților de învățare.',
      'Metodele sunt dominante și acceptate pe scară largă la nivelul întregii școli, integrate în politica de notare și în rubrici.',
      'Școala conduce reforma regională a evaluării, găzduiește un grup de experți care ajută alte școli să-și schimbe practica sau politica.',
    ]),
  },
  {
    code: 'B4', domain: 'B', name: 'Schimbări structurale în curriculum, orar și spații de învățare',
    description: 'Schimbări sistemice și permanente ale curriculumului, orarului și proiectării spațiilor de învățare, inspirate de noi pedagogii (învățare mixtă, zile de proiect, învățare în aer liber, spații reamenajate).',
    levels: levels([
      'Curriculumul, orarul și spațiile de învățare sunt complet fixe/tradiționale, fără niciun caz de restructurare deliberată pentru pedagogia digitală.',
      'Curriculum, orar și spații destul de tradiționale; schimbările nu sunt promovate sau monitorizate.',
      'Începe experimentarea promovată de conducere.',
      'Conducerea promovează, monitorizează și organizează distribuirea experienței, pentru jumătate din profesori care folosesc regulat formate flexibile.',
      'Implementare sistematică a mai multor schimbări structurale; majoritatea acceptă aceasta ca noua normalitate.',
      'Școala găzduiește zile deschise regionale, ateliere și conferințe pentru a distribui experiența sa de schimbare structurală.',
    ]),
  },
  {
    code: 'B5', domain: 'B', name: 'Utilizarea pedagogică a resurselor digitale și a instrumentelor de IA în predare și învățare',
    description: 'Dacă instrumentele digitale și aplicațiile de IA sunt folosite pentru a îmbunătăți cu adevărat pedagogia — nu doar accesate (Domeniul D) și nu doar o competență deținută de profesor (Domeniul C), ci utilizate efectiv în proiectarea, desfășurarea lecțiilor și implicarea elevilor.',
    levels: levels([
      'Instrumentele digitale nu sunt folosite deloc în proiectarea sau desfășurarea lecțiilor (diferit de „instrumentele nu sunt disponibile" din Domeniul D — aici instrumentele pot exista, dar sunt complet neutilizate pedagogic).',
      'Instrumentele digitale sunt folosite ocazional, în principal pentru prezentare sau proiecție; nu se folosesc instrumente de IA în predare; nu există coordonare a practicii.',
      'Conducerea este informată, încurajează informal distribuirea experienței.',
      'Instrumentele digitale/de IA sunt integrate în proiectarea lecțiilor cu un scop pedagogic clar, nu doar ca înlocuitor al instrumentelor analogice; există îndrumări de bază privind utilizarea responsabilă a IA.',
      'Majoritatea proiectează în mod regulat lecții folosind instrumente digitale/de IA pentru diferențiere, creativitate sau gândire de nivel superior; există îndrumări pedagogice explicite pentru utilizarea IA, inclusiv garanții privind integritatea academică.',
      'Școala pionierizează și documentează noi modele pedagogice pentru predarea susținută de digital/IA, contribuind la orientările naționale.',
    ]),
  },

  // ---------------- DOMENIUL C ----------------
  {
    code: 'C1', domain: 'C', name: 'Competența digitală a cadrelor didactice',
    description: 'Capacitatea cadrelor didactice de a folosi în mod semnificativ tehnologia digitală pentru a sprijini pedagogia inovatoare, aliniată la DigCompEdu.',
    levels: levels([
      'Conducerea nu are nicio informație despre competența digitală a cadrelor didactice — nici măcar o percepție informală despre cine poate sau nu poate folosi instrumente digitale.',
      'Conducerea are o conștientizare informală, dar nu are o imagine fiabilă asupra nivelurilor de competență digitală ale cadrelor didactice.',
      'Se stabilește o bază de cadre didactice certificate.',
      'Certificarea ajunge la jumătate din personal.',
      'Majoritatea sunt certificați, folosind tehnologia digitală zilnic în activitatea lor.',
      'Școala este un centru de formare, găzduiește un grup de experți care conduce politica și practica de dezvoltare a competențelor la nivel regional.',
    ], [
      {}, {},
      { engagement: '≥20% din cadre didactice (prag: 2) certificate DigCompEdu B2', frequency: 'Registru înființat, actualizat ≥1×/an', evidence: 'Extras din registru' },
      { engagement: '≥50% (prag: 4) certificate B2', frequency: 'Registru actualizat ≥1×/trimestru', evidence: 'Jurnal de actualizări' },
      { engagement: 'Majoritatea certificate B2', frequency: 'Revizuit alături de planificarea DP', evidence: 'Referință încrucișată cu planul DP' },
      { engagement: 'Formează ≥1 grup de cadre didactice din alte școli/an', frequency: '≥1 formare externă/an', evidence: 'Registru al formării externe' },
    ]),
  },
  {
    code: 'C2', domain: 'C', name: 'Competența digitală a elevilor',
    description: 'Competența digitală a elevilor, aliniată la DigComp 3.0: alfabetizare informațională și în domeniul datelor, comunicare și colaborare, creare de conținut, siguranță, rezolvare de probleme.',
    levels: levels([
      'Nu se acordă nicio atenție competenței digitale a elevilor la nivel de școală — nici măcar în cadrul disciplinei Educația digitală.',
      'Rămâne exclusiv în seama disciplinei obligatorii Educația digitală și a profesorului acesteia.',
      'Unele discipline, pe lângă Educația digitală, încep să abordeze subiectul, fără coordonare interdisciplinară.',
      'Coordonat la jumătate din discipline/clase, cu referire explicită la domeniile DigComp 3.0.',
      'Progresie coordonată la nivelul întregii școli, pe toate clasele și disciplinele, cu componente de siguranță integrate.',
      'Abordarea școlii este un model regional, distribuit prin formare și materiale; școala contribuie la rafinarea adaptării naționale a DigComp 3.0.',
    ]),
  },
  {
    code: 'C3', domain: 'C', name: 'Capacitate structurată de dezvoltare profesională, mentorat și coaching',
    description: 'Dacă școala are mecanisme interne — nu doar acces la formare externă — care susțin creșterea competenței digitale a personalului, inclusiv participarea la DigiProf-B/-C și practica internă „profesorul învață profesorul".',
    levels: levels([
      'Nu a avut loc nicio dezvoltare profesională legată de competența digitală în școală — nici formare, nici sprijin informal între colegi.',
      'Dezvoltarea depinde în întregime de inițiativa individuală; nu există o structură internă de mentorat sau coaching.',
      'Există sprijin informal, ocazional între colegi, dar neorganizat.',
      'Un grup intern de mentori organizează sesiuni regulate, documentate, de învățare între colegi.',
      'Există un traseu structurat de dezvoltare profesională internă, cu integrarea sistematică a personalului nou.',
      'Mentorii sau formatorii interni ai școlii sprijină dezvoltarea profesională a altor școli; școala este un centru DP recunoscut în regiune.',
    ]),
  },
  {
    code: 'C4', domain: 'C', name: 'Alfabetizare în domeniul IA și competențe privind tehnologiile emergente',
    description: 'Înțelegerea de către personal și elevi a sistemelor de IA, a capacităților și limitărilor acestora, utilizarea etică și tehnologiile emergente dincolo de cerințele curriculare actuale.',
    levels: levels([
      'Nu există nicio conștientizare sau îndrumare în școală privind IA sau tehnologiile emergente — nu se discută, nu este reglementată, nu este pe agenda nimănui.',
      'Există conștientizare la nivel de principiu, dar nu s-a făcut nimic; utilizarea, dacă există, este ad-hoc și nereglementată.',
      'Există sesiuni izolate de conștientizare sau documente de îndrumare, dar nu sunt sistematizate.',
      'Există îndrumări de bază privind alfabetizarea în IA pentru personal și elevi; a fost oferită o formare; conștientizarea se extinde la o parte semnificativă a personalului.',
      'Alfabetizarea în IA și tehnologii emergente este integrată coordonat atât în DP-ul personalului, cât și în livrarea curriculumului elevilor.',
      'Școala pionierizează practica de alfabetizare în IA, contribuind cu studii de caz sau îndrumări folosite de alte școli sau de Minister.',
    ]),
  },

  // ---------------- DOMENIUL D ----------------
  {
    code: 'D1', domain: 'D', name: 'Rețea și securitate digitală',
    description: 'Calitatea rețelei și securitatea digitală, ancorate în standardele obligatorii ale Anexei 5 a Ordinului 675/2024, ca prag obligatoriu.',
    levels: levels([
      'Nu îndeplinește minimul obligatoriu al Ordinului 675: acoperire WiFi/LAN la nivelul întregii școli, ≥2–3 subrețele separate protejate prin parolă, 802.11n și 802.11ac, firewall activ, filtrare de conținut. Nu poate fi evaluat la nivelurile 1–5 în timp ce este neconform.',
      'Îndeplinește pragul minim, dar acoperirea și utilizarea sunt slab coordonate: subrețelele pot exista doar pe hârtie, gestionarea este ad-hoc și nimeni nu urmărește incidentele.',
      'Conducerea a desemnat o responsabilitate informală pentru gestionarea rețelei; incidentele sunt tratate reactiv, fără a fi înregistrate sistematic.',
      'Utilizarea este monitorizată, incidentele sunt rezolvate conform unei politici documentate de rețea; amplasarea punctelor de acces respectă recomandările Anexei 5.',
      'Autentificare unică modernă și securizată, gestionare unitară a utilizatorilor între sisteme; monitorizare periodică a traficului; reguli de gestionare a riscurilor formalizate; WiFi 6 opțional implementat.',
      'Școala testează și dezvoltă constant cele mai noi soluții de rețea, consiliază alte școli din regiune; managementul riscurilor de securitate IT previne activ incidentele.',
    ]),
  },
  {
    code: 'D2', domain: 'D', name: 'Echipamente digitale',
    description: 'Accesul la echipamente digitale moderne pentru personal și elevi, ancorat în Anexele 1, 2 și 4 ale Ordinului 675/2024, ca prag obligatoriu.',
    levels: levels([
      'Nu îndeplinește minimul obligatoriu al Ordinului 675: numărul de echipamente este sub cota Anexei 2 pentru banda de înscriere, sau echipamentele nu respectă specificațiile minime ale Anexei 1, sau lipsește echipamentul obligatoriu al Anexei 4 pentru un tip de sală. Nu poate fi evaluat la nivelurile 1–5 în timp ce este neconform.',
      'Îndeplinește cotele și specificațiile minime; echipamentele sunt prezente, dar folosite în principal ca instrumente de proiecție sau stau nefolosite în afara câtorva săli; nu există reguli de împrumut sau evidență a utilizării.',
      'Școala a achiziționat echipamente suplimentare pentru sălile de clasă, cu reguli de împrumut; echipamentul de prezentare este standard în majoritatea sălilor.',
      'Utilizarea echipamentelor este reglementată și obișnuită, cu cerere/cozi observate.',
      'Echipamentele interacționează cu echipamentele suplimentare ale sălilor; școala a trecut la nivelul de echipamente suplimentare recomandate pentru cel puțin o disciplină.',
      'Școala testează constant noi categorii de echipamente, dezvoltă materiale didactice pentru acestea, consiliază alte școli din regiune.',
    ]),
  },
  {
    code: 'D3', domain: 'D', name: 'Managementul IT',
    description: 'Planificare, analiză periodică a resurselor și securității, și dezvoltare strategică a funcției IT a școlii.',
    levels: levels([
      'Nimeni din școală nu are nicio responsabilitate, formală sau informală, pentru managementul IT — nici măcar un responsabil implicit.',
      'Nu există manager IT; capacitate limitată de management IT; nu există plan de dezvoltare IT.',
      'Școala are un manager IT (intern sau externalizat) responsabil de planificare; planul de dezvoltare include o secțiune IT folosită pentru bugetul IT anual.',
      'Implementare deliberată a strategiei IT; conducerea are o imagine constantă asupra infrastructurii; nevoile sunt cartografiate regulat.',
      'Management bun al riscurilor IT, monitorizare și analiză, cu implicarea elevilor sau angajatorilor unde este posibil.',
      'Managementul IT al școlii este un exemplu recunoscut pentru alții; experiența este distribuită activ altor școli.',
    ]),
  },
  {
    code: 'D4', domain: 'D', name: 'Suport pentru utilizatori',
    description: 'Calitatea suportului IT și tehnologic-educațional pentru utilizatori, inclusiv satisfacția personalului.',
    levels: levels([
      'Personalul sau elevii care întâmpină probleme IT nu au niciun recurs — nici măcar auto-ajutor informal.',
      'Practic nu există suport IT/tehnologic-educațional din partea conducerii; personalul și elevii se auto-sprijină informal.',
      'Conducerea oferă un nivel minim de suport IT pentru utilizatori, iar profesorii sunt informați despre acesta.',
      'Suport IT bine organizat, oferit de conducere sau administrația locală.',
      'Satisfacție ridicată a conducerii, profesorilor și elevilor față de suportul IT/tehnologic-educațional; feedback-ul este colectat regulat, iar serviciile sunt dezvoltate continuu.',
      'Școala a dezvoltat propriul standard de nivel de serviciu pentru suport IT/tehnologic-educațional, distribuit ca exemplu altor școli.',
    ]),
  },
  {
    code: 'D5', domain: 'D', name: 'Software, servicii digitale și sisteme informaționale',
    description: 'Utilizarea și dezvoltarea sistematică a software-ului educațional și administrativ, a serviciilor digitale și a sistemelor informaționale; trecerea către soluții interoperabile, bazate pe cloud.',
    levels: levels([
      'Nu se folosește niciun serviciu digital administrativ — nici catalog electronic, nici stocare partajată, nici site al școlii.',
      'Se folosesc doar servicii digitale administrative individuale (de exemplu, catalog electronic, stocare cloud, site-ul școlii).',
      'Au fost introduse câteva servicii digitale suplimentare (medii de învățare online, software educațional, sistem informațional al bibliotecii).',
      'Personalul și elevii au acces la e-servicii și sisteme informaționale funcționale, monitorizate de școală, cu formare și materiale introductive; serviciile depășesc administrarea, incluzând medii de învățare online, repozitorii de materiale/cercetare.',
      'Școala operează o soluție cloud sau un sistem informațional convenabil și versatil, combinând e-servicii interoperabile; se testează constant soluții noi.',
      'Soluția integrată de servicii digitale/sisteme informaționale a școlii este un model pentru alte școli, distribuit prin formare și consultanță.',
    ]),
  },
];

module.exports = { DOMAINS, INDICATORS, LEVEL_NAMES };
