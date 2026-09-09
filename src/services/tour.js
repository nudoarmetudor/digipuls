// The guided tutorial: chapters, steps, and the words for each of them.
//
// The pilot's users are school directors and teachers who have never seen this
// platform and, realistically, will not have read the manual before they are
// asked to run an assessment. So the manual has to be *in* the product: an
// overlay that points at the actual control on the actual page and says what
// it is for.
//
// Everything a step needs is here rather than in the client script, for two
// reasons. The text has to exist in all three languages, and the tour has to
// be filtered by what the person may actually do — showing a mentor the
// "publish the report" step would teach them a button they will never see.
// Both are decided on the server, where the translator and the capability set
// already are.
//
// Targets are `data-tour` attributes rather than classes or nth-child paths.
// A class is a styling decision and will be renamed by somebody who has never
// heard of the tutorial; a `data-tour` attribute has exactly one reason to
// exist, so removing it is a deliberate act. When a target is not on the
// current page the step still shows — it says where it happens instead of
// pretending to point at nothing.

/** One string in the three languages the platform runs in. */
const L = (en, ro, ru) => ({ en, ro, ru });

/**
 * @param {string} key      stable id, used in the URL fragment and in storage
 * @param {?string} target  a `[data-tour="…"]` selector, or null for a step
 *                          that explains rather than points
 * @param {?string} goto    a path this step can take the reader to
 * @param {object} title
 * @param {object} body
 * @param {?string} need    capability required to see this step
 */
const S = (key, target, goto, title, body, need = null) => ({
  key, target, goto, title, body, need,
});

// Who the tutorial is for.
//
// The people who need it are the ones who have to *do* something: the
// principal, the deputy principal and the mentors, working through an
// assessment they have never seen before. The oversight line reads finished
// results — a metamentor, the Ministry, a partner and an administrator all
// arrive at a dashboard, and walking them through a school's workflow would
// teach them controls they do not have. So the toggle is not offered to them
// at all, rather than offered and then mostly empty.
const AUDIENCE = 'view.school';

/** True when this person is one of the people the tutorial is written for. */
function tourApplies(has) {
  return has(AUDIENCE);
}

const CHAPTERS = [
  // ---------------------------------------------------------------- basics
  {
    key: 'basics',
    need: null,
    title: L('Finding your way', 'Cum vă orientați', 'Как здесь ориентироваться'),
    intro: L(
      'Five minutes on the things that are on every page.',
      'Cinci minute despre lucrurile care apar pe fiecare pagină.',
      'Пять минут о том, что есть на каждой странице.'),
    steps: [
      S('welcome', '[data-tour="tour-toggle"]', null,
        L('This button opens and closes the guide',
          'Acest buton deschide și închide ghidul',
          'Эта кнопка открывает и закрывает руководство'),
        L('The guide follows you from page to page. Close it whenever you like — it remembers where you were, and you can jump back to any step from the list on the right.',
          'Ghidul vă însoțește din pagină în pagină. Îl puteți închide oricând — ține minte unde ați rămas, iar din lista din dreapta puteți reveni la orice pas.',
          'Руководство следует за вами со страницы на страницу. Закрывайте его когда угодно — оно запомнит, где вы остановились, а из списка справа можно вернуться к любому шагу.')),
      S('sidebar', '[data-tour="sidebar"]', null,
        L('Everything you can do is in this panel',
          'Tot ce puteți face se află în acest panou',
          'Всё, что вам доступно, — в этой панели'),
        L('It is built from what your own position allows, so you are never offered a page that would then refuse you. If a colleague has a link you do not, that is the difference between your positions, not a fault.',
          'Este construit din ceea ce vă permite funcția dumneavoastră, așa că nu vi se oferă niciodată o pagină care apoi v-ar refuza. Dacă un coleg are un link pe care dumneavoastră nu îl aveți, aceasta este diferența dintre funcții, nu o eroare.',
          'Она строится из того, что разрешает ваша должность, поэтому вам никогда не предложат страницу, которая затем откажет. Если у коллеги есть ссылка, которой нет у вас, — это различие должностей, а не ошибка.')),
      S('workspace', '[data-tour="workspace-switch"]', null,
        L('Which position this tab is working in',
          'În ce funcție lucrează această filă',
          'В какой должности работает эта вкладка'),
        L('You hold more than one position, and each is a separate workspace. The position is part of the address, so two browser tabs can sit in two different ones at the same time without mixing them up.',
          'Dețineți mai multe funcții, iar fiecare este un spațiu de lucru separat. Funcția face parte din adresă, așa că două file de browser pot sta în două funcții diferite în același timp, fără să le amestece.',
          'У вас несколько должностей, и каждая — отдельное рабочее пространство. Должность входит в адрес, поэтому две вкладки браузера могут одновременно работать в разных должностях, не смешивая их.'),
        'ctx.multiWorkspace'),
      S('lang', '[data-tour="lang-switch"]', null,
        L('Romanian, Russian, English',
          'Română, rusă, engleză',
          'Румынский, русский, английский'),
        L('The whole platform, including the printed documents and the public pages. Your choice is remembered, so you only make it once.',
          'Întreaga platformă, inclusiv documentele tipărite și paginile publice. Alegerea este reținută, deci o faceți o singură dată.',
          'Вся платформа, включая печатные документы и публичные страницы. Выбор запоминается, так что делается один раз.')),
      S('display', '[data-tour="display-settings"]', null,
        L('Larger text, more contrast, less motion',
          'Text mai mare, contrast mai puternic, mai puțină mișcare',
          'Крупнее текст, выше контраст, меньше движения'),
        L('Set once per browser and it applies everywhere. If the text is small on a projector or a phone, this is the fix — nothing here changes the data.',
          'Se setează o dată per browser și se aplică peste tot. Dacă textul este mic pe un proiector sau pe telefon, aici este soluția — nimic de aici nu schimbă datele.',
          'Настраивается один раз в браузере и действует везде. Если текст мелкий на проекторе или телефоне — это здесь; на данные ничто из этого не влияет.')),
      S('feedback', '[data-tour="feedback-toggle"]', null,
        L('Something wrong? Say so from the page it is on',
          'Ceva nu funcționează? Semnalați chiar de pe pagina respectivă',
          'Что-то не так? Сообщите прямо со страницы'),
        L('The report carries the page you sent it from, so the developers know where to look. Whoever hits the problem is the person best placed to describe it — you do not need anyone’s permission to report one.',
          'Sesizarea poartă cu ea pagina de pe care ați trimis-o, astfel încât dezvoltatorii știu unde să caute. Cine întâlnește problema este cel mai în măsură să o descrie — nu aveți nevoie de permisiunea nimănui pentru a o semnala.',
          'Сообщение несёт с собой страницу, с которой отправлено, поэтому разработчики знают, где искать. Кто столкнулся с проблемой, тот и опишет её лучше всех — разрешение ни у кого спрашивать не нужно.'),
        'feedback.submit'),
    ],
  },

  // -------------------------------------------------------------- accounts
  {
    key: 'accounts',
    need: 'school.accounts',
    title: L('Your school’s accounts', 'Conturile instituției', 'Учётные записи учреждения'),
    intro: L(
      'Before the assessment: give every member of the digital team their own account.',
      'Înainte de evaluare: dați fiecărui membru al echipei digitale propriul cont.',
      'Перед оцениванием: дайте каждому члену цифровой команды свою учётную запись.'),
    steps: [
      S('why', '[data-tour="accounts-table"]', '/school/accounts',
        L('One account, one person',
          'Un cont, o persoană',
          'Одна запись — один человек'),
        L('DigiPuls records who did what: who assessed, who agreed a level, who confirmed, who published. A login shared by the team cannot say any of that — and the two-sided assessment is impossible if one account is on both sides.',
          'DigiPuls înregistrează cine ce a făcut: cine a evaluat, cine a convenit un nivel, cine a confirmat, cine a publicat. Un cont folosit în comun nu poate spune nimic din toate acestea — iar evaluarea în două părți este imposibilă dacă un singur cont este de ambele părți.',
          'DigiPuls фиксирует, кто что сделал: кто оценивал, кто согласовал уровень, кто подтвердил, кто опубликовал. Общий логин не может этого сказать — и двустороннее оценивание невозможно, если одна запись стоит с обеих сторон.')),
      S('new', '[data-tour="accounts-new"]', '/school/accounts',
        L('Create an account for each mentor',
          'Creați un cont pentru fiecare mentor',
          'Создайте запись для каждого ментора'),
        L('Five or six, the whole digital team. You can only create mentors, and only for your own school — the position and the institution are not fields on the form, so they cannot be pointed anywhere else.',
          'Cinci sau șase, întreaga echipă digitală. Puteți crea doar mentori și doar pentru propria instituție — funcția și instituția nu sunt câmpuri în formular, deci nu pot fi îndreptate în altă parte.',
          'Пять-шесть человек — вся цифровая команда. Создавать можно только менторов и только для своего учреждения: должность и учреждение не являются полями формы и не могут быть перенаправлены.')),
      S('name', '[data-tour="account-name"]', '/school/accounts/new',
        L('A person’s name, not a team’s',
          'Numele unei persoane, nu al unei echipe',
          'Имя человека, а не команды'),
        L('Family name and given name. “Echipa digitală” and anything like it is refused — that is exactly the shared login this replaces.',
          'Numele de familie și prenumele. „Echipa digitală” și orice seamănă cu asta este refuzat — tocmai contul comun pe care aceasta îl înlocuiește.',
          'Фамилия и имя. «Echipa digitală» и подобное отклоняется — именно этот общий логин здесь и заменяется.')),
      S('password', '[data-tour="temp-password"]', null,
        L('The password is shown once',
          'Parola se afișează o singură dată',
          'Пароль показывается один раз'),
        L('Write it down or hand it over before you leave this page. It cannot be shown again — only replaced with a new one. Your colleague will be asked to change it the first time they sign in.',
          'Notați-o sau transmiteți-o înainte de a părăsi această pagină. Nu mai poate fi afișată — doar înlocuită cu una nouă. Colegului i se va cere să o schimbe la prima autentificare.',
          'Запишите или передайте до ухода с этой страницы. Показать её снова нельзя — только заменить новой. Коллегу попросят сменить пароль при первом входе.')),
      S('manage', '[data-tour="accounts-table"]', '/school/accounts',
        L('Later: reset a password, or close an account',
          'Ulterior: resetați o parolă sau închideți un cont',
          'Позже: сброс пароля или закрытие записи'),
        L('When a mentor leaves, deactivate them rather than deleting them — their assessments and signatures stay part of the record. You can act on mentors only, not on the other principal or the deputy.',
          'Când un mentor pleacă, dezactivați-l în loc să îl ștergeți — evaluările și semnăturile lui rămân parte din înregistrare. Puteți acționa doar asupra mentorilor, nu și asupra celuilalt director sau a adjunctului.',
          'Когда ментор уходит, деактивируйте, а не удаляйте: его оценки и подписи остаются частью записи. Действовать можно только с менторами, но не с директором или заместителем.')),
    ],
  },

  // ------------------------------------------------------------ assessment
  {
    key: 'assess',
    need: 'view.school',
    title: L('The self-assessment', 'Autoevaluarea', 'Самооценивание'),
    intro: L(
      'Nineteen parameters, four domains, two sides working in parallel.',
      'Nouăsprezece parametri, patru domenii, două părți care lucrează în paralel.',
      'Девятнадцать параметров, четыре области, две стороны работают параллельно.'),
    steps: [
      S('tracks', null, '/school',
        L('Two assessments at the same time',
          'Două evaluări în același timp',
          'Два оценивания одновременно'),
        L('The administration — the principal and the deputy — and the team of mentors assess separately, and neither sees the other’s answers while working. A level both sides reached on their own means something a level agreed in one room does not.',
          'Administrația — directorul și directorul adjunct — și echipa de mentori evaluează separat, iar niciuna dintre părți nu vede răspunsurile celeilalte în timpul lucrului. Un nivel la care ambele părți au ajuns singure înseamnă altceva decât un nivel convenit într-o singură încăpere.',
          'Администрация — директор и заместитель — и команда менторов оценивают раздельно, не видя ответов друг друга во время работы. Уровень, к которому обе стороны пришли самостоятельно, значит не то же самое, что уровень, согласованный в одной комнате.')),
      S('start', '[data-tour="start-cycle"]', '/school',
        L('Open the cycle',
          'Deschideți ciclul',
          'Откройте цикл'),
        L('The principal or the deputy opens it; a mentor cannot. Opening a cycle is the school committing to an assessment period, so it is the administration’s act.',
          'Directorul sau adjunctul îl deschide; un mentor nu poate. Deschiderea unui ciclu înseamnă că instituția își asumă o perioadă de evaluare, deci este actul administrației.',
          'Открывает директор или заместитель; ментор не может. Открытие цикла — это обязательство школы по периоду оценивания, поэтому это действие администрации.'),
        'school.manage'),
      S('steps', '[data-tour="step-nav"]', null,
        L('Six steps, saved independently',
          'Șase pași, salvați independent',
          'Шесть шагов, сохраняются независимо'),
        L('Four domains, the infrastructure data, and the review. Seven people can work over two weeks without blocking each other. The colour tells you what is done: grey nothing yet, blue started, red something required is missing, green complete.',
          'Patru domenii, datele de infrastructură și verificarea finală. Șapte persoane pot lucra timp de două săptămâni fără să se blocheze reciproc. Culoarea vă spune ce este gata: gri — nimic, albastru — început, roșu — lipsește ceva obligatoriu, verde — complet.',
          'Четыре области, данные инфраструктуры и итоговая проверка. Семь человек могут работать две недели, не мешая друг другу. Цвет показывает состояние: серый — ничего, синий — начато, красный — не хватает обязательного, зелёный — готово.')),
      S('rate', '[data-tour="level-picker"]', null,
        L('Choose the level that describes the school today',
          'Alegeți nivelul care descrie instituția de azi',
          'Выберите уровень, описывающий школу сегодня'),
        L('Each of the six levels has its own written description for this exact parameter — read them rather than guessing from the number. Rate where the school is, not where it intends to be; intent belongs in the plan.',
          'Fiecare dintre cele șase niveluri are propria descriere scrisă pentru exact acest parametru — citiți-le, nu ghiciți după cifră. Evaluați unde se află instituția, nu unde intenționează să ajungă; intenția aparține planului.',
          'У каждого из шести уровней есть собственное описание именно для этого параметра — читайте их, а не угадывайте по цифре. Оценивайте, где школа сейчас, а не куда стремится; намерение — в плане.')),
      S('zero', null, null,
        L('Level 0 is an answer',
          'Nivelul 0 este un răspuns',
          'Уровень 0 — это ответ'),
        L('“We have nothing of this kind” is a finding, and the platform treats it as one. What 0 never means is “we have not looked at this yet” — leave a parameter untouched if you have not discussed it.',
          '„Nu avem nimic de acest fel” este o constatare, iar platforma o tratează ca atare. Ce nu înseamnă niciodată 0 este „încă nu am analizat” — lăsați parametrul neatins dacă nu l-ați discutat.',
          '«У нас этого нет» — это вывод, и платформа так к нему и относится. Ноль никогда не означает «мы ещё не смотрели» — если параметр не обсуждали, оставьте его нетронутым.')),
      S('evidence', '[data-tour="evidence"]', null,
        L('From level 2 upward, attach evidence',
          'De la nivelul 2 în sus, atașați dovezi',
          'С уровня 2 и выше прикрепляйте доказательства'),
        L('A document, a link, a named practice — whatever a sceptical reader would need in order to believe the rating. Levels 0 and 1 need none. A rating of 2 or more without evidence turns its step red and will stop the cycle being confirmed.',
          'Un document, un link, o practică denumită — orice i-ar trebui unui cititor sceptic ca să creadă evaluarea. Nivelurile 0 și 1 nu au nevoie de dovezi. O evaluare de 2 sau mai mult fără dovezi face pasul roșu și va împiedica confirmarea ciclului.',
          'Документ, ссылка, названная практика — всё, что нужно скептику, чтобы поверить оценке. Уровням 0 и 1 доказательства не нужны. Оценка 2 и выше без доказательства делает шаг красным и не даст подтвердить цикл.')),
      S('infra', '[data-tour="infra"]', null,
        L('Devices and network are counted, not judged',
          'Dispozitivele și rețeaua se numără, nu se apreciază',
          'Устройства и сеть считают, а не оценивают'),
        L('The device inventory and the network checklist come from Order 675/2024 — Annex 2 and Annex 5. They feed the Ministry’s compliance monitor and do not affect any maturity level.',
          'Inventarul de dispozitive și lista de verificare a rețelei provin din Ordinul 675/2024 — anexele 2 și 5. Ele alimentează monitorul de conformitate al Ministerului și nu influențează niciun nivel de maturitate.',
          'Инвентаризация устройств и чек-лист сети взяты из приказа 675/2024 — приложения 2 и 5. Они питают мониторинг соответствия Министерства и не влияют на уровни зрелости.')),
    ],
  },

  // --------------------------------------------------------- reconciliation
  {
    key: 'reconcile',
    need: 'view.school',
    title: L('Reconciling the two readings', 'Reconcilierea celor două evaluări', 'Согласование двух оценок'),
    intro: L(
      'The conversation the whole method is built around.',
      'Discuția în jurul căreia este construită întreaga metodă.',
      'Разговор, ради которого построен весь метод.'),
    steps: [
      S('open', '[data-tour="reconcile-link"]', null,
        L('Once both sides have finished',
          'După ce ambele părți au terminat',
          'Когда обе стороны закончили'),
        L('The two readings are put side by side. Until then, keep them apart — showing one side the other’s answers early turns an assessment into a negotiation.',
          'Cele două evaluări sunt așezate una lângă alta. Până atunci, țineți-le separate — a arăta unei părți răspunsurile celeilalte prea devreme transformă evaluarea într-o negociere.',
          'Две оценки помещаются рядом. До этого держите их врозь — показать одной стороне ответы другой раньше времени значит превратить оценивание в переговоры.')),
      S('states', '[data-tour="reconcile-table"]', null,
        L('Agree, differ, incomplete, empty',
          'De acord, diferă, incomplet, gol',
          'Совпало, расходится, неполно, пусто'),
        L('The interesting parameter is not the one both sides rated 3. It is the one the administration rated 4 and the team rated 1 — the gap is shown so you can go straight to it.',
          'Parametrul interesant nu este cel pe care ambele părți l-au evaluat cu 3. Este cel pe care administrația l-a evaluat cu 4, iar echipa cu 1 — diferența este afișată, ca să mergeți direct la ea.',
          'Интересен не тот параметр, где обе стороны поставили 3, а тот, где администрация поставила 4, а команда — 1. Разрыв показан, чтобы вы сразу перешли к нему.')),
      S('settle', '[data-tour="reconcile-agreed"]', null,
        L('Record the level you agreed on',
          'Înregistrați nivelul asupra căruia ați convenit',
          'Запишите согласованный уровень'),
        L('After the discussion, the principal or the deputy records it. Mentors see this screen and cannot settle it — the agreement carries a signature, and the audit trail records whose.',
          'După discuție, directorul sau adjunctul îl înregistrează. Mentorii văd acest ecran, dar nu pot stabili nivelul — acordul poartă o semnătură, iar jurnalul de audit înregistrează a cui este.',
          'После обсуждения его записывает директор или заместитель. Менторы видят этот экран, но не решают — у согласия есть подпись, и журнал аудита фиксирует чья.'),
        'school.manage'),
      S('all', '[data-tour="reconcile-summary"]', null,
        L('All nineteen, including the ones you agree on',
          'Toți cei nouăsprezece, inclusiv cei asupra cărora sunteți de acord',
          'Все девятнадцать, включая совпавшие'),
        L('Agreeing is a positive act, not the absence of a disagreement — even where both sides wrote 3, someone records that 3 as the agreed level. Nothing can be left for later: an unreconciled parameter blocks confirmation, and the outstanding codes are listed for you.',
          'Acordul este un act pozitiv, nu absența unui dezacord — chiar și acolo unde ambele părți au scris 3, cineva înregistrează acel 3 ca nivel convenit. Nimic nu poate fi lăsat pe mai târziu: un parametru nereconciliat blochează confirmarea, iar codurile rămase vă sunt enumerate.',
          'Согласие — это действие, а не отсутствие спора: даже там, где обе стороны написали 3, кто-то записывает эту 3 как согласованный уровень. Ничего нельзя отложить: несогласованный параметр блокирует подтверждение, и оставшиеся коды вам перечислят.')),
    ],
  },

  // ----------------------------------------------------- confirm & publish
  {
    key: 'confirm',
    need: 'school.manage',
    title: L('Confirming and publishing', 'Confirmarea și publicarea', 'Подтверждение и публикация'),
    intro: L(
      'Two separate decisions, both the administration’s.',
      'Două decizii separate, ambele ale administrației.',
      'Два разных решения, оба — за администрацией.'),
    steps: [
      S('confirm', '[data-tour="confirm"]', null,
        L('Confirm what the school found',
          'Confirmați ce a constatat instituția',
          'Подтвердите то, что установила школа'),
        L('Two checks run first: every parameter has an agreed level, and every agreed level of 2 or above has evidence. If either fails you are sent back to the place where it is fixed, with the parameters named.',
          'Se fac mai întâi două verificări: fiecare parametru are un nivel convenit, iar fiecare nivel convenit de 2 sau mai mult are dovezi. Dacă una dintre ele nu trece, sunteți trimis înapoi acolo unde se rezolvă, cu parametrii indicați.',
          'Сначала выполняются две проверки: у каждого параметра есть согласованный уровень, и у каждого согласованного уровня 2 и выше есть доказательство. Если что-то не так, вас вернут туда, где это исправляется, с указанием параметров.')),
      S('publish', '[data-tour="publish-assessment"]', null,
        L('Publishing is a different decision',
          'Publicarea este o decizie diferită',
          'Публикация — отдельное решение'),
        L('Confirming settles what the school found. Publishing decides that the general public may read it. The Ministry, the partners and your metamentor see a confirmed assessment either way — this gate is only on the public pages, and you can withdraw again.',
          'Confirmarea stabilește ce a constatat instituția. Publicarea decide că publicul larg o poate citi. Ministerul, partenerii și metamentorul dumneavoastră văd evaluarea confirmată oricum — această restricție se aplică doar paginilor publice, iar retragerea este posibilă.',
          'Подтверждение фиксирует то, что установила школа. Публикация решает, что это может читать широкая публика. Министерство, партнёры и ваш метаментор видят подтверждённое оценивание в любом случае — ограничение касается только публичных страниц, и его можно отменить.'),
        'school.publish'),
      S('after', null, null,
        L('What happens next',
          'Ce urmează',
          'Что дальше'),
        L('A confirmed cycle is what the DigiPlan is built on. You cannot open a plan before confirming, and you do not have to publish in order to plan.',
          'Un ciclu confirmat este baza pe care se construiește DigiPlanul. Nu puteți deschide un plan înainte de confirmare și nu este nevoie să publicați pentru a planifica.',
          'Подтверждённый цикл — основа DigiPlan. Открыть план до подтверждения нельзя, а публиковать ради планирования не требуется.')),
    ],
  },

  // -------------------------------------------------------------- the plan
  {
    key: 'plan',
    need: 'view.school',
    title: L('The DigiPlan', 'DigiPlanul', 'DigiPlan'),
    intro: L(
      'Two years, all nineteen parameters, and the measures underneath them.',
      'Doi ani, toți cei nouăsprezece parametri și măsurile de sub ei.',
      'Два года, все девятнадцать параметров и меры под ними.'),
    steps: [
      S('open', '[data-tour="plan-open"]', null,
        L('Open the plan on the confirmed cycle',
          'Deschideți planul pe ciclul confirmat',
          'Откройте план на подтверждённом цикле'),
        L('It starts from the levels you agreed, so nothing is typed twice. The principal or the deputy opens it.',
          'Pornește de la nivelurile convenite, deci nimic nu se scrie de două ori. Directorul sau adjunctul îl deschide.',
          'Он начинается с согласованных уровней, поэтому ничего не вводится дважды. Открывает директор или заместитель.'),
        'school.manage'),
      S('all', '[data-tour="plan-table"]', null,
        L('All nineteen appear, all set to “maintain”',
          'Apar toți nouăsprezece, toți setați pe „menținere”',
          'Появляются все девятнадцать, все — «поддерживать»'),
        L('The plan is the whole picture, not a shortlist. You choose which parameters to advance; the rest stay as maintaining, which is a real decision — a school holding level 4 while it pushes elsewhere is saying something, and the plan should say it.',
          'Planul este imaginea completă, nu o listă scurtă. Alegeți ce parametri avansează; restul rămân la menținere, ceea ce este o decizie reală — o instituție care păstrează nivelul 4 în timp ce împinge în altă parte spune ceva, iar planul trebuie să o spună.',
          'План — это вся картина, а не короткий список. Вы выбираете, какие параметры продвигать; остальные остаются в режиме поддержания, и это настоящее решение: школа, удерживающая уровень 4, пока развивает другое, что-то этим говорит, и план должен это сказать.')),
      S('target', '[data-tour="param-target"]', null,
        L('Choose the level you are aiming at',
          'Alegeți nivelul spre care țintiți',
          'Выберите уровень, к которому стремитесь'),
        L('For each parameter you develop: the target level in two years, and why. A target at or below where you already stand is not advancing, whatever the button says, and it will be recorded as maintaining.',
          'Pentru fiecare parametru dezvoltat: nivelul-țintă peste doi ani și motivul. O țintă egală sau sub nivelul actual nu înseamnă avansare, indiferent de buton, și va fi înregistrată ca menținere.',
          'Для каждого развиваемого параметра: целевой уровень через два года и обоснование. Цель на уровне текущего или ниже — это не продвижение, что бы ни говорила кнопка, и будет записана как поддержание.'),
        'school.manage'),
      S('requirements', '[data-tour="param-requirements"]', null,
        L('What that level actually requires',
          'Ce presupune de fapt acel nivel',
          'Что на самом деле требует этот уровень'),
        L('Taken from the progression model itself, in general terms. It is not a checklist to tick — it is the description of a school at that level, so the measures underneath can be judged against something.',
          'Preluat din modelul de progresie, în termeni generali. Nu este o listă de bifat — este descrierea unei instituții aflate la acel nivel, ca măsurile de mai jos să poată fi raportate la ceva.',
          'Взято из самой модели прогрессии, в общих чертах. Это не список для галочек, а описание школы на этом уровне, чтобы меры ниже было с чем сопоставить.')),
      S('initiatives', '[data-tour="param-initiatives"]', null,
        L('The measures, with two names on each',
          'Măsurile, cu două nume pe fiecare',
          'Меры, у каждой — два имени'),
        L('Who carries it out and who oversees it are usually different people, and a plan that records only one of them cannot be followed up. Add a deadline and keep the status current — anyone on the team can write these.',
          'Cine o realizează și cine o supraveghează sunt de obicei persoane diferite, iar un plan care înregistrează doar una dintre ele nu poate fi urmărit. Adăugați un termen și țineți starea la zi — oricine din echipă poate scrie aici.',
          'Кто выполняет и кто контролирует — обычно разные люди, а план, где записан только один, невозможно отследить. Добавьте срок и поддерживайте статус — писать может любой член команды.')),
      S('kpis', '[data-tour="param-kpis"]', null,
        L('How you will know it worked',
          'Cum veți ști că a funcționat',
          'Как вы поймёте, что получилось'),
        L('A measure and a target, in your own words — “teachers trained”, “80%”, “twice per term”. The result goes in later, at report time. Free text on purpose: forcing a number would either lose what you mean or invent precision you do not have.',
          'O măsură și o țintă, în propriile cuvinte — „cadre formate”, „80%”, „de două ori pe semestru”. Rezultatul se completează mai târziu, la raportare. Text liber în mod intenționat: impunerea unei cifre ar pierde sensul sau ar inventa o precizie inexistentă.',
          'Показатель и цель — своими словами: «обучено педагогов», «80%», «дважды в семестр». Результат вносится позже, при отчёте. Свободный текст намеренно: требование числа либо потеряет смысл, либо придумает точность, которой нет.')),
      S('details', '[data-tour="plan-details"]', null,
        L('Period, funding, approval, consultation',
          'Perioadă, finanțare, aprobare, consultare',
          'Период, финансирование, утверждение, консультации'),
        L('The plan’s own particulars. The start date is what the report deadlines are counted from, so it is worth setting.',
          'Datele proprii ale planului. Data de început este cea de la care se calculează termenele de raportare, deci merită completată.',
          'Собственные реквизиты плана. От даты начала считаются сроки отчётов, поэтому её стоит указать.'),
        'school.manage'),
      S('publish', '[data-tour="plan-publish"]', null,
        L('Publish the plan',
          'Publicați planul',
          'Опубликуйте план'),
        L('The plan document is the formal version — the one that goes to the Ministry, the founder and the school’s own council.',
          'Documentul planului este versiunea formală — cea care merge la Minister, la fondator și la consiliul instituției.',
          'Документ плана — это официальная версия: та, что идёт в Министерство, учредителю и в совет школы.'),
        'school.publish'),
    ],
  },

  // ------------------------------------------------------------- reporting
  {
    key: 'report',
    need: 'view.school',
    title: L('Reporting on the plan', 'Raportarea asupra planului', 'Отчётность по плану'),
    intro: L(
      'After a year, and again at the end. Nothing is entered twice.',
      'După un an și încă o dată la final. Nimic nu se introduce de două ori.',
      'Через год и снова в конце. Ничего не вводится дважды.'),
    steps: [
      S('open', '[data-tour="plan-report-link"]', null,
        L('The report is built from the plan',
          'Raportul se construiește din plan',
          'Отчёт строится из плана'),
        L('Every initiative and every measure already in the plan appears here with its target beside it. You may write the report before it is due — a report nobody can prepare is worse than one prepared early.',
          'Fiecare inițiativă și fiecare măsură din plan apare aici, cu ținta alături. Puteți scrie raportul înainte de termen — un raport pe care nimeni nu îl poate pregăti este mai rău decât unul pregătit din timp.',
          'Каждая инициатива и каждый показатель из плана появляются здесь вместе с целью. Отчёт можно писать досрочно — отчёт, который никто не может подготовить, хуже подготовленного заранее.')),
      S('actual', '[data-tour="report-actual"]', null,
        L('Record what was actually reached',
          'Înregistrați ce s-a atins efectiv',
          'Запишите, что фактически достигнуто'),
        L('Next to the target the school set. Anyone on the team can record a result; it is the work of the year being written down, not a judgement.',
          'Alături de ținta stabilită de instituție. Oricine din echipă poate înregistra un rezultat; este munca anului pusă pe hârtie, nu o judecată.',
          'Рядом с целью, поставленной школой. Записать результат может любой член команды: это фиксация работы за год, а не оценка.')),
      S('blank', '[data-tour="report-progress"]', null,
        L('A blank means nobody has said',
          'Un câmp gol înseamnă că nimeni nu a spus',
          'Пустое поле означает, что никто не сказал'),
        L('The report never decides whether a target was met — “all teachers” against “62%” is a judgement, and software guessing would be confidently wrong in front of the Ministry. It puts the two side by side and counts what has been recorded. An empty result is a gap in the reporting, not a failed initiative.',
          'Raportul nu decide niciodată dacă o țintă a fost atinsă — „toate cadrele didactice” față de „62%” este o judecată, iar un program care ar ghici ar greși cu aplomb în fața Ministerului. Așază cele două alături și numără ce a fost înregistrat. Un rezultat gol este o lipsă în raportare, nu o inițiativă eșuată.',
          'Отчёт никогда не решает, достигнута ли цель: «все педагоги» против «62%» — это суждение, и программа, угадывая, уверенно ошиблась бы перед Министерством. Она ставит их рядом и считает записанное. Пустой результат — пробел в отчётности, а не провал инициативы.')),
      S('narrative', '[data-tour="report-narrative"]', null,
        L('What the numbers do not say',
          'Ce nu spun cifrele',
          'Чего не говорят цифры'),
        L('What worked, what did not, and what changes for the year ahead. Written by the principal or the deputy, because this is the school speaking rather than a total.',
          'Ce a funcționat, ce nu și ce se schimbă pentru anul următor. Scris de director sau de adjunct, pentru că aici vorbește instituția, nu un total.',
          'Что сработало, что нет и что меняется на следующий год. Пишет директор или заместитель, потому что здесь говорит школа, а не сумма.'),
        'school.manage'),
      S('publish', '[data-tour="report-publish"]', null,
        L('Publishing freezes a copy',
          'Publicarea îngheață o copie',
          'Публикация замораживает копию'),
        L('Implementation carries on afterwards. A report that kept reading the live plan would quietly rewrite itself, and a year-one report would end up describing year two. The published document shows the plan as it was; this page shows it as it is today.',
          'Implementarea continuă după aceea. Un raport care ar citi în continuare planul viu s-ar rescrie singur, iar raportul primului an ar ajunge să descrie al doilea an. Documentul publicat arată planul așa cum era; această pagină îl arată așa cum este astăzi.',
          'Реализация продолжается и после. Отчёт, читающий живой план, тихо переписывал бы сам себя, и отчёт за первый год описывал бы второй. Опубликованный документ показывает план таким, каким он был; эта страница — каким он является сегодня.'),
        'school.publish'),
    ],
  },

  // ---------------------------------------------------------- public pages
  {
    key: 'public',
    need: null,
    title: L('The public pages', 'Paginile publice', 'Публичные страницы'),
    intro: L(
      'What a parent, a journalist or a founder sees.',
      'Ce vede un părinte, un jurnalist sau un fondator.',
      'Что видит родитель, журналист или учредитель.'),
    steps: [
      S('list', '[data-tour="public-list"]', '/public-view/schools',
        L('No account needed',
          'Fără cont',
          'Учётная запись не нужна'),
        L('Anyone can read this, in any of the three languages. Only what a school has deliberately published appears here.',
          'Oricine poate citi aceste pagini, în oricare dintre cele trei limbi. Aici apare doar ceea ce o instituție a publicat în mod deliberat.',
          'Это может читать кто угодно на любом из трёх языков. Здесь появляется только то, что школа опубликовала намеренно.')),
      S('states', null, null,
        L('Assessed but not published is said as such',
          '„Evaluată, dar nepublicată” se spune ca atare',
          '«Оценено, но не опубликовано» так и написано'),
        L('A school that has finished an assessment and not published it is described that way, and distinguished from a school that has not assessed at all. Telling a reader the second when the first is true would be a misrepresentation.',
          'O instituție care a finalizat o evaluare și nu a publicat-o este descrisă ca atare, distinct de o instituție care nu a evaluat deloc. A-i spune cititorului a doua variantă când adevărată este prima ar fi o denaturare.',
          'Школа, завершившая оценивание и не опубликовавшая его, описывается именно так — в отличие от школы, которая вообще не оценивалась. Сказать читателю второе, когда верно первое, было бы искажением.')),
    ],
  },
];

const LANGS = ['en', 'ro', 'ru'];

/** Picks one language out of an {en, ro, ru} string, falling back to English. */
function pick(entry, lang) {
  if (!entry) return '';
  return entry[lang] || entry.en;
}

function needsMet(need, has) {
  if (!need) return true;
  const list = Array.isArray(need) ? need : [need];
  return list.some((c) => has(c));
}

/**
 * The tutorial as this person should see it: in their language, and without
 * the chapters and steps their position cannot reach.
 *
 * @param {string} lang
 * @param {(capability: string) => boolean} has  capability *or* `ctx.*` flag
 * @returns {{key, title, intro, steps: Array}[]}
 */
function buildTour(lang, has) {
  if (!tourApplies(has)) return [];
  return CHAPTERS
    .filter((c) => needsMet(c.need, has))
    .map((c) => ({
      key: c.key,
      title: pick(c.title, lang),
      intro: pick(c.intro, lang),
      steps: c.steps
        .filter((s) => needsMet(s.need, has))
        .map((s) => ({
          key: `${c.key}.${s.key}`,
          title: pick(s.title, lang),
          body: pick(s.body, lang),
          target: s.target,
          goto: s.goto,
        })),
    }))
    // A chapter every one of whose steps was filtered out is not a chapter.
    .filter((c) => c.steps.length > 0);
}

/** Every `data-tour` name the tutorial expects to find in the views. */
function allTargets() {
  const out = new Set();
  CHAPTERS.forEach((c) => c.steps.forEach((s) => {
    if (s.target) out.add(s.target);
  }));
  return [...out];
}

module.exports = { CHAPTERS, LANGS, AUDIENCE, tourApplies, buildTour, allTargets, pick };
