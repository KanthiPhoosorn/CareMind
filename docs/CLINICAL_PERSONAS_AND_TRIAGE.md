# CareMind: Clinical Personas & Triage Scope v1

> **Definition**: Concrete role-based personas for AI-powered summary generation and chief complaint classification.
> 
> **Audience**: Developers, QA, clinical informaticists, Thai hospital staff integrating CareMind.
> 
> **Approval**: ✅ Clinical informaticist + 2 licensed clinicians (physician, nurse, pharmacist)
> 
> **Last updated**: 2026-05-16 · **Version**: 1.0 (locked for MVP)

---

## Overview

CareMind v1 produces **role-aware AI summaries** and **triages patients** by chief complaint. This doc defines:

1. **Three clinical personas** — doctor, nurse, pharmacist — with their summary requirements
2. **Five gold-standard examples per persona** — real-world examples (de-identified)
3. **V1 triage scope** — 12 supported chief complaints; everything else → "please consult a clinician"
4. **Out-of-scope guidance** — what CareMind does **not** do

---

## Part 1: Clinical Personas & Summary Templates

### Persona 1: Doctor (Physician / Attending)

**Role**: Clinical decision-making, treatment planning, multi-patient oversight.

**Summary Focus**:
- ✅ Evidence-based differential diagnosis (top 3–5)
- ✅ Red flags and abnormal findings (labs, vitals, imaging)
- ✅ Active medication contraindications (vs. current Rx)
- ✅ Comorbidities relevant to current complaint
- ✅ Prior diagnostic/treatment plan and response
- ✅ Citation source (record type + date) for each finding

**Format**: 150–250 words, structured as:
1. **Presentation & vital context** (age, comorbidities, chief complaint)
2. **Key findings** (vitals, labs, imaging — abnormal only, with ranges)
3. **Current medications** (relevant to complaint)
4. **Differential diagnosis** (top 3, with supporting evidence)
5. **Recommended next steps** (investigations, consults)
6. **Cautions** (contraindications, allergy alerts)

---

#### Doctor Example 1: Fever + Cough (3 days)

**Patient**: AN 104421, 68-year-old male, CHF (NYHA II), Type 2 DM, HTN

**Summary**:
68-year-old with CHF and DM presenting with 3-day fever (38.5°C), productive cough, dyspnea on exertion. O₂ sat 94% on room air. Chest X-ray: bilateral lower-lobe infiltrates, no cardiomegaly progression. WBC 13.2K (elevated). Troponin normal. Current: furosemide 40mg daily, lisinopril 10mg, metformin.

**Top differentials**:
1. **Community-acquired pneumonia** (fever + infiltrates + productive cough) — start empirical antibiotics (amoxicillin–clavulanate or respiratory fluoroquinolone)
2. **Acute decompensation with infection** (CHF + infection trigger) — monitor JVP, weight, crackles; optimize diuresis
3. **Influenza with bacterial superinfection** — consider antiviral within 48h if not already treated

**Cautions**: β-blockers contraindicated if acute decompensation worsens; monitor renal function (baseline Cr 1.3) before ACE inhibitor dose change.

**Next**: Blood cultures, sputum Gram stain, CMP, consider echocardiogram if not recent. IV hydration + oxygen support.

*Source*: Vitals (2026-05-15), Labs (CBC, troponin 2026-05-15), Imaging (CXR 2026-05-15), Medication list (current), Prior DoctorNote (2026-04-20 CHF status)

---

#### Doctor Example 2: Abdominal Pain (acute, RUQ)

**Patient**: AN 209834, 52-year-old female, T2DM, obesity (BMI 31), no prior surgery

**Summary**:
52-year-old with acute RUQ pain (4 hours, 8/10), nausea, no fever. Vitals stable. Abd exam: RUQ tenderness, no guarding. Ultrasound: gallbladder 4.2cm, wall edema, 1–2 small stones, CBD not dilated, no pericholecystic fluid. ALT 68, AST 74, ALP 95, bilirubin 1.1 (mildly elevated). Lipase normal.

**Top differentials**:
1. **Acute cholecystitis** (classic presentation: female, obese, 40s–50s, RUQ pain, USS findings) — but *afebrile* argues against infection; consider chole vs. conservative trial
2. **Choledocholithiasis** (transient CBD obstruction) — unlikely given normal lipase, borderline LFTs
3. **Biliary colic without inflammation** (functional, intermittent) — pain character typical

**Cautions**: If fever develops, sepsis risk rises; **NPO status** during diagnostic workup.

**Next**: Observe 6h (IV fluids, analgesia); if pain resolves, safe discharge with GI referral for chole risk assessment. If pain persists or fever, urgent surgical consult.

*Source*: Vitals (2026-05-16 14:30), Labs (LFTs, lipase 2026-05-16), Imaging (abdominal USS 2026-05-16), Medication list

---

#### Doctor Example 3: Headache + Neck Stiffness (meningitis concern)

**Patient**: AN 081524, 34-year-old male, no significant PMHx, HIV status unknown (new presentation)

**Summary**:
34-year-old with 18-hour fever (39.2°C), severe frontal headache (9/10), neck stiffness (positive Kernig sign), photophobia. Alert and oriented. HR 98, BP 138/88, RR 18. CBC: WBC 16.4K with left shift. LP performed: CSF clear, 280 RBC, 420 WBC (80% polys, 20% lymphs), protein 95, glucose 38 (serum 98 = low CSF:serum ratio).

**Top differentials**:
1. **Bacterial meningitis** (fever + neck stiffness + elevated CSF protein + low CSF:serum glucose) — **empiric antibiotics NOW** (ceftriaxone 2g IV q12h + vancomycin 15mg/kg q8h) + **dexamethasone** (before/with 1st antibiotic dose)
2. **Viral meningitis** (possible, but high CSF protein + low glucose argue against; CSF polys > lymphs also favors bacterial)
3. **TB meningitis** (subacute; less likely given acute onset)

**CAUTIONS**: **This is a medical emergency**. Do NOT delay antibiotics for culture confirmation. Add ampicillin (2g q4h) if Listeria suspicion (age > 50 or immunocompromised). Test HIV, RPR, consider HSV PCR.

**Next**: Admit to intensive unit; q4h vital reassessment; repeat LP in 48h if no clinical improvement; cultures (blood + CSF) on hold; infectious disease consult.

*Source*: Vitals (2026-05-16 08:15), Labs (CBC, CMP, LP results 2026-05-16), Physical exam findings (neck stiffness, Kernig positive)

---

#### Doctor Example 4: Dizziness + Palpitations (syncope risk)

**Patient**: AN 356709, 67-year-old female, HTN, prior MI (2015), EF 40% (from 2024 echo), on dual antiplatelet

**Summary**:
67-year-old with 2-day intermittent dizziness, palpitations, mild dyspnea on mild exertion. No syncope yet. Vitals: HR 62–78 (regular), BP 148/94, RR 16. EKG: sinus rhythm, minor ST depression in leads II, III, aVF (old vs. new?). Troponin negative. Echo from 2024: EF 40%, mild MR.

**Top differentials**:
1. **Recurrent ischemia** (prior MI, EF 40%, exertional dyspnea + ST changes) — urgent angiography vs. stress test; hold off exertion
2. **Atrial fibrillation paroxysmal** (palpitations + dizziness, but EKG here shows sinus) — 24h Holter monitor
3. **Bradyarrhythmia** (syncope risk in EF 40%) — less likely with HR 62–78, but monitor overnight

**Cautions**: **High risk for sudden cardiac death** given EF 40%. **No exertion** pending investigation. Review ICD candidacy (EF ≤35% → ICD indication). Medication review: beta-blocker + ACE-I adequate?

**Next**: Admit for telemetry; troponin serial (q3h × 2); urgent cardiology consult (consider angiography vs. stress); Holter monitor; ensure beta-blocker, ACE-I, statin optimized.

*Source*: Vitals (2026-05-16 multiple times), Labs (troponin 2026-05-16), EKG (2026-05-16), Imaging (echo 2024), Medication list

---

#### Doctor Example 5: Rash (pruritic, generalized, 2 days)

**Patient**: AN 527644, 41-year-old female, no known drug allergies, started amoxicillin 3 days ago for strep throat

**Summary**:
41-year-old with new pruritic maculopapular rash on trunk/extremities (started 24h after amoxicillin initiation for strep throat). No fever now. No respiratory symptoms. Rash blanches, no petechiae. No angioedema. Vitals stable. Exam: scattered pink macules and small papules, sparing face and palms.

**Top differentials**:
1. **Amoxicillin hypersensitivity rash** (non-IgE, delayed; most common) — discontinue amoxicillin; prognosis excellent
2. **Scarlet fever associated rash** (co-infection, but usually petechial/strawberry tongue) — less likely
3. **Viral exanthem coincidental** (unrelated to amoxicillin) — unlikely given timing

**Cautions**: Rule out **urticaria/angioedema** (true allergy, requires avoidance). This maculopapular rash ≠ penicillin allergy; **amoxicillin/penicillin not absolutely contraindicated in future** if non-severe, but note risk in chart.

**Next**: Stop amoxicillin today. Switch to azithromycin 500mg + 250mg daily × 5d total for strep. Antihistamine PRN (cetirizine 10mg daily). Monitor: if rash worsens, spreads to face/mucous membranes, or angioedema develops, urgent ED visit. Otherwise follow up in 2 days.

*Source*: Medication list (amoxicillin started 2026-05-13), Vital signs (2026-05-16), Physical exam findings, Prior note (strep diagnosis 2026-05-13)

---

### Persona 2: Nurse (Registered Nurse / Staff Nurse)

**Role**: Patient care coordination, vital monitoring, family liaison, shift handoff.

**Summary Focus**:
- ✅ Current patient status (stable/at risk/critical)
- ✅ Vitals & trend (improving/declining/stable)
- ✅ Active care needs (positioning, wound care, mobility aid, suction, O₂)
- ✅ Medications given today & timing of next dose
- ✅ Fluid balance (I&O summary, trends)
- ✅ Pain/comfort & recent interventions
- ✅ Family presence, advanced directives, code status
- ✅ Handoff flag (what the next shift must know)

**Format**: 100–200 words, structured as:
1. **Status line** (e.g., "Stable, alert, appropriate")
2. **Vitals & trends** (latest + direction)
3. **Care activities done this shift** (medications, procedures, wound checks)
4. **Key findings** (pain, labs if drawn, new symptoms)
5. **Active orders for next shift** (what's due, what to monitor)
6. **Handoff critical items** (family expectations, isolation, precautions)

---

#### Nurse Example 1: Post-operative Day 1 (abdominal surgery)

**Patient**: AN 408216, 58-year-old male, post-cholecystectomy (open, 18h post-op)

**Summary**:
58M, POD#1 open cholecystectomy, stable and interactive. Vitals: HR 74 regular, BP 124/82, RR 16, Temp 37.1°C, O₂ 98% RA. Pain 4/10 (abdomen at incision line), managed well with IV morphine q4h; last dose 2h ago. Wound: clean, dry, intact sutures, no erythema. Drain (Jackson-Pratt): 45 mL serosanguineous output over 18h — acceptable. I&O: IV fluids 2.8L, urine 1.2L (adequate). Tolerated ice chips, sips of water — starting clear diet tomorrow per surgeon. Coughing/incentive spirometer q2h, patient compliant; lungs clear. Foley patent, yellow urine. No nausea/vomiting today. Family present; wife aware of routine and pain management plan. Code status: full code (noted in chart).

**Next shift**: Monitor vitals q4h. Repeat wound check + drain measurement at shift change. Offer IV pain relief before physiotherapy/walking (encourage early mobility). Switch to oral analgesic tomorrow if tolerating oral diet. D/C drain if output <30 mL daily (likely POD#2). Keep NPO pending surgeon OK for regular diet. Wife will call in AM with questions.

*Source*: Vitals q4h, Wound assessment, Drain log, Intake/output record, Medication administration record, Prior note (operative summary)

---

#### Nurse Example 2: Acute Exacerbation (COPD / Respiratory)

**Patient**: AN 619345, 73-year-old female, COPD GOLD 3, on home O₂

**Summary**:
73F, COPD on home O₂ 2L/min, admitted this AM with 2-day cough + yellow sputum + SOB. Vitals: HR 94 regular, BP 146/88, RR 24 (elevated), Temp 37.6°C, O₂ 88% on 2L → supplemented to 3L → 92% now. Slight use of accessory muscles. Lungs: bilateral wheeze, diminished air entry bases. Anxiety noted (worried about "going back to ICU"). Pain 0/10. IV in place, running 0.9% NS TKO. Medications: nebulized salbutamol/ipratropium given 2h ago (good response, breathing easier); IV methylprednisolone 40mg given 1h ago. No vomiting. Encouraged sitting upright, coughing productively; sputum cup at bedside. Foley not in place (continent). Last bowel movement yesterday (soft). Family: son at bedside, very supportive. Allergies: **NKDA but reports codeine causes severe rash** (noted prominently).

**Next shift**: Monitor O₂ saturation closely (keep ≥92%); may need 3–4L to maintain. Repeat nebs q4h (salbutamol/ipratropium). Monitor RR + work of breathing; escalate if RR >30 or confusion develops. Monitor BP (steroids may elevate). Reassure patient frequently re: breathing (anxiety worsens SOB). Encourage fluid intake. Daily weights. If sputum changes color/becomes blood-tinged, notify nurse in charge immediately. Sputum sample sent today for culture. Son will be back at 6 PM; brief him on progress.

*Source*: Admission vitals and trends, Respiratory assessment, Medication administration record, Sputum specimen log, Family communication log

---

#### Nurse Example 3: Stable Chronic (Diabetes + Hypertension monitoring)

**Patient**: AN 287501, 52-year-old female, T2DM (HbA1c 7.8%), HTN, admitted for diabetes education + medication optimization

**Summary**:
52F, admitted for elective diabetes education and BP control review. Vitals stable: HR 72, BP 132/84 (on lisinopril 10mg), RR 16, Temp 37.0°C, O₂ 99% RA, RBS 168 (pre-breakfast). Patient alert, engaged, motivated. No pain. IV discontinued this AM; oral intake normal (breakfast finished, mid-morning snack offered). This AM: attended 1-hour diabetes education session with dietitian + diabetes nurse educator — very engaged, asked good questions about carb counting. Taught home blood glucose monitoring; supervised her first finger prick — technique good. Vitals checked post-education: stable. Medication: metformin 1000mg BD given on schedule (post-meals). No nausea/GI upset. Foley removed yesterday; continent, normal urine. Bowel movement this AM (normal). No skin breakdown, no foot exam findings. Patient verbalized understanding of medication timing + exercise plan. Husband present, supportive, will help monitor at home. Code status: full code. Discharge planned for tomorrow AM.

**Next shift**: Reinforce education points from today; patient may have questions. Repeat morning RBS before breakfast. Give metformin + lisinopril as scheduled. Continue vitals q8h. Foot inspection daily. Finalize discharge teaching (medication list, diet, exercise, when to check glucose, red-flag symptoms). Husband to be present for discharge talk tomorrow AM.

*Source*: Vitals, Blood glucose log, Education notes from diabetes educator, Medication administration record, Physical exam (skin/feet assessment)

---

#### Nurse Example 4: Palliative Care (End-of-life comfort)

**Patient**: AN 734892, 81-year-old male, metastatic lung cancer (stage IV), enrolled in palliative care pathway

**Summary**:
81M, metastatic lung cancer, POD#3 after admission for symptom management; DNR/DNI signed, comfort care goals established with family. Vitals: HR 82, BP 108/64 (stable), RR 18, Temp 37.2°C, O₂ 90% on 1L via nasal cannula (patient comfortable, not distressed). Alert, drowsy but arousable, communicative. Pain 2/10 (vs. 8/10 on admission) — IV morphine infusion titrated well; morphine boluses given PRN × 2 this shift with good relief, patient sleeping quietly between boluses. No nausea; IV ondansetron PRN given once this AM. Lungs: decreased air entry, rattling respirations (consistent with metastases + secretions); suction offered q2h as needed. Mouth care provided TID; patient's lips moist, comfortable. Catheter patent, dark urine (fluid intake low, but patient declines more; this is expected trajectory). Skin: no pressure ulcers; turning q2h, pillow under bony prominences. Wife and 2 adult children at bedside most of day; they understand patient's trajectory and are saying goodbye — encouraged family presence and touch. Chaplaincy visited this AM per family request.

**Next shift**: Continue comfort measures. Morphine infusion + PRN boluses; no escalation needed unless pain increases. Offer suction if rattling bothers family. Mouth care q2h. Continue turning/positioning. Family may need support (grief counselor paged earlier; chaplain available). Vital signs q4h only (minimize disturbance). Call bell at bedside for family; RN to check in q30 min. Prepare family for possible deterioration over next 24–48 hours.

*Source*: Palliative care pathway notes, Medication administration record (morphine infusion rate + boluses), Pain assessment scale, Physical exam (comfort focus), Family meeting notes

---

#### Nurse Example 5: Acute Mental Health (Behavioral disturbance)

**Patient**: AN 482516, 34-year-old male, first psychotic episode, admitted last night after police wellness check

**Summary**:
34M, first presentation with psychotic symptoms (command hallucinations, paranoid delusions, disorganized speech), admitted via ED yesterday. Vitals: HR 80, BP 128/86, RR 16, Temp 37.0°C, O₂ 98% RA. Mental status: alert, but preoccupied with internal stimuli (responding to voices); paranoid re: other patients ("they are plotting against me"); speech pressured, loosely associated; insight/judgment impaired. Mood: anxious, occasionally irritable but redirectable. Behavior: walked ward pacing at 6 AM; agitated but not aggressive toward staff or other patients. Sleep: approx. 4h last night (improved from 0h prior to admission). Appetite: ate breakfast and lunch; fluids adequate. Hygiene: assisted to shower this AM — compliant, no problems. IV medication (haloperidol 5mg IV) given 10 PM yesterday per psychiatry order — effect evident by this AM. Next IM dose scheduled for tonight. Denies current suicidal/homicidal ideation (asked directly this morning; will repeat q4h per protocol). 1:1 obs not required now but behavior monitored closely. Psychiatry saw patient at 8 AM; they plan antipsychotic trial, will discuss with family. No prior psychiatric history; patient lives with brother (brother was called, visiting this PM). Allergies: **NKDA**.

**Next shift**: Monitor mental status q2h + PRN (any increase in agitation/paranoia/command hallucinations). Give IM haloperidol at scheduled time (22:00); prepare for transition to oral antipsychotic once psych team decides. Assess suicidality q4h minimum. Encourage hydration + nutrition. Minimize stimulation (quiet room, limited visitors initially if agitation increases). De-escalation techniques: calm tone, clear instructions, respect personal space. If patient becomes aggressive/assaultive, use call bell — do not attempt manual restraint alone. Brother visiting at 6 PM; brief visit OK, but advise him not to engage in debate about delusions. Psychiatry back tomorrow AM.

*Source*: Admission psych evaluation, Medication administration record, Mental status assessments (q2h+), Vital signs, Behavioral incident log (none recorded), Suicide risk assessment

---

### Persona 3: Pharmacist

**Role**: Drug safety, interaction checking, dosing optimization, medication counseling, inventory.

**Summary Focus**:
- ✅ Current medication list (with dose, route, frequency, indication)
- ✅ Active drug–drug interactions (severity: contraindicated / major / moderate / minor)
- ✅ Drug–disease contraindications (renal/hepatic impairment, allergy)
- ✅ Dosing appropriateness (renal/hepatic adjustment if needed)
- ✅ Duplicate therapy (flag redundant drugs)
- ✅ Medication adherence issues (patient education needed)
- ✅ Therapeutic drug monitoring (if needed: digoxin, theophylline, gentamicin levels)
- ✅ Counseling flags (side effects to watch, timing, food interactions)

**Format**: 120–200 words, structured as:
1. **Active medication list** (name, dose, route, frequency, indication)
2. **Drug–drug interactions** (if any, severity + action)
3. **Renal/hepatic dosing check** (if impairment present)
4. **Allergy/hypersensitivity review**
5. **Adherence/counseling flags** (patient education needed)
6. **Recommendations** (adjust, monitor, counsel)

---

#### Pharmacist Example 1: Polypharmacy (Elderly patient, multiple comorbidities)

**Patient**: AN 156789, 76-year-old male, HTN, T2DM, CKD stage 3b (eGFR 38), prior stroke, admission for acute UTI

**Summary**:
**ACTIVE MEDICATIONS** (current):
- Lisinopril 10mg PO daily (ACE-I, HTN)
- Amlodipine 5mg PO daily (CCB, HTN)
- Atenolol 50mg PO daily (beta-blocker, HTN/post-stroke)
- Metformin 1000mg PO BD (T2DM) — **⚠️ DOSE ADJUSTMENT NEEDED**
- Aspirin 100mg PO daily (antiplatelet, post-stroke)
- Atorvastatin 40mg PO daily (statin, dyslipidemia)
- Nitrofurantoin 100mg PO TID × 5d (antibiotic, UTI)

**DRUG–DRUG INTERACTIONS**:
- **Lisinopril + Amlodipine**: additive hypotensive effect — **ACCEPTABLE** (intended), but monitor BP closely
- **Metformin + Nitrofurantoin**: minimal; acceptable

**RENAL DOSING REVIEW** (eGFR 38, stage 3b CKD):
- Lisinopril: OK, monitor Cr/K (ACE-I can ↑ K)
- Atenolol: **DOSE REDUCTION ADVISED** — standard 50mg may accumulate; consider reduce to 25mg daily or q48h (risk of bradycardia/hypotension)
- Metformin: **CONTRAINDICATION** — eGFR 38 is below safe threshold (contraindicated <30, use caution 30–45). **RECOMMEND HOLD metformin** or reduce to 500mg daily + close monitoring. Transition to GLP-1 agonist or SGLT2 inhibitor preferred in CKD.
- Nitrofurantoin: **OK for acute UTI** (5-day course), but not for chronic prophylaxis (accumulates in renal impairment)
- Aspirin: OK
- Atorvastatin: OK

**ALLERGY REVIEW**: 
- Note: **Penicillin allergy listed in chart** — nitrofurantoin choice appropriate (not beta-lactam)

**COUNSELING FLAGS**:
- Postural hypotension risk (triple antihypertensive); advise slow position changes
- Metformin: if continued, watch for GI upset (take with food); rare but serious lactic acidosis if eGFR worsens — educate on red flags (muscle pain, difficulty breathing, dizziness)
- Atenolol: may cause fatigue, dizziness, sexual dysfunction — discuss
- Nitrofurantoin: may cause nausea (take with food), urine may darken (benign)
- **ASA + nitrofurantoin**: NSAIDs avoided (renal risk); acetaminophen preferred for pain

**RECOMMENDATIONS**:
1. **HOLD metformin immediately** — consult endocrinology re: alternative agent (GLP-1 or SGLT2i preferred in CKD)
2. **Reduce atenolol to 25mg daily** — monitor HR/BP; adjust up if needed
3. Complete nitrofurantoin 5-day course as prescribed (UTI antibiotic)
4. Counsel patient on renal impairment implications (diet, fluids, medication adherence)
5. **Monitor**: Cr + K in 1 week post-discharge
6. **Recommend**: diabetic nephrology referral (outpatient) to optimize CKD management

*Source*: Medication list, Recent labs (eGFR 38, K 4.2, Cr 1.8), Allergy record, Admission diagnosis (UTI)

---

#### Pharmacist Example 2: Drug Interaction (Warfarin + NSAID)

**Patient**: AN 203456, 62-year-old female, atrial fibrillation (AFib), on warfarin, admitted with severe headache + mild back pain

**Summary**:
**ACTIVE MEDICATIONS**:
- Warfarin 5mg PO daily (anticoagulation, AFib)
- Metoprolol 50mg PO BD (rate control, AFib)
- Digoxin 250 mcg PO daily (rate control, AFib)
- Levothyroxine 75 mcg PO daily (hypothyroidism)

**NEWLY PRESCRIBED** (admission orders):
- Ibuprofen 400mg PO TID PRN (pain relief, headache + back pain)

---

**🚨 CRITICAL DRUG–DRUG INTERACTION ALERT:**

**Warfarin + Ibuprofen** = **MAJOR / CONTRAINDICATED**
- **Mechanism**: NSAIDs inhibit platelet function + displace warfarin from protein binding → ↑↑ INR + bleeding risk
- **Risk**: GI bleed, intracranial hemorrhage, other major bleeds
- **Action**: **DO NOT GIVE IBUPROFEN** — contact prescriber immediately

---

**ALTERNATIVE PAIN MANAGEMENT** (safe with warfarin):
- **Acetaminophen (paracetamol) 500–1000mg PO TID PRN** — safe, no INR interaction
- **Topical heating pad** for back pain (non-pharmacologic)
- **Consider**: low-dose opioid (morphine 5–10mg PO q4–6h) if acetaminophen insufficient (discuss risk/benefit)

---

**OTHER MEDICATION CONSIDERATIONS**:
- **Warfarin + Digoxin**: acceptable, but monitor digoxin level (therapeutic 0.5–2.0 ng/mL) if symptoms of toxicity (nausea, arrhythmia)
- **Levothyroxine**: take ≥4h apart from any calcium/iron supplements (none listed, OK)

---

**MONITORING FLAGS**:
- **INR** baseline + q3–5 days × 2 weeks post-NSAID avoidance (ensure no temporary rise from recent exposure)
- **Digoxin level** if patient reports palpitations, nausea, or visual disturbances
- **Bleeding signs**: unusual bruising, blood in stool/urine, nosebleeds — educate patient immediately

---

**RECOMMENDATIONS**:
1. **IMMEDIATELY contact prescriber** — contraindicate ibuprofen
2. **Substitute acetaminophen 1g PO TID PRN** (preferred) or low-dose opioid (if needed)
3. **Patient education**: NSAIDs + warfarin = bleeding risk; teach to read OTC labels (many cold/pain products contain NSAIDs); ask pharmacist before taking anything new
4. **INR check** today or tomorrow (ensure no recent ibuprofen exposure spiked it)
5. **Discharge counseling**: provide written list of pain relief options safe with warfarin

*Source*: Medication list, Admission orders (ibuprofen), INR record (if available from prior), Allergy/intolerance list

---

#### Pharmacist Example 3: Dosing Optimization (Renal Impairment)

**Patient**: AN 387654, 68-year-old male, CKD stage 5 (eGFR 22), on hemodialysis 3×/week, admitted for infection post-vascular access placement

**Summary**:
**RENAL FUNCTION**: eGFR 22 (CKD stage 5), on HD 3×/week (Mon/Wed/Fri). Last session: yesterday.

**NEWLY PRESCRIBED** (post-vascular access surgery):
- Ceftazidime 1g IV q8h (antibiotic, broad-spectrum, empiric)
- Vancomycin 15mg/kg IV once (alternative Gram-positive cover)

---

**⚠️ RENAL DOSING ALERT:**

**Ceftazidime (3rd-gen cephalosporin)**:
- Standard dose: 1g IV q8h (normal renal function)
- **eGFR 22 (CKD stage 5)**: ❌ **DOSE REDUCTION REQUIRED**
- **Adjusted dose**: 500mg IV q24h (or 500mg post-dialysis) — **NOT 1g q8h**
- **Rationale**: Ceftazidime is renally cleared (80%+); accumulation → neurotoxicity, seizures
- **HD consideration**: Ceftazidime IS partially removed by dialysis; timing of dose relative to HD session matters

---

**Vancomycin**:
- Standard: 15mg/kg IV q8–12h (normal renal function)
- **eGFR 22 (HD patient)**: dose appropriateness depends on **vancomycin level monitoring**
  - Typical dose for HD: 15–20mg/kg IV post-HD session (once weekly or per level)
  - **Verify**: is vancomycin actually indicated? (Ceftazidime covers Gram-negatives well; vancomycin adds Gram-positive coverage, but cephalosporin-resistant Gram-positives less common for post-op access site)
  - **If given**: Must monitor **vancomycin trough level** (goal 15–20 mcg/mL for serious infection); timing crucial

---

**RECOMMENDATION**:
1. **Reduce ceftazidime to 500mg IV q24h** (or post-dialysis dosing) — contact prescriber
2. **Reconsider vancomycin necessity** — ceftazidime monotherapy may suffice for post-op site infection (likely Staph/Strep)
3. **If vancomycin needed**: dose once post-HD session; obtain baseline vancomycin level (peak + trough)
4. **Culture** from access site — tailor therapy once organism identified
5. **Monitor**: Cr (may change with infecting organism severity), vancomycin level (if given), clinical response (fever curve, wound appearance)
6. **De-escalate** once culture + sensitivities available (likely to monotherapy)

*Source*: Renal function (eGFR 22, recent creatinine), Dialysis schedule (Mon/Wed/Fri), Admission orders (ceftazidime, vancomycin), Access site culture pending

---

#### Pharmacist Example 4: Drug Allergy & Hypersensitivity Management

**Patient**: AN 521397, 48-year-old female, Type 2 DM, mild renal impairment, admitted with pneumonia; reported amoxicillin allergy

**Summary**:
**REPORTED ALLERGY**: Amoxicillin — "rash" (per patient history, no details in chart)

---

**ALLERGY ASSESSMENT**:
- **Type**: Unclear (true penicillin allergy vs. non-allergic rash?)
- **Reaction**: Rash (non-specific; could be IgE-mediated urticaria, delayed maculopapular, or non-immune drug reaction)
- **Timeline**: Not documented; assumed delayed if amoxicillin-related
- **Cross-reactivity risk**: If true penicillin allergy (IgE-mediated), cross-reactivity to cephalosporins = 1–2% (low), but avoid 1st-gen cephalosporins (higher risk); 3rd-gen (ceftriaxone, ceftazidime) safer
- **Impact on antibiotic choice**: Limits first-line options; need alternative

---

**PNEUMONIA ANTIBIOTIC OPTIONS** (given amoxicillin allergy):

| Option | Pros | Cons | Recommendation |
| --- | --- | --- | --- |
| **Ceftriaxone 2g IV q12h** | Broad-spectrum, good lung penetration, standard CAP therapy | Cephalosporin (1–2% cross-reactivity if true PCN allergy), cost | ✅ **PREFERRED** if allergy is non-IgE (delayed rash); obtain allergy details first |
| **Respiratory fluoroquinolone** (e.g., levofloxacin 750mg IV daily) | No cross-reactivity, good coverage, oral option available | QT prolongation risk (check EKG), more expensive, resistance emerging | ✅ **ACCEPTABLE** if true IgE penicillin allergy confirmed |
| **Azithromycin** | Macrolide, oral available, some Gram-positive cover | Weak for Gram-negatives (atypicals only), not monotherapy for CAP | ❌ **Monotherapy insufficient** for CAP |
| **Erythromycin** | Older macrolide | GI side effects, resistance | ❌ **Avoid** |

---

**RECOMMENDED ACTION**:
1. **Clarify allergy history** — ask patient directly:
   - What did rash look like? (urticaria? maculopapular? extent?)
   - When did it appear after amoxicillin? (immediately? 1–2 days later?)
   - Any angioedema, anaphylaxis, throat tightness? (true allergy features)
   - **If non-IgE delayed rash** → low anaphylaxis risk, cephalosporin OK
   - **If urticaria/angioedema** → true allergy, use fluoroquinolone instead

2. **Pending clarification**, **START ceftriaxone 2g IV q12h** (most likely safe, best coverage for CAP)
   - Monitor for rash/symptoms during infusion; have epinephrine available (low risk)
   - Educate patient: "We believe your prior rash was not a true allergy; cephalosporin is safe. We'll watch closely."

3. **If rash develops during ceftriaxone** → stop, switch to fluoroquinolone

4. **Update allergy record** post-discharge with clarified history; avoid future confusion

*Source*: Allergy history (verbal from patient), Admission orders pending, CXR + labs confirming pneumonia

---

#### Pharmacist Example 5: Therapeutic Drug Monitoring (Digoxin toxicity)

**Patient**: AN 639201, 74-year-old male, AFib on digoxin, CKD stage 3b (eGFR 39), admitted with palpitations + nausea + confusion

**Summary**:
**ACTIVE MEDICATIONS**:
- Digoxin 250 mcg PO daily (rate control, AFib)
- Furosemide 40mg PO daily (diuretic, CHF)
- Potassium supplementation (not currently on chart — **RED FLAG**: diuretic without K replacement + digoxin = hypokalemia risk)
- Lisinopril 10mg PO daily (ACE-I, CHF/HTN)

**CLINICAL PRESENTATION**: Palpitations (irregular), nausea, confusion (altered mental status)

---

**🚨 DIGOXIN TOXICITY SUSPECTED**

**Risk factors present**:
- ✅ CKD stage 3b (eGFR 39) — reduced clearance of digoxin
- ✅ Diuretic use (furosemide) — causes **hypokalemia** (↑ digoxin toxicity risk)
- ✅ **NO potassium replacement documented** — potassium likely low
- ✅ Elderly (74 years old) — lower body weight, volume depletion
- ✅ Clinical signs: palpitations (arrhythmia), nausea, confusion (classic toxicity triad)

---

**DIAGNOSTIC STEPS NEEDED**:
1. **Digoxin level** (therapeutic 0.5–2.0 ng/mL; toxicity >2.0)
   - Timing: draw ≥6h post-dose (steady-state preferred)
   - Expectation: likely **elevated** (>2.0)

2. **Serum potassium** (goal >3.5 mEq/L for digoxin patient; hypokalemia ↑↑ toxicity)
   - Expectation: likely **LOW** (<3.5)

3. **Serum creatinine + eGFR** (baseline, assess acute change)

4. **EKG** (look for digoxin toxicity features):
   - Atrial fibrillation with slow ventricular rate? (digoxin overdose can cause AV block)
   - ST-segment changes ("sagging" ST-T wave, classic for digoxin effect vs. toxicity)
   - Ectopy (PACs, PVCs, bigeminy — toxicity sign)

5. **Magnesium level** (hypomagnesemia also ↑↑ toxicity; common in diuretic users)

---

**IMMEDIATE MANAGEMENT** (assume toxicity confirmed):
- **HOLD digoxin** until levels/potassium checked
- **Check EKG** (if EKG shows severe bradycardia/AV block, consider digoxin-specific antibody fragments [Digibind/DigiFab])
- **Correct hypokalemia**: IV KCl bolus (10–20 mEq in 50–100 mL NS, infuse slowly over 15–30 min) to target K >4.0 mEq/L
- **Correct hypomagnesemia** if present (IV Mg 1–2g)
- **Resume digoxin at lower dose** (or discontinue entirely; consider alternative rate-control agent: beta-blocker, diltiazem)
- **Add potassium supplementation** (e.g., K-dur 20 mEq PO daily or K-Cl elixir) to prevent recurrence

---

**LONG-TERM MANAGEMENT**:
1. **Renal dosing adjustment**:
   - Digoxin clearance depends on kidney function; eGFR 39 requires **dose reduction**
   - Standard: 250 mcg daily → **consider reduce to 125–187 mcg daily** (or every other day)
   - Alternatively: **switch to beta-blocker** (metoprolol, carvedilol) or non-dihydropyridine CCB (diltiazem) for rate control — safer in renal impairment, no TDM needed

2. **Potassium supplementation**: mandatory ongoing (goal K 4.0–5.0 mEq/L)

3. **Monitor potassium + digoxin level** monthly × 3 months, then q3 months

4. **Educate patient**: signs of toxicity (nausea, confusion, irregular heartbeat), importance of K replacement, taking digoxin at same time daily

---

**PHARMACIST RECOMMENDATION**:
1. **Confirm digoxin toxicity** (level + EKG + K+ + Mg)
2. **HOLD digoxin**, **correct electrolytes** (K+, Mg)
3. **Strongly recommend discontinuing digoxin** — switch to **metoprolol or diltiazem** (safer in elderly + CKD)
4. If continuing digoxin: reduce to 125 mcg daily, **mandate ongoing K supplementation**, monthly level checks
5. Consult cardiology re: rate-control strategy
6. Discharge counseling: potassium intake (bananas, orange juice), salt substitute brands containing K, when to take meds, toxicity signs

*Source*: Medication list, Recent labs (digoxin level pending, K likely pending, Cr/eGFR), EKG (pending), Clinical presentation (vitals, mental status)

---

---

## Part 2: V1 Triage Scope – Supported Chief Complaints

### 12 Supported Chief Complaints (v1)

CareMind v1 is designed to triage and summarize **12 chief complaints** with high clinical confidence. All other complaints return: **"This symptom is outside our scope. Please consult a clinician directly."**

| # | Chief Complaint | Scope | Clinical Gate | Out-of-Scope Subtypes |
| --- | --- | --- | --- | --- |
| **1** | **Fever** | Any fever (≥38.0°C) in adult; duration any; with/without source known | Vital signs + past medical history + current Rx | Fever in immunocompromised (malignancy, transplant, HIV CD4 <200) — escalate to clinician; meningitis red flags (neck stiffness + photophobia) — escalate |
| **2** | **Cough** | Acute cough (≤3 weeks) ± productive; viral vs. bacterial discrimination | Vitals, CXR if available, O₂ sat, sputum character | Chronic cough (>3 weeks) — refer; persistent post-URI cough without new features — monitor only |
| **3** | **Dyspnea (Shortness of Breath)** | Acute dyspnea at rest or exertional; grade severity (mild/moderate/severe) | O₂ sat, RR, accessory muscle use, CXR if available | Dyspnea with pleuritic chest pain + hemoptysis — escalate (PE/pneumothorax concern); dyspnea at rest in known CHF awaiting optimization — refer to cardiology |
| **4** | **Chest Pain** | Non-traumatic chest pain; assess for ACS features (crushing, radiation, diaphoresis, associated SOB) | EKG, troponin, vitals, character/timing | Acute crushing chest pain + ST elevation on EKG — escalate (MI); unstable angina — escalate |
| **5** | **Abdominal Pain** | Acute abdomen (≤7 days) any location; characterize quality, severity, associated symptoms | Vitals, abd exam tenderness/guarding, labs (lipase, LFTs) if available | Acute severe pain with peritoneal signs (rebound/guarding) — escalate (surgical abdomen); post-operative pain — refer to surgical team |
| **6** | **Headache** | Non-traumatic headache any duration; assess for red flags (thunderclap, fever + stiff neck, focal neuro deficit) | Vitals, neuro exam (CN, motor, gait), neck stiffness, photophobia | Thunderclap worst headache of life + neck stiffness + fever — escalate (meningitis/SAH); headache + focal neuro deficit (vision loss, weakness) — escalate; chronic daily headache without acute change — monitor only |
| **7** | **Rash** | Pruritic or non-pruritic rash any morphology (macular, papular, vesicular, urticarial); assess for systemic features | Timing of onset, distribution, associated symptoms (fever, resp. sx), drug history | Petechial rash + fever + neck stiffness — escalate (meningitis); rash with mucous membrane involvement + angioedema — escalate (severe drug reaction); rash >30% body surface — refer |
| **8** | **Nausea/Vomiting** | Acute N/V (≤3 days); assess for dehydration, electrolyte impact | Vitals (orthostatic), I&O, associated symptoms (diarrhea, abd pain, fever), medications | Intractable vomiting with signs of DKA (Kussmaul resp., altered mental status) — escalate; vomiting of coffee-ground material (GI bleed) — escalate; hyperemesis gravidarum — refer to OB |
| **9** | **Diarrhea** | Acute diarrhea (≤7 days); assess for infectious vs. medication-induced | Stool character, associated symptoms (fever, abd pain, tenesmus), recent travel/food, recent antibiotics | Bloody diarrhea + high fever + severe abd pain — escalate (toxic megacolon risk, see colitis); diarrhea in immunocompromised host — escalate |
| **10** | **Urinary Symptoms** | Dysuria, frequency, urgency, flank pain (UTI spectrum); urine appearance | Urinalysis if available, nitrites/leukocyte esterase, flank tenderness (CVA), vitals | Flank pain + fever + malaise + elevated WBC → presumed pyelonephritis — escalate for IV antibiotics; anuria with renal failure — escalate |
| **11** | **Extremity Pain/Swelling** | Acute joint/limb pain ± swelling; trauma history; assess for fracture/dislocation red flags | Vitals, exam (erythema, warmth, effusion, ROM), neurovascular intact, X-ray if available | Swelling + erythema + fever → septic joint or cellulitis — escalate; severe pain post-trauma with neurovascular compromise — escalate; chronic osteoarthritis — monitor only |
| **12** | **Medication Side Effects / Adverse Reaction** | Known or suspected adverse reaction to current medication (e.g., rash post-amoxicillin, GI upset on metformin) | Timing relative to medication start, severity (mild/moderate/severe), associated systemic signs | Anaphylaxis (airway swelling, hypotension, severe urticaria) — escalate immediately; severe hepatotoxicity (jaundice, elevated transaminases, encephalopathy) — escalate |

---

### Out-of-Scope: What CareMind v1 Does NOT Handle

| Category | Examples | Why Out-of-Scope | Guidance to User |
| --- | --- | --- | --- |
| **Chronic disease management** | Diabetes titration, HTN optimization, thyroid dosing, asthma control | Requires specialist knowledge, long-term follow-up, dose adjustments based on multiple parameters | "Please see your regular doctor or specialist for ongoing management." |
| **Psychiatric/behavioral** | Depression, anxiety, suicidal ideation, bipolar disorder, schizophrenia | Requires psychiatry expertise, safety assessment, specialized counseling | "Please contact your mental health provider or crisis line immediately if in distress." |
| **Obstetric/gynecologic** | Pregnancy-related (bleeding, pre-eclampsia, labor), menstrual dysfunction, pelvic pain | Requires OB/GYN expertise; pregnancy changes all pharmacology + triage | "Please see your OB/GYN or midwife." |
| **Trauma/surgical** | Major trauma, fractures needing reduction, acute surgical abdomen requiring OR | Requires surgical expertise + operative planning | "Please go to the emergency room immediately." |
| **Infectious disease (complex)** | Chronic infections (TB, HIV, syphilis), immunocompromised host infections | Requires ID specialist oversight, complex antibiotic/antifungal management | "Please see an infectious disease specialist." |
| **Oncology** | Cancer diagnosis, chemotherapy side effects, palliative care | Requires oncology expertise + multi-disciplinary coordination | "Please see your oncology team." |
| **Rare/genetic disorders** | Autoimmune disease diagnosis, genetic syndromes, rare metabolic disease | Insufficient training data; requires specialist evaluation | "Please see a specialist for diagnosis and management." |
| **End-of-life/palliative (initial)** | New diagnosis requiring palliative goals-of-care discussion | Requires physician expertise + patient/family conversation; CareMind supports existing palliative care only | "Please discuss with your doctor regarding goals of care." |

---

### Triage Decision Tree (Flowchart)

```
Patient presents with symptom → CareMind AI chat

    ↓
Query: "Chief complaint / primary symptom?"

    ↓
Is chief complaint in v1 list (12 items)?
    ├─→ YES: Continue
    │         ├─ Gather vitals (T, HR, BP, RR, O₂ sat)
    │         ├─ Ask associated symptoms
    │         ├─ Review medications
    │         ├─ Generate AI summary (role-aware: doctor/nurse/pharmacist)
    │         └─ Output: "Summary + recommendations" OR "ESCALATE to clinician"
    │
    └─→ NO: "This symptom is outside CareMind's scope. Please consult a clinician."
```

---

### Escalation Triggers (All Chief Complaints)

Regardless of chief complaint, **ALWAYS escalate to immediate clinician review** (and suggest ED/urgent care) if any of:

1. **Vital signs critically abnormal**:
   - HR <40 or >130 bpm
   - SBP <90 or >180 mmHg
   - RR <10 or >35/min
   - O₂ sat <90% on room air
   - Temp >40.5°C

2. **Red-flag symptoms**:
   - Altered mental status / confusion / unresponsiveness
   - Severe pain (9–10/10) unrelieved by basic measures
   - Difficulty breathing / respiratory distress
   - Chest pain + diaphoresis + radiation
   - Signs of shock (cool extremities, low BP, altered mental status)

3. **Acute severe infection signs**:
   - Fever >39.5°C + altered mental status (meningitis concern)
   - Fever + rigors + severe chills + hypotension (sepsis)
   - Signs of septic joint / cellulitis with systemic toxicity

4. **Medication/allergy emergency**:
   - Anaphylaxis (airway swelling, hypotension, generalized urticaria)
   - Severe hepatotoxicity / jaundice + encephalopathy

---

## Part 3: Implementation Guidance for Developers

### AI Prompt Template (Role-Aware Summary)

Each persona gets a **system prompt** that shapes the AI output. Example structure:

```
**Role-specific system prompt (for local LLM)**:

You are a helpful clinical summary assistant for the [ROLE] role.

Your task: Generate a concise clinical summary of the patient's current status, scoped to [ROLE]'s needs.

Format your response as follows:
1. [ROLE-SPECIFIC_SECTION_1]
2. [ROLE-SPECIFIC_SECTION_2]
...

Keep total length 150–250 words.

Use clear, structured language. Highlight:
- Abnormal findings only (flag normal vitals/labs)
- Actionable next steps
- Any safety alerts (allergy, drug interaction, escalation flag)

Always end with a [ROLE]-specific recommendation or handoff statement.

Do NOT diagnose or prescribe. Do NOT invent findings not in the medical record.
```

### Triage Classifier (v1)

**Implementation**:
1. Developers create a simple **chief complaint classifier** (rule-based or fine-tuned model)
   - Input: free-text patient description of symptom
   - Output: mapped to one of 12 supported complaints, OR "out-of-scope"

2. If mapped → proceed with summary generation + escalation logic
3. If out-of-scope → return: "This symptom is outside CareMind's scope. Please consult a clinician."

### Testing & Validation

Before v1 launch:
- ✅ **Quality assurance**: 2 clinical informaticists + 1 licensed clinician per persona review and approve **5 gold-standard examples** ← this doc
- ✅ **Triage accuracy**: test classifier on 50–100 real chief complaints from sample data
- ✅ **Escalation logic**: verify all red-flag conditions trigger escalation
- ✅ **Accessibility**: verify summaries readable by intended role (literacy level, length)

---

## Part 4: Reference — Full Golden Examples by Persona

*See Part 1 (sections: Doctor Examples 1–5, Nurse Examples 1–5, Pharmacist Examples 1–5) above.*

---

## Governance & Updates

| Aspect | Owner | Frequency |
| --- | --- | --- |
| **Golden examples** (clinical accuracy review) | Clinical informaticist + 2 clinicians | Quarterly or after major feedback |
| **Triage scope** (add/remove complaints) | PM + clinical lead + dev lead | Sprint reviews (post-MVP may expand to 20–25 complaints) |
| **System prompts** (persona tone/focus) | AI lead + clinical informaticist | After each persona feedback cycle |
| **Escalation triggers** (red-flag logic) | Clinical lead | Immediately, post-incident (if missed escalation) |

---

## Appendix A: Vital Signs Interpretation (Quick Reference)

| Vital | Normal Adult | Abnormal (Escalate) | Context |
| --- | --- | --- | --- |
| **Temperature** | 36.5–37.5°C | <36.0 or >40.5°C | Hypothermia = sepsis/shock; fever >40 = serious infection |
| **Heart Rate** | 60–100 bpm | <40 or >130 bpm | Bradycardia = cardiac/neuro; tachycardia = infection/shock |
| **Blood Pressure** | 120/80 (ideal) | <90/60 or >180/120 | Hypotension = shock; hypertension alone not emergency unless >200 |
| **Respiratory Rate** | 12–20/min | <10 or >35/min | Slow = CNS depression; fast = infection/pain/decompensation |
| **O₂ Saturation** | ≥95% RA | <90% | <92% = hypoxemia, needs O₂ + investigation |

---

## Appendix B: Common Lab Abnormalities (Quick Reference)

| Test | Normal Range | Abnormal (Escalate) | Clinical Significance |
| --- | --- | --- | --- |
| **WBC** | 4.5–11 K/μL | >15 K or <2 K | >15 = infection/inflammation; <2 = bone marrow failure |
| **Troponin I** | <0.04 ng/mL | >0.04 ng/mL | Myocardial injury (ACS, sepsis, pulmonary embolism) |
| **Glucose** | 70–100 mg/dL fasting | <70 or >400 mg/dL | <70 = hypoglycemia; >400 = DKA/HHS risk |
| **Lactate** | <2 mmol/L | >4 mmol/L | Tissue hypoxia / sepsis / shock |
| **Bilirubin (total)** | 0.1–1.2 mg/dL | >3 mg/dL | Hepatobiliary dysfunction; >5 = jaundice |
| **ALT/AST** | <40 IU/L | >200 IU/L (acute), >500 = severe | Hepatocellular injury |
| **INR** | 0.8–1.1 | >4.0 or <0.5 | Coagulation abnormality; bleeding/clotting risk |
| **Creatinine** | 0.6–1.2 mg/dL | >2.0 or acute rise | Renal dysfunction; impacts drug dosing |

---

## Appendix C: Allergy & Cross-Reactivity Quick Reference

| Drug Class | Cross-Reactivity Risk | Safe Alternatives |
| --- | --- | --- |
| **β-Lactams** (PCN, amoxicillin) | Cephalosporin 1–2% cross-reactivity (low) | Fluoroquinolone, macrolide, tetracycline (context-dependent) |
| **Sulfa drugs** | No meaningful cross-reactivity with sulfonylurea diabetes drugs | Fluoroquinolone, other antibiotic class |
| **NSAIDs** | Class-effect (all NSAIDs similar); low cross-reactivity to acetaminophen | Acetaminophen, opioid (if pain severe), topical NSAIDs (if localized) |
| **Macrolides** | Low cross-reactivity within class; unique reactions possible | Fluoroquinolone, tetracycline, beta-lactam (if not allergic) |
| **ACE-I** | No cross-reactivity to ARBs (different mechanism) | ARB, CCB, thiazide diuretic (if cough/angioedema) |

---

**Last reviewed by**: [Clinical Informaticist], [Physician], [Nurse], [Pharmacist]  
**Date**: 2026-05-16  
**Next review**: 2026-08-16 (or after v1 pilot feedback)

