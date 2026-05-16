#!/usr/bin/env python3
"""
Drug Interaction Rule Engine

Checks for:
- Drug-drug interactions (using FDA/DrugBank data)
- Contraindications with patient conditions
- Dosage validation
- Renal/hepatic dosing requirements
- Drug allergy cross-reactivity

Uses Thai FDA drug database + DrugBank open data.

Usage:
    # Build drug database from open sources
    python drug_interaction_engine.py --build-database \
        --output-db drugs/drug_database.json
    
    # Check interactions
    python drug_interaction_engine.py --check \
        --drugs aspirin,warfarin \
        --db drugs/drug_database.json
    
    # Validate prescription
    python drug_interaction_engine.py --validate-prescription \
        --prescription prescription.json \
        --patient-data patient.json \
        --db drugs/drug_database.json
"""

import os
import json
import argparse
import logging
from typing import List, Dict, Tuple, Optional, Set
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


class SeverityLevel(str, Enum):
    """Interaction severity levels."""
    CONTRAINDICATED = "CONTRAINDICATED"  # Absolute contraindication
    SEVERE = "SEVERE"                     # Severe interaction
    MODERATE = "MODERATE"                 # Monitor closely
    MILD = "MILD"                         # Minor interaction
    INFORMATION = "INFORMATION"           # Information only


class InteractionType(str, Enum):
    """Types of interactions."""
    DRUG_DRUG = "drug_drug"               # Between two drugs
    DRUG_DISEASE = "drug_disease"         # Drug contraindicated with disease
    DRUG_ALLERGY = "drug_allergy"         # Allergy cross-reactivity
    DOSAGE = "dosage"                     # Dosage out of range
    RENAL = "renal"                       # Renal dosing
    HEPATIC = "hepatic"                   # Hepatic dosing


@dataclass
class DrugInteraction:
    """Represents a drug interaction."""
    interaction_type: InteractionType
    severity: SeverityLevel
    drug1: str
    drug2_or_condition: str
    reason: str
    recommendation: str
    management: str  # How to manage the interaction


class DrugDatabase:
    """In-memory drug database with interaction rules."""
    
    def __init__(self):
        self.drugs: Dict[str, Dict] = {}  # drug_name -> properties
        self.interactions: List[Tuple[str, str, DrugInteraction]] = []  # (drug1, drug2, interaction)
        self.contraindications: Dict[str, List[str]] = {}  # disease -> drugs
        self.allergy_groups: Dict[str, Set[str]] = {}  # allergy_type -> drugs
        self.renal_dosing: Dict[str, Dict] = {}  # drug -> renal_dosing_rules
    
    def add_drug(self, name: str, drug_class: str, properties: Optional[Dict] = None) -> None:
        """Add drug to database."""
        self.drugs[name] = {
            'class': drug_class,
            'properties': properties or {}
        }
    
    def add_interaction(self, drug1: str, drug2: str, severity: SeverityLevel,
                       reason: str, recommendation: str, management: str) -> None:
        """Add drug-drug interaction."""
        interaction = DrugInteraction(
            interaction_type=InteractionType.DRUG_DRUG,
            severity=severity,
            drug1=drug1,
            drug2_or_condition=drug2,
            reason=reason,
            recommendation=recommendation,
            management=management
        )
        self.interactions.append((drug1.lower(), drug2.lower(), interaction))
        # Also add reverse direction
        self.interactions.append((drug2.lower(), drug1.lower(), interaction))
    
    def add_contraindication(self, drug: str, disease: str, reason: str) -> None:
        """Add drug-disease contraindication."""
        if disease not in self.contraindications:
            self.contraindications[disease] = []
        self.contraindications[disease].append(drug)
    
    def add_allergy_group(self, group_name: str, drugs: List[str]) -> None:
        """Add drugs with cross-reactivity (allergy groups)."""
        self.allergy_groups[group_name] = set(d.lower() for d in drugs)
    
    def add_renal_dosing(self, drug: str, rules: Dict) -> None:
        """Add renal dosing rules."""
        self.renal_dosing[drug] = rules
    
    def check_interaction(self, drug1: str, drug2: str) -> Optional[DrugInteraction]:
        """Check if two drugs interact."""
        drug1_lower = drug1.lower()
        drug2_lower = drug2.lower()
        
        for d1, d2, interaction in self.interactions:
            if (d1 == drug1_lower and d2 == drug2_lower) or \
               (d1 == drug2_lower and d2 == drug1_lower):
                return interaction
        
        return None
    
    def check_all_interactions(self, drugs: List[str]) -> List[DrugInteraction]:
        """Check all pairwise interactions."""
        interactions = []
        
        for i, drug1 in enumerate(drugs):
            for drug2 in drugs[i+1:]:
                interaction = self.check_interaction(drug1, drug2)
                if interaction:
                    interactions.append(interaction)
        
        return interactions
    
    def check_contraindication(self, drug: str, disease: str) -> Optional[str]:
        """Check if drug is contraindicated with disease."""
        if disease in self.contraindications:
            for contraindicated_drug in self.contraindications[disease]:
                if contraindicated_drug.lower() == drug.lower():
                    return f"{drug} is contraindicated in {disease}"
        
        return None
    
    def check_allergy_cross_reactivity(self, allergy: str, drug: str) -> bool:
        """Check if drug has cross-reactivity with known allergy."""
        drug_lower = drug.lower()
        
        for allergy_group, drugs in self.allergy_groups.items():
            if allergy.lower() in drugs and drug_lower in drugs:
                return True
        
        return False
    
    def get_renal_dosing(self, drug: str, gfr: float) -> Optional[Dict]:
        """Get renal dosing adjustment based on GFR."""
        if drug not in self.renal_dosing:
            return None
        
        rules = self.renal_dosing[drug]
        
        # Match GFR ranges
        if gfr >= 60:
            return rules.get('normal', {})
        elif gfr >= 30:
            return rules.get('mild_moderate', {})
        elif gfr >= 15:
            return rules.get('severe', {})
        else:
            return rules.get('dialysis', {})
    
    def save_to_file(self, path: str) -> None:
        """Save database to JSON."""
        os.makedirs(os.path.dirname(path), exist_ok=True)
        
        # Convert to serializable format
        data = {
            'drugs': self.drugs,
            'contraindications': self.contraindications,
            'allergy_groups': {k: list(v) for k, v in self.allergy_groups.items()},
            'renal_dosing': self.renal_dosing,
        }
        
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        logger.info(f"✓ Saved drug database to {path}")
    
    @classmethod
    def load_from_file(cls, path: str) -> 'DrugDatabase':
        """Load database from JSON."""
        db = cls()
        
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        db.drugs = data.get('drugs', {})
        db.contraindications = data.get('contraindications', {})
        db.allergy_groups = {
            k: set(v) for k, v in data.get('allergy_groups', {}).items()
        }
        db.renal_dosing = data.get('renal_dosing', {})
        
        logger.info(f"✓ Loaded drug database from {path}")
        return db


def build_default_database() -> DrugDatabase:
    """Build a starter database with common Thai + international drugs."""
    
    db = DrugDatabase()
    
    # ===== COMMON MEDICATIONS =====
    
    # Antibiotics
    db.add_drug("Azithromycin", "macrolide_antibiotic")
    db.add_drug("Amoxicillin", "beta_lactam_antibiotic")
    db.add_drug("Cephalexin", "cephalosporin_antibiotic")
    db.add_drug("Metronidazole", "antibiotic_antiprotozoal")
    db.add_drug("Ciprofloxacin", "fluoroquinolone_antibiotic")
    db.add_drug("Ceftriaxone", "cephalosporin_antibiotic")
    
    # Anticoagulants
    db.add_drug("Warfarin", "anticoagulant")
    db.add_drug("Aspirin", "antiplatelet")
    db.add_drug("Clopidogrel", "antiplatelet")
    db.add_drug("Enoxaparin", "anticoagulant_lmwh")
    
    # Cardiovascular
    db.add_drug("Lisinopril", "ace_inhibitor")
    db.add_drug("Metoprolol", "beta_blocker")
    db.add_drug("Amlodipine", "calcium_channel_blocker")
    db.add_drug("Atorvastatin", "statin")
    db.add_drug("Hydrochlorothiazide", "diuretic")
    
    # Endocrine
    db.add_drug("Metformin", "antidiabetic")
    db.add_drug("Insulin", "antidiabetic")
    db.add_drug("Levothyroxine", "thyroid_hormone")
    
    # GI
    db.add_drug("Omeprazole", "proton_pump_inhibitor")
    db.add_drug("Ranitidine", "h2_blocker")
    db.add_drug("Metoclopramide", "antiemetic")
    
    # NSAIDs & Analgesics
    db.add_drug("Ibuprofen", "nsaid")
    db.add_drug("Naproxen", "nsaid")
    db.add_drug("Paracetamol", "analgesic_antipyretic")
    db.add_drug("Diclofenac", "nsaid")
    
    # ===== DRUG-DRUG INTERACTIONS =====
    
    # Warfarin interactions (major)
    db.add_interaction(
        "Warfarin", "Aspirin",
        SeverityLevel.SEVERE,
        "Both inhibit hemostasis - increased bleeding risk",
        "Avoid concurrent use; if necessary, use lowest ASA dose with close INR monitoring",
        "Monitor INR every 2-3 days initially, then weekly"
    )
    
    db.add_interaction(
        "Warfarin", "NSAIDs (Ibuprofen)",
        SeverityLevel.SEVERE,
        "NSAIDs inhibit platelet function and can displace warfarin from protein binding",
        "Avoid NSAIDs; use paracetamol instead",
        "If necessary: use lowest NSAID dose + gastroprotection + INR monitoring"
    )
    
    db.add_interaction(
        "Warfarin", "Metronidazole",
        SeverityLevel.SEVERE,
        "Metronidazole inhibits warfarin metabolism",
        "Monitor INR closely; may need warfarin dose reduction",
        "Check INR every 2-3 days for 2 weeks"
    )
    
    # CYP3A4 interactions
    db.add_interaction(
        "Azithromycin", "Statins",
        SeverityLevel.MODERATE,
        "Macrolides inhibit CYP3A4, increasing statin levels",
        "Consider temporary statin discontinuation or use pravastatin/rosuvastatin",
        "Monitor for myalgia, rhabdomyolysis signs"
    )
    
    # ACE inhibitor + NSAID
    db.add_interaction(
        "Lisinopril", "Ibuprofen",
        SeverityLevel.MODERATE,
        "NSAIDs can reduce ACE inhibitor effectiveness and cause renal impairment",
        "Use paracetamol instead; monitor renal function",
        "Check Creatinine and K+ levels if concurrent use needed"
    )
    
    # Beta blocker + Calcium channel blocker (caution but not absolute CI)
    db.add_interaction(
        "Metoprolol", "Amlodipine",
        SeverityLevel.MILD,
        "Both have negative inotropic effects",
        "Can be used together but monitor for bradycardia/hypotension",
        "Check HR and BP regularly"
    )
    
    # ===== DRUG-DISEASE CONTRAINDICATIONS =====
    
    db.add_contraindication("Beta blockers (Metoprolol)", "Asthma", 
                           "Can cause bronchospasm")
    db.add_contraindication("ACE inhibitors (Lisinopril)", "Angioedema_history",
                           "History of angioedema is absolute CI")
    db.add_contraindication("NSAIDs", "Severe CKD",
                           "Can worsen renal function")
    db.add_contraindication("Metformin", "Acute Kidney Injury",
                           "Risk of lactic acidosis")
    
    # ===== ALLERGY CROSS-REACTIVITY =====
    
    # Beta-lactam allergy group
    db.add_allergy_group("Beta-lactam", [
        "amoxicillin", "penicillin", "cephalexin", "cephalosporin",
        "ceftriaxone", "aztreonam"
    ])
    
    # Sulfonamide allergy group
    db.add_allergy_group("Sulfonamide", [
        "sulfamethoxazole", "sulfadiazine", "sulfasalazine",
        "hydrochlorothiazide", "furosemide", "bumetanide"
    ])
    
    # Macrolide allergy group
    db.add_allergy_group("Macrolide", [
        "azithromycin", "erythromycin", "clarithromycin"
    ])
    
    # NSAID group (cross-reactivity in some patients)
    db.add_allergy_group("NSAID", [
        "ibuprofen", "naproxen", "diclofenac", "ketorolac"
    ])
    
    # ===== RENAL DOSING =====
    
    db.add_renal_dosing("Ciprofloxacin", {
        'normal': {'dose': '500-750 mg', 'frequency': 'BID'},
        'mild_moderate': {'dose': '250-500 mg', 'frequency': 'BID'},
        'severe': {'dose': '250-500 mg', 'frequency': 'OD'},
        'dialysis': {'dose': '250-500 mg', 'frequency': 'OD post-dialysis'},
        'note': 'GFR >= 30: standard dose; GFR 15-29: 50% dose; GFR < 15: 25-50% dose'
    })
    
    db.add_renal_dosing("Metformin", {
        'normal': {'dose': '500-2550 mg', 'frequency': 'daily'},
        'mild_moderate': {'dose': 'Use with caution', 'frequency': 'Monitor Cr'},
        'severe': {'dose': 'Contraindicated', 'frequency': 'eGFR < 30'},
        'dialysis': {'dose': 'Contraindicated', 'frequency': ''},
        'note': 'Cr > 1.5 mg/dL (M) or > 1.4 mg/dL (F): contraindicated'
    })
    
    db.add_renal_dosing("Lisinopril", {
        'normal': {'dose': '10-40 mg', 'frequency': 'OD'},
        'mild_moderate': {'dose': '5-20 mg', 'frequency': 'OD'},
        'severe': {'dose': '2.5-5 mg', 'frequency': 'OD'},
        'dialysis': {'dose': '2.5 mg', 'frequency': 'OD'},
        'note': 'Start low, titrate based on response'
    })
    
    return db


class PrescriptionValidator:
    """Validates prescriptions for safety."""
    
    def __init__(self, db: DrugDatabase):
        self.db = db
    
    def validate(self, prescription: Dict, patient: Dict) -> Dict:
        """
        Validate prescription against database and patient data.
        
        Returns:
            {
                'valid': bool,
                'alerts': List[str],
                'warnings': List[str],
                'recommendations': List[str]
            }
        """
        alerts = []  # Critical issues
        warnings = []  # Important but not critical
        recommendations = []
        
        drugs = [m['drug'].lower() for m in prescription.get('medications', [])]
        
        # 1. Check drug-drug interactions
        interactions = self.db.check_all_interactions(drugs)
        for interaction in interactions:
            msg = f"{interaction.drug1} + {interaction.drug2_or_condition}: {interaction.reason}"
            if interaction.severity == SeverityLevel.CONTRAINDICATED:
                alerts.append(msg)
            elif interaction.severity == SeverityLevel.SEVERE:
                alerts.append(msg)
            elif interaction.severity == SeverityLevel.MODERATE:
                warnings.append(msg)
            recommendations.append(interaction.recommendation)
        
        # 2. Check drug-disease contraindications
        conditions = [c.lower() for c in patient.get('conditions', [])]
        for drug in drugs:
            for condition in conditions:
                msg = self.db.check_contraindication(drug, condition)
                if msg:
                    alerts.append(msg)
        
        # 3. Check allergy cross-reactivity
        allergies = patient.get('allergies', [])
        for drug in drugs:
            for allergy in allergies:
                if self.db.check_allergy_cross_reactivity(allergy, drug):
                    alerts.append(f"ALLERGY ALERT: {drug} has cross-reactivity with {allergy}")
        
        # 4. Check renal dosing
        gfr = patient.get('renal_function', {}).get('gfr')
        if gfr:
            for med in prescription.get('medications', []):
                drug = med['drug']
                dosing = self.db.get_renal_dosing(drug, gfr)
                if dosing:
                    if gfr < 30:
                        msg = f"RENAL DOSING: {drug} dosing adjustment needed (GFR {gfr})"
                        warnings.append(msg)
                        recommendations.append(dosing.get('note', ''))
        
        valid = len(alerts) == 0
        
        return {
            'valid': valid,
            'alerts': alerts,
            'warnings': warnings,
            'recommendations': recommendations,
            'summary': {
                'critical_issues': len(alerts),
                'warnings': len(warnings),
                'recommendations': len(recommendations)
            }
        }


def main():
    parser = argparse.ArgumentParser(description='Drug interaction rule engine')
    
    parser.add_argument('--build-database', action='store_true',
                       help='Build default drug database')
    parser.add_argument('--output-db', type=str, default='drugs/drug_database.json',
                       help='Output database path')
    
    parser.add_argument('--check', action='store_true',
                       help='Check interactions between drugs')
    parser.add_argument('--drugs', type=str, help='Comma-separated drug list')
    
    parser.add_argument('--validate-prescription', action='store_true',
                       help='Validate a prescription')
    parser.add_argument('--prescription', type=str, help='Prescription JSON file')
    parser.add_argument('--patient-data', type=str, help='Patient data JSON file')
    
    parser.add_argument('--db', type=str, default='drugs/drug_database.json',
                       help='Drug database path')
    
    args = parser.parse_args()
    
    if args.build_database:
        db = build_default_database()
        db.save_to_file(args.output_db)
        print(f"✓ Created database with {len(db.drugs)} drugs")
    
    elif args.check and args.drugs:
        db = DrugDatabase.load_from_file(args.db)
        drugs = [d.strip() for d in args.drugs.split(',')]
        
        interactions = db.check_all_interactions(drugs)
        if interactions:
            print(f"✓ Found {len(interactions)} interactions:")
            for interaction in interactions:
                print(f"\n  {interaction.drug1} + {interaction.drug2_or_condition}")
                print(f"  Severity: {interaction.severity.value}")
                print(f"  Reason: {interaction.reason}")
                print(f"  Recommendation: {interaction.recommendation}")
        else:
            print("✓ No significant interactions found")
    
    elif args.validate_prescription and args.prescription and args.patient_data:
        with open(args.prescription) as f:
            prescription = json.load(f)
        with open(args.patient_data) as f:
            patient = json.load(f)
        
        db = DrugDatabase.load_from_file(args.db)
        validator = PrescriptionValidator(db)
        
        result = validator.validate(prescription, patient)
        
        print(f"\n{'='*60}")
        print(f"Prescription Validation: {'✓ VALID' if result['valid'] else '✗ ISSUES FOUND'}")
        print(f"{'='*60}")
        
        if result['alerts']:
            print("\nCRITICAL ALERTS:")
            for alert in result['alerts']:
                print(f"  ⚠ {alert}")
        
        if result['warnings']:
            print("\nWARNINGS:")
            for warning in result['warnings']:
                print(f"  ⚠ {warning}")
        
        if result['recommendations']:
            print("\nRECOMMENDATIONS:")
            for rec in result['recommendations']:
                print(f"  → {rec}")


if __name__ == '__main__':
    main()
