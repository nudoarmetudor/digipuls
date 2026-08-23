// Reference data for the MDSF Self-Assessment Instrument (Annex A v2/v3).
// Source: MDSF vault, 05_MDSF_Instrument/Annex A - MDSF Self-Assessment
// Instrument v2 (integrated six-level model).md and Annex A v3 (quantitative
// benchmarks).md. This is fixed reference content — seeded once, not edited
// by end users of the app.
//
// Level names are constant across all indicators:
//   0 Below floor | 1 Accidental | 2 Initial coordination |
//   3 Process redesign | 4 Seamless embedding | 5 Continuous innovation

const LEVEL_NAMES = [
  'Below floor',
  'Accidental',
  'Initial coordination',
  'Process redesign',
  'Seamless embedding',
  'Continuous innovation',
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
  A: 'Leadership, Governance and Change Management',
  B: 'Teaching, Learning and Assessment',
  C: 'Human Capacity and Digital Competence',
  D: 'Infrastructure, Platforms and Digital Ecosystem',
};

const INDICATORS = [
  // ---------------- DOMAIN A ----------------
  {
    code: 'A1', domain: 'A', name: 'Participatory strategic planning',
    description: 'Well-defined goals and action plans based on a critical assessment of the school’s current state, aligned with the national digital-transformation strategy.',
    levels: levels([
      'No digital development plan exists in any form — not even a pro forma document.',
      'A plan exists, but only because superiors required it; no impact on resource or operational management; staff, students and parents are unaware of it.',
      'Plan co-developed by leadership and some teachers; ≥20% of teaching staff aware of and contributing to it.',
      'Detailed strategic and action plan with input from many teachers, students and parents; ≥50% of staff aware and regularly contributing; plan drives equipment, budget and hiring decisions.',
      'Systematic, well-known strategic-planning framework supported by digital tools; participatory, data-grounded decisions are the norm.',
      'School has developed an original strategic-planning framework, used by other schools; it runs regional planning workshops.',
    ], [
      {}, {},
      { engagement: '≥20% of staff (floor: 2), aware and contributing', frequency: '≥1 consultation meeting/year', evidence: 'Attendance list' },
      { engagement: '≥50% (floor: 4), ≥2 subject departments', frequency: '≥1 pedagogical-council session/year + ≥1 digital-team meeting/term', evidence: 'Minutes + plan excerpt' },
      { engagement: 'Majority + ≥1 parents’-council + ≥1 student-government session/year', frequency: 'Plan reviewed ≥2×/year', evidence: 'Before/after plan comparison' },
      { engagement: '≥1 other school trained', frequency: '≥1 regional workshop hosted/year', evidence: 'External confirmation' },
    ]),
  },
  {
    code: 'A2', domain: 'A', name: 'Data-informed decision making',
    description: 'Strategic and operational decisions are based on systematic data collection and analysis.',
    levels: levels([
      'No data of any kind, qualitative or quantitative, is collected to inform decisions — not even informally.',
      'Some data exists but is not used; decisions are made ad hoc, case by case.',
      'Leadership promotes data-based decisions for differentiation, personalised support, resource and incident management.',
      'Leadership systematically develops and reviews data-support systems and processes.',
      'Majority of teachers involved regularly; this is the school-wide norm.',
      'School developed or adopted an original data-decision framework and digital tool; it is a regional/national reference point.',
    ]),
  },
  {
    code: 'A3', domain: 'A', name: 'Learning organisation and knowledge sharing',
    description: 'Collecting and sharing best practice; analysing experience and incidents to revise plans and routines.',
    levels: levels([
      'No practice exists anywhere in the school that could be called knowledge sharing — teachers work in full isolation.',
      'Isolated sharing happens only by accident; no systematic collection or sharing of best practice.',
      'Innovative teachers occasionally self-organise workshops or presentations; some sharing via the school site or blogs.',
      'Leadership takes the lead, organises monthly experience exchanges tied to the development plan; documented and periodically summarised.',
      'School functions as a learning organisation — continuous evidence-based development, systematic data collection by many teachers using digital tools.',
      'School is a regional/sectoral leader; it initiates and manages development networks, regularly hosting conferences, fairs and exhibitions.',
    ]),
  },
  {
    code: 'A4', domain: 'A', name: 'Monitoring and evaluation',
    description: 'Use of metrics, data-collection tools and the action plan to regularly analyse and monitor digital-transformation progress.',
    levels: levels([
      'No monitoring of digital-transformation progress happens at all, including no state-required minimum reporting.',
      'Data collected only as much/rarely as required by the state; analysed only for formal reporting, with no resulting decisions or plan changes.',
      'Regular evidence-based self-analysis by leadership and teachers begins.',
      'Data shared with the school community (with data-protection compliance); leadership analyses thoroughly, results feed self-evaluation.',
      'Leadership uses datasets to plan and predict development, combining qualitative and quantitative analysis; results are externally validated.',
      'Collected datasets are used in research by teachers, departments or students; results are publicly available.',
    ]),
  },
  {
    code: 'A5', domain: 'A', name: 'Leadership support and motivation',
    description: 'Leadership’s active support and motivation of staff implementing digital innovation.',
    levels: levels([
      'Leadership is actively unaware of or indifferent to whether any digital-innovation activity happens at all.',
      'Leadership pays no special attention to digital-innovation initiatives; it is not a priority, but is not actively obstructed either.',
      'Leadership encourages teachers, supports pioneers with praise and public recognition.',
      'Leadership introduces initial motivation and support measures — financial reward, training, conference trips, project support, equipment.',
      'Leadership is accountable, organises cross-party cooperation to disseminate innovative ideas and ensure wide adoption.',
      'School/working groups lead support-measure development regionally or nationally, systematically disseminating documented experience.',
    ]),
  },

  // ---------------- DOMAIN B ----------------
  {
    code: 'B1', domain: 'B', name: 'Integrated STEAM / interdisciplinary project-based learning',
    description: 'Pedagogical change toward creative, collaborative, cross-disciplinary, real-world-problem-based learning.',
    levels: levels([
      'No interdisciplinary or project-based teaching occurs anywhere in the school.',
      'Traditional teaching is dominant; innovative projects are rare, uncoordinated, and not shared between teachers.',
      'Leadership is informed and coordinates the sharing of experience.',
      'Interdisciplinary, project-based teaching becomes a regular practice for a substantial share of staff.',
      'This has become “the new normal” for almost all teachers.',
      'School is a regional model, hosting conferences and workshops for other schools.',
    ]),
  },
  {
    code: 'B2', domain: 'B', name: 'Changing teacher and student roles',
    description: 'Shift toward a collegial culture: co-planning, cross-discipline integration, peer lesson observation and feedback, team teaching; students contributing to planning and materials.',
    levels: levels([
      'Teaching is fully individual and siloed — no instance of co-planning, peer observation, or student contribution to teaching design exists.',
      'Collaboration between teachers is rare, random, uncoordinated.',
      'A growing minority engage in collaborative teaching activities.',
      'Peer observation and feedback become regular, leadership-coordinated practice; students are trusted to contribute to resource design.',
      'Majority of teachers, same pattern, leadership-coordinated school-wide.',
      'School is a model; teachers team-plan innovative scenarios; students co-design learning experiences and resources.',
    ]),
  },
  {
    code: 'B3', domain: 'B', name: 'Learner-centred assessment',
    description: 'Formative, diagnostic and summative assessment centred on the learner; personalised feedback; self- and peer-assessment.',
    levels: levels([
      'Assessment is exclusively traditional (summative-only, teacher-graded) with no instance of formative, self- or peer-assessment.',
      'New learner-centred methods used rarely or randomly, not promoted by leadership.',
      'Sometimes promoted or coordinated by leadership.',
      'Methods are systematically promoted and coordinated as core practice, used across most units.',
      'Methods are dominant and widely accepted school-wide, embedded in grading policy and rubrics.',
      'School leads regional assessment reform, hosting an expert group helping other schools change their practice or policy.',
    ]),
  },
  {
    code: 'B4', domain: 'B', name: 'Structural changes in curriculum, scheduling, and learning spaces',
    description: 'Systemic, permanent changes to curriculum, scheduling, and learning-space design inspired by new pedagogies (blended learning, project days, outdoor learning, repurposed spaces).',
    levels: levels([
      'Curriculum, scheduling and learning spaces are fully fixed/traditional, with no instance of deliberate restructuring for digital pedagogy.',
      'Fairly traditional curriculum, scheduling and spaces; changes not promoted or monitored.',
      'Leadership-promoted experimentation begins.',
      'Leadership promotes, monitors and organises sharing of experience.',
      'Systematic implementation of multiple structural changes; majority accept this as the new normal.',
      'School hosts regional open days, workshops and conferences to share its structural-change experience.',
    ]),
  },
  {
    code: 'B5', domain: 'B', name: 'Pedagogical use of digital resources and AI tools in teaching and learning',
    description: 'Whether digital tools and AI applications are used to genuinely enhance pedagogy — not merely accessed (Domain D) and not merely a competence the teacher holds (Domain C), but deployed in lesson design, delivery and learner engagement.',
    levels: levels([
      'Digital tools are not used in lesson design or delivery at all (distinct from Domain D’s “tools aren’t available” — here tools may exist but are entirely unused pedagogically).',
      'Digital tools used occasionally, mainly for presentation or projection; no AI tools used in teaching; no coordination of practice.',
      'Leadership aware, informally encourages sharing.',
      'Digital/AI tools integrated into lesson design with a clear pedagogical purpose, not just substitution of analogue tools; basic guidance exists on responsible AI use.',
      'Majority routinely design around digital/AI tools to support differentiation, creativity or higher-order thinking; explicit pedagogical guidelines exist, including academic-integrity safeguards.',
      'School pioneers and documents new pedagogical models for digital/AI-supported teaching, contributing to national guidance.',
    ]),
  },

  // ---------------- DOMAIN C ----------------
  {
    code: 'C1', domain: 'C', name: 'Teachers’ digital competence',
    description: 'Teachers’ ability to meaningfully use digital technology to support innovative pedagogy, aligned with DigCompEdu.',
    levels: levels([
      'Leadership has no information at all about teachers’ digital competence — not even an informal sense of who can or cannot use digital tools.',
      'Leadership has some informal awareness but no reliable overview of teachers’ digital competence levels.',
      'A baseline of certified teachers is established.',
      'Certification reaches half of staff.',
      'Majority certified, using digital technology daily in their work.',
      'School is a training hub, hosting an expert group leading regional competence-development policy and practice.',
    ], [
      {}, {},
      { engagement: '≥20% of teachers (floor: 2) certified at DigCompEdu B2', frequency: 'Register established, updated ≥1×/year', evidence: 'Register extract' },
      { engagement: '≥50% (floor: 4) certified at B2', frequency: 'Register updated ≥1×/term', evidence: 'Update log' },
      { engagement: 'Majority certified at B2', frequency: 'Reviewed alongside PD planning', evidence: 'PD-plan cross-reference' },
      { engagement: 'Trains ≥1 cohort of other schools’ teachers/year', frequency: '≥1 external training/year', evidence: 'External training record' },
    ]),
  },
  {
    code: 'C2', domain: 'C', name: 'Learners’ digital competence',
    description: 'Students’ digital competence, aligned with DigComp 3.0: information and data literacy, communication and collaboration, content creation, safety, problem-solving.',
    levels: levels([
      'No attention at all is paid to student digital competence at school level — not addressed even within Educația digitală.',
      'Left entirely to the mandatory Educația digitală subject and its teacher.',
      'Some subjects beyond Educația digitală begin addressing it, without cross-subject coordination.',
      'Coordinated across half of subjects/grade levels, referencing DigComp 3.0 areas explicitly.',
      'School-wide, coordinated progression across all grade levels and subjects, with safety and responsible-use components embedded.',
      'School’s approach is a regional model, shared via training and materials, and contributes to refining the national DigComp 3.0 adaptation.',
    ]),
  },
  {
    code: 'C3', domain: 'C', name: 'Structured professional development, mentoring and coaching capacity',
    description: 'Whether the school has internal mechanisms — not just access to external training — that sustain digital-competence growth among staff, including DigiProf-B/-C uptake and internal “teacher teaches teacher” practice.',
    levels: levels([
      'No professional development of any kind related to digital competence has occurred at the school — no training, no informal peer support.',
      'Development depends entirely on individual initiative; no internal mentoring or coaching structure.',
      'Informal, occasional peer support exists but is not organised.',
      'An internal mentor group runs regular, documented peer-learning sessions.',
      'A structured internal PD pathway exists, with new staff systematically onboarded.',
      'School’s internal mentors or coaches support other schools’ PD; the school is a recognised PD hub in its region.',
    ]),
  },
  {
    code: 'C4', domain: 'C', name: 'AI literacy and emerging-technology competence',
    description: 'Staff and student understanding of AI systems, their capabilities and limitations, ethical use, and emerging technologies beyond current curricular requirements.',
    levels: levels([
      'No awareness or guidance exists at the school regarding AI or emerging technology — not discussed, not governed, not on anyone’s radar.',
      'Awareness in principle, but nothing has been done; use, if any, is ad hoc and ungoverned.',
      'Isolated awareness sessions or guidance documents exist but are not systematised.',
      'Basic AI-literacy guidance exists for staff and students, with some training delivered.',
      'AI/emerging-technology literacy is integrated into both staff PD and student curriculum delivery in a coordinated way.',
      'School pioneers AI-literacy practice, contributing case studies or guidance used by other schools or by the Ministry.',
    ]),
  },

  // ---------------- DOMAIN D ----------------
  {
    code: 'D1', domain: 'D', name: 'Network and digital security',
    description: 'Network quality and digital security, anchored to Order 675/2024 Annex 5’s mandatory standards as the binding floor.',
    levels: levels([
      'Fails Order 675’s mandatory minimum: whole-school WiFi/LAN coverage, ≥2–3 separated password-protected subnets, 802.11n and 802.11ac, active firewall, content filtering. Cannot be rated 1–5 while non-compliant.',
      'Meets the minimum floor, but coverage and usage are poorly coordinated: subnets may exist on paper, but management is ad hoc and no one tracks incidents.',
      'Leadership has assigned informal responsibility for network management; incidents are handled reactively, not systematically logged.',
      'Usage is monitored, incidents resolved per a documented network policy; access-point placement follows Order 675 Annex 5’s siting guidance.',
      'Modern secure single sign-on and unified user management across systems; regular traffic monitoring; risk-management rules formalised; optional WiFi 6 in place.',
      'School constantly tests and develops the newest network solutions, advises other schools regionally; IT security risk management actively prevents incidents.',
    ]),
  },
  {
    code: 'D2', domain: 'D', name: 'Digital devices',
    description: 'Access to modern digital devices for staff and students, anchored to Order 675/2024 Annexes 1, 2 and 4 as the binding floor.',
    levels: levels([
      'Fails Order 675’s mandatory minimum: device counts below Annex 2’s quota for the enrolment band, or devices fail Annex 1’s spec minimums, or Annex 4 mandatory room equipment is missing. Cannot be rated 1–5 while non-compliant.',
      'Meets the quota and spec minimums; devices are present but used mainly as projection tools, or sit idle outside a few classrooms; no borrowing rules or usage tracking.',
      'School has acquired further classroom devices with borrowing rules; presentation equipment standard across most but not all classrooms.',
      'Device usage is regulated and routine, with demand and queues observed.',
      'Devices interoperate with supplementary room equipment; school has moved into the recommended supplementary-equipment tier for at least one subject area.',
      'School constantly tests new device categories, develops teaching materials for them, advises other schools regionally.',
    ]),
  },
  {
    code: 'D3', domain: 'D', name: 'IT management',
    description: 'Planning, periodic resource and security analysis, and strategic development of the school’s IT function.',
    levels: levels([
      'No one in the school has any responsibility, formal or informal, for IT management — not even a default or accidental owner.',
      'No IT manager; limited IT management capacity; no IT development plan.',
      'School has an IT manager (internal or outsourced) responsible for planning; the development plan includes an IT section used for the annual IT budget.',
      'Deliberate IT-strategy implementation; leadership has a constant infrastructure overview; needs are mapped regularly.',
      'Good IT risk management, monitoring and analysis, with students or employers involved where possible.',
      'School’s IT management is a recognised example for others; experience is actively shared with other schools.',
    ]),
  },
  {
    code: 'D4', domain: 'D', name: 'User support',
    description: 'Quality of IT and educational-technology user support, including staff satisfaction.',
    levels: levels([
      'Staff or students experiencing IT problems have no recourse of any kind — not even informal self-help.',
      'Practically no IT/ed-tech support from leadership; staff and students self-support informally.',
      'Leadership provides a minimal level of IT user support, and teachers are aware of it.',
      'Well-organised IT support, offered by leadership or local administration.',
      'High leadership, teacher and student satisfaction with IT/ed-tech support; feedback regularly collected and services continuously developed.',
      'School developed its own IT/ed-tech user-support service-level standard, shared as an example to other schools.',
    ]),
  },
  {
    code: 'D5', domain: 'D', name: 'Software, digital services, and information systems',
    description: 'Systematic use and development of educational and administrative software, digital services and information systems; movement toward interoperable, cloud-based solutions.',
    levels: levels([
      'No digital administrative service of any kind is in use — no e-journal, no shared drive, no school website.',
      'Only individual administrative digital services in use (e.g., e-journal, cloud drive, school website).',
      'A few additional digital services have been introduced (online learning environments, learning software, library information system).',
      'Staff and students have access to functional e-services and information systems, monitored by the school, with onboarding training and materials.',
      'School operates a convenient, versatile cloud solution or information system combining interoperable e-services; new solutions constantly tested.',
      'School’s integrated digital-services/information-systems solution is a model for other schools, disseminated via training and consultancy.',
    ]),
  },
];

module.exports = { DOMAINS, INDICATORS, LEVEL_NAMES };
