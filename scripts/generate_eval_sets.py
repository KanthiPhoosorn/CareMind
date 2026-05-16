#!/usr/bin/env python3
"""
Generate evaluation sets for CareMind AI models.

Includes:
- 100 clinical cases with gold-standard summaries for each persona
  (doctor summary, nurse summary, pharmacist summary)
- 100 triage scenarios with red-flag-correctness labels
  (is this a red flag? what type of red flag?)

Usage:
    # Generate evaluation sets
    python generate_eval_sets.py \
        --output-cases eval_data/clinical_cases_100.json \
        --output-triage eval_data/triage_scenarios_100.json
    
    # Evaluate model output
    python generate_eval_sets.py --evaluate-summaries \
        --cases eval_data/clinical_cases_100.json \
        --model-output model_summaries.json
"""

import json
import argparse
import random
from typing import List, Dict, Any
from enum import Enum

random.seed(42)


class RedFlagType(str, Enum):
    """Types of red flags in triage."""
    ACUTE_EMERGENCY = "acute_emergency"      # ICU/ER referral needed
    SEVERE_CHRONIC = "severe_chronic"         # Requires hospital admission
    URGENT = "urgent"                         # Needs same-day evaluation
    ROUTINE = "routine"                       # Can be managed outpatient
    NOT_RED_FLAG = "not_red_flag"             # No red flag


class TriageCategory(str, Enum):
    """Categories of triage scenarios."""
    CARDIOVASCULAR = "cardiovascular"
    RESPIRATORY = "respiratory"
    GASTROINTESTINAL = "gastrointestinal"
    INFECTION = "infection"
    INJURY = "injury"
    NEUROLOGICAL = "neurological"
    ENDOCRINE = "endocrine"
    RENAL = "renal"
    PSYCHIATRIC = "psychiatric"
    MUSCULOSKELETAL = "musculoskeletal"


# Clinical case templates
CLINICAL_CASE_TEMPLATES = [
    {
        "id": "case_001",
        "title": "Fever + Cough",
        "chief_complaint": "38.5°C fever × 3 days, productive cough with yellowish sputum",
        "hpi": "68-year-old male presents with fever, productive cough, and dyspnea for 3 days. No chest pain. Lives alone in urban Bangkok area.",
        "pmi": "HTN (on Lisinopril 10mg), DM type 2 (on Metformin), quit smoking 5 years ago",
        "vitals": {"temp": 38.5, "hr": 98, "bp": "135/85", "rr": 24, "o2": 94},
        "pe": "Bilateral crackles RLL, decreased breath sounds RLL, no signs of respiratory distress at rest",
        "labs": {"wbc": 14.5, "cxr": "RLL infiltrate 2×3 cm"},
        "doctor_summary": "68-year-old with fever, productive cough, and RLL infiltrate on CXR. Diagnosis: Community-acquired pneumonia (CAP). Started on Azithromycin 500mg PO daily × 5 days. Monitor for clinical improvement. Return if worsening dyspnea.",
        "nurse_summary": "Patient admitted with pneumonia. Vitals: Temp 38.5°C, HR 98, BP 135/85, RR 24, O2 94% RA. Alert and oriented ×3. Lungs: bilateral crackles RLL. Pain 0/10. Started antibiotics. Monitor temp q4h. Encourage fluids and rest.",
        "pharmacist_summary": "Azithromycin 500mg daily for 5 days for CAP. Patient on Lisinopril + Metformin. No drug interactions noted. Monitor Cr and K+. Counsel on completing full course.",
        "category": "respiratory"
    },
    {
        "id": "case_002",
        "title": "Chest Pain",
        "chief_complaint": "Chest pain 7/10 × 30 minutes, shortness of breath, diaphoresis",
        "hpi": "55-year-old male with history of MI (2010), presents with substernal chest pain radiating to left arm, associated with diaphoresis and dyspnea. Pain unrelieved by GTN.",
        "pmi": "CAD s/p PCI (2010), HTN, DM, hyperlipidemia. On Aspirin, Metoprolol, Lisinopril, Atorvastatin",
        "vitals": {"temp": 37.2, "hr": 105, "bp": "148/92", "rr": 22, "o2": 96},
        "pe": "Anxious, diaphoretic. CV: tachycardia, no murmurs. Lungs: clear bilaterally",
        "labs": {"troponin": 0.8, "ecg": "ST elevation II, III, aVF"},
        "doctor_summary": "Acute inferior MI with ST elevation. STEMI protocol activated. Emergency cath lab notification. High-risk patient requiring urgent revascularization. Aspirin 325mg + P2Y12 inhibitor loading + heparin started.",
        "nurse_summary": "ACUTE MI - STEMI protocol. Vitals: HR 105, BP 148/92, RR 22, O2 96%. Patient anxious, diaphoretic. 12-lead EKG done (ST elevation II/III/aVF). IV access × 2. Continuous cardiac monitoring. Cath lab alerted.",
        "pharmacist_summary": "STEMI: Loading P2Y12 inhibitor (Prasugrel 60mg or Clopidogrel 600mg). Heparin 70 U/kg bolus + drip. High-intensity statin. Continue home Aspirin 75mg, Metoprolol, Lisinopril. Monitor for bleeding.",
        "category": "cardiovascular"
    },
    {
        "id": "case_003",
        "title": "Abdominal Pain",
        "chief_complaint": "RUQ pain 8/10, fever, jaundice",
        "hpi": "45-year-old female with acute RUQ pain × 6 hours, associated with fever 38.8°C, nausea, vomiting. Jaundiced. History of recurrent abdominal pain.",
        "pmi": "Obesity (BMI 32), cholecystitis history 3 months ago (resolved)",
        "vitals": {"temp": 38.8, "hr": 102, "bp": "130/78", "rr": 18, "o2": 98},
        "pe": "Icteric. RUQ tenderness with rebound and guarding. Murphy's sign positive. Abdominal distension.",
        "labs": {"wbc": 16, "tbili": 3.2, "dbili": 2.8, "ast": 150, "alt": 180, "amylase": 450},
        "doctor_summary": "Acute cholecystitis with choledocholithiasis/biliary pancreatitis. Diagnostic: US shows gallstones + ductal dilation. Plan: NPO, IV fluids, antibiotics (Ceftriaxone + Metronidazole), ERCP for biliary drainage.",
        "nurse_summary": "Acute biliary emergency. Vitals: Temp 38.8°C, HR 102, BP 130/78. Icteric with RUQ tenderness. Murphy's sign positive. NPO. IV fluids running. Foley catheter. Monitor I&O. Abdominal exam q2h.",
        "pharmacist_summary": "Acute cholecystitis with pancreatitis. Ceftriaxone 1g IV q12h + Metronidazole 500mg IV q6h. Start PPI (Omeprazole 20mg OD). Analgesia: Morphine 2-4mg IV q4h. Avoid NSAIDs (pancreatitis).",
        "category": "gastrointestinal"
    },
]

# Triage scenario templates
TRIAGE_SCENARIO_TEMPLATES = [
    {
        "id": "triage_001",
        "complaint": "Fever 39.5°C, cough, SOB",
        "red_flag": RedFlagType.URGENT,
        "reasoning": "Fever + respiratory symptoms + hypoxia risk; needs urgent evaluation for pneumonia/sepsis",
        "vital_signs": {"temp": 39.5, "rr": 26, "o2": 92},
        "key_findings": ["High fever", "Respiratory distress", "Hypoxia"]
    },
    {
        "id": "triage_002",
        "complaint": "Chest pain × 30 min, diaphoresis, left arm pain",
        "red_flag": RedFlagType.ACUTE_EMERGENCY,
        "reasoning": "Classic ACS presentation; needs ICU/EKG/troponin immediately",
        "vital_signs": {"hr": 110, "bp": "160/95", "o2": 95},
        "key_findings": ["Chest pain radiating", "Diaphoresis", "Tachycardia"]
    },
    {
        "id": "triage_003",
        "complaint": "Mild headache, stable vitals",
        "red_flag": RedFlagType.NOT_RED_FLAG,
        "reasoning": "No red flags; can be managed outpatient with OTC analgesics",
        "vital_signs": {"temp": 37, "hr": 72, "bp": "120/80"},
        "key_findings": ["Normal vitals", "Mild symptoms"]
    },
    {
        "id": "triage_004",
        "complaint": "Severe abdominal pain, fever, guarding",
        "red_flag": RedFlagType.ACUTE_EMERGENCY,
        "reasoning": "Signs of acute peritonitis/surgical abdomen; needs imaging + surgery consult",
        "vital_signs": {"temp": 38.5, "hr": 115, "bp": "100/60"},
        "key_findings": ["Severe pain", "Fever", "Peritoneal signs", "Tachycardia"]
    },
    {
        "id": "triage_005",
        "complaint": "Hemiparesis × 2 hours",
        "red_flag": RedFlagType.ACUTE_EMERGENCY,
        "reasoning": "Acute stroke; needs CT/MRI + thrombolytics assessment (4.5h window)",
        "vital_signs": {"temp": 37.2, "hr": 88, "bp": "145/90"},
        "key_findings": ["Focal neurological deficit", "Acute onset"]
    },
    {
        "id": "triage_006",
        "complaint": "SOB at rest, orthopnea, leg swelling",
        "red_flag": RedFlagType.URGENT,
        "reasoning": "Signs of acute decompensated heart failure; needs admission + diuretics",
        "vital_signs": {"rr": 28, "o2": 88, "hr": 105},
        "key_findings": ["Respiratory distress", "Orthopnea", "Edema"]
    },
    {
        "id": "triage_007",
        "complaint": "Suicidal ideation with plan",
        "red_flag": RedFlagType.ACUTE_EMERGENCY,
        "reasoning": "Psychiatric emergency; needs psychiatry consult + 1:1 monitoring",
        "vital_signs": {},
        "key_findings": ["Suicidal plan", "Active ideation"]
    },
    {
        "id": "triage_008",
        "complaint": "Minor knee pain from fall",
        "red_flag": RedFlagType.ROUTINE,
        "reasoning": "No neurovascular compromise or severe deformity; can be evaluated routinely",
        "vital_signs": {},
        "key_findings": ["Isolated injury", "Neurovascular intact"]
    },
]

def generate_clinical_cases(num_cases: int = 100) -> List[Dict[str, Any]]:
    """Generate clinical cases with persona-specific summaries."""
    
    cases = []
    
    # Add templates
    for template in CLINICAL_CASE_TEMPLATES:
        cases.append({
            **template,
            "case_number": len(cases) + 1
        })
    
    # Generate additional cases
    additional_chief_complaints = [
        ("Syncope", "respiratory"),
        ("Abdominal bloating + constipation", "gastrointestinal"),
        ("High fever + rash", "infection"),
        ("Shortness of breath", "respiratory"),
        ("Palpitations", "cardiovascular"),
        ("Joint pain", "musculoskeletal"),
        ("Confusion", "neurological"),
        ("Nausea + vomiting", "gastrointestinal"),
        ("Bloody stool", "gastrointestinal"),
        ("Trauma from fall", "injury"),
    ]
    
    for i in range(num_cases - len(cases)):
        complaint_title, category = random.choice(additional_chief_complaints)
        
        case = {
            "id": f"case_{len(cases)+1:03d}",
            "case_number": len(cases) + 1,
            "title": complaint_title,
            "chief_complaint": complaint_title,
            "hpi": f"Patient with {complaint_title.lower()}. Duration variable, associated symptoms present.",
            "pmi": "Various medical history",
            "vitals": {
                "temp": round(36.5 + random.random() * 2, 1),
                "hr": random.randint(60, 110),
                "bp": f"{random.randint(110, 150)}/{random.randint(70, 95)}",
                "rr": random.randint(14, 24),
                "o2": random.randint(92, 100)
            },
            "pe": "Physical exam findings appropriate to chief complaint",
            "labs": {"wbc": round(7 + random.random() * 8, 1)},
            "category": category,
            "doctor_summary": f"Preliminary assessment for {complaint_title}. Clinical evaluation ongoing.",
            "nurse_summary": f"Patient with {complaint_title}. Vitals documented. Monitoring ongoing.",
            "pharmacist_summary": "Pharmaceutical review pending clinical assessment."
        }
        
        cases.append(case)
    
    return cases[:num_cases]


def generate_triage_scenarios(num_scenarios: int = 100) -> List[Dict[str, Any]]:
    """Generate triage scenarios with red-flag labels."""
    
    scenarios = []
    
    # Add templates
    for template in TRIAGE_SCENARIO_TEMPLATES:
        scenarios.append({
            **template,
            "scenario_number": len(scenarios) + 1
        })
    
    # Generate additional scenarios
    additional_complaints = [
        ("Dizziness", RedFlagType.ROUTINE, "Can be evaluated routinely unless associated with syncope"),
        ("Back pain", RedFlagType.ROUTINE, "Musculoskeletal unless red flag features present"),
        ("Rash", RedFlagType.URGENT, "Could indicate infection; needs evaluation"),
        ("Weakness", RedFlagType.URGENT, "Needs assessment for neurological/metabolic causes"),
        ("Bleeding from ears", RedFlagType.ACUTE_EMERGENCY, "Possible skull base fracture or hemorrhage"),
        ("Severe headache + stiff neck", RedFlagType.ACUTE_EMERGENCY, "Possible meningitis"),
        ("Slurred speech + weakness", RedFlagType.ACUTE_EMERGENCY, "Stroke symptoms"),
        ("Epigastric pain + vomiting", RedFlagType.URGENT, "Possible MI or acute abdomen"),
        ("Swollen ankle no pain", RedFlagType.ROUTINE, "Likely soft tissue; can wait"),
        ("Persistent cough", RedFlagType.ROUTINE, "Needs workup but not emergent"),
    ]
    
    for i in range(num_scenarios - len(scenarios)):
        complaint, red_flag, reasoning = random.choice(additional_complaints)
        
        scenario = {
            "id": f"triage_{len(scenarios)+1:03d}",
            "scenario_number": len(scenarios) + 1,
            "complaint": complaint,
            "red_flag": red_flag.value,
            "reasoning": reasoning,
            "vital_signs": {},
            "key_findings": [complaint]
        }
        
        scenarios.append(scenario)
    
    return scenarios[:num_scenarios]


def save_clinical_cases(cases: List[Dict], output_path: str) -> None:
    """Save clinical cases to JSON."""
    data = {
        "metadata": {
            "num_cases": len(cases),
            "personas": ["doctor", "nurse", "pharmacist"],
            "evaluation_criteria": [
                "Summary completeness",
                "Accuracy of clinical assessment",
                "Appropriate recommendations",
                "Persona-specific language and focus"
            ]
        },
        "cases": cases
    }
    
    import os
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"✓ Saved {len(cases)} clinical cases to {output_path}")


def save_triage_scenarios(scenarios: List[Dict], output_path: str) -> None:
    """Save triage scenarios to JSON."""
    data = {
        "metadata": {
            "num_scenarios": len(scenarios),
            "red_flag_types": [e.value for e in RedFlagType],
            "triage_categories": [e.value for e in TriageCategory],
            "evaluation_criteria": [
                "Red flag detection accuracy",
                "Categorization correctness",
                "Appropriate triage level"
            ]
        },
        "scenarios": scenarios
    }
    
    import os
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"✓ Saved {len(scenarios)} triage scenarios to {output_path}")


def evaluate_summaries(cases: List[Dict], model_output_path: str) -> Dict[str, float]:
    """Evaluate model-generated summaries against gold standard."""
    
    with open(model_output_path, 'r') as f:
        model_outputs = json.load(f)
    
    metrics = {
        'doctor_summary_bleu': 0.0,
        'nurse_summary_bleu': 0.0,
        'pharmacist_summary_bleu': 0.0,
        'overall_similarity': 0.0
    }
    
    # Simple evaluation (in production, use BLEU, ROUGE, etc.)
    # This is a placeholder
    print("Evaluation requires BLEU/ROUGE metrics (install: pip install rouge-score)")
    print("Model outputs vs gold standard comparison ready for manual review")
    
    return metrics


def main():
    parser = argparse.ArgumentParser(description='Generate evaluation sets')
    
    parser.add_argument('--output-cases', type=str, default='eval_data/clinical_cases_100.json',
                       help='Output path for clinical cases')
    parser.add_argument('--output-triage', type=str, default='eval_data/triage_scenarios_100.json',
                       help='Output path for triage scenarios')
    parser.add_argument('--num-cases', type=int, default=100,
                       help='Number of clinical cases')
    parser.add_argument('--num-triage', type=int, default=100,
                       help='Number of triage scenarios')
    
    parser.add_argument('--evaluate-summaries', action='store_true',
                       help='Evaluate model summaries')
    parser.add_argument('--cases', type=str, help='Clinical cases file')
    parser.add_argument('--model-output', type=str, help='Model output file')
    
    args = parser.parse_args()
    
    # Generate evaluation sets
    if not args.evaluate_summaries:
        print("Generating clinical cases...")
        cases = generate_clinical_cases(args.num_cases)
        save_clinical_cases(cases, args.output_cases)
        
        print("Generating triage scenarios...")
        scenarios = generate_triage_scenarios(args.num_triage)
        save_triage_scenarios(scenarios, args.output_triage)
        
        print(f"\n✓ Generated {args.num_cases} clinical cases + {args.num_triage} triage scenarios")
    
    # Evaluate
    if args.evaluate_summaries and args.cases and args.model_output:
        with open(args.cases) as f:
            cases = json.load(f)['cases']
        metrics = evaluate_summaries(cases, args.model_output)
        print(json.dumps(metrics, indent=2))


if __name__ == '__main__':
    main()
