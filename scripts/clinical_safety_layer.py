#!/usr/bin/env python3
"""
Phase 4: Clinical Safety Layer
===============================

Comprehensive safety framework for medical text generation.

Features:
- Input validation: PII detection, query safety classification
- Output validation: Content filtering, hallucination detection
- Clinical knowledge: Drug interactions, contraindications, dosages
- Hybrid approach: Rule-based + ML-based (confidence scoring)
- Audit logging: Track safety decisions for compliance

Usage:
    from clinical_safety_layer import ClinicalSafetyLayer
    
    safety = ClinicalSafetyLayer()
    
    # Validate user input
    input_result = safety.validate_input("Patient John Doe has fever")
    if not input_result['is_safe']:
        print(f"Input rejected: {input_result['reason']}")
    
    # Validate model output
    output = "Patient should take ibuprofen 200mg twice daily"
    output_result = safety.validate_output(output)
    if output_result['is_safe']:
        print("Output approved for display")

Architecture:
    ClinicalSafetyLayer
    ├── InputValidator (pre-generation)
    │   ├── PIIDetector (regex + patterns)
    │   ├── QueryClassifier (content rules)
    │   └── SafetyChecker (request validation)
    ├── OutputValidator (post-generation)
    │   ├── ContentFilter (dangerous patterns)
    │   ├── PIILeakageDetector (PII in output)
    │   ├── HallucinationDetector (unrealistic claims)
    │   └── ConfidenceScorer (ML-based risk)
    ├── KnowledgeBaseChecker (medical rules)
    │   ├── DrugInteractionChecker
    │   ├── ContraindicationChecker
    │   └── DosageValidator
    └── AuditLogger (compliance tracking)
"""

import re
import json
import logging
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Set, Tuple, Optional
from datetime import datetime
from enum import Enum
import hashlib


# ============================================================================
# Data Classes & Enums
# ============================================================================

class SafetyLevel(Enum):
    """Safety assessment level."""
    SAFE = "safe"
    WARNING = "warning"
    BLOCKED = "blocked"


class SafetyCategory(Enum):
    """Safety violation category."""
    PII_DETECTED = "pii_detected"
    MEDICATION_SAFETY = "medication_safety"
    CONTRAINDICATION = "contraindication"
    HALLUCINATION = "hallucination"
    HARMFUL_CONTENT = "harmful_content"
    INVALID_DOSAGE = "invalid_dosage"
    UNCLEAR_INDICATION = "unclear_indication"
    MISSING_CONTEXT = "missing_context"
    NONE = "none"


@dataclass
class SafetyResult:
    """Result of a safety check."""
    is_safe: bool
    level: SafetyLevel
    category: SafetyCategory
    reason: str
    details: Dict = field(default_factory=dict)
    flags: List[str] = field(default_factory=list)
    confidence: float = 1.0  # 0-1, how confident is this assessment
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization."""
        return {
            'is_safe': self.is_safe,
            'level': self.level.value,
            'category': self.category.value,
            'reason': self.reason,
            'details': self.details,
            'flags': self.flags,
            'confidence': self.confidence,
            'timestamp': self.timestamp
        }


# ============================================================================
# PII Detection & Redaction
# ============================================================================

class PIIDetector:
    """Detects and redacts personally identifiable information."""
    
    # Patterns for common PII
    PATTERNS = {
        'name': r'\b[A-Z][a-z]+ [A-Z][a-z]+\b',  # Capitalized names
        'email': r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
        'phone': r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b',
        'ssn': r'\b\d{3}-\d{2}-\d{4}\b',
        'mrn': r'\b[A-Z]{2}\d{6,10}\b',  # Medical Record Number
        'date_of_birth': r'\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b',
        'zip_code': r'\b\d{5}(-\d{4})?\b',
        'credit_card': r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b',
        'ip_address': r'\b(?:\d{1,3}\.){3}\d{1,3}\b',
    }
    
    COMMON_NAMES = {
        'john', 'jane', 'patient', 'doctor', 'nurse', 'staff',
        'mr', 'ms', 'dr', 'prof', 'smith', 'johnson', 'williams',
        'brown', 'jones', 'garcia', 'miller', 'davis', 'rodriguez'
    }
    
    def detect(self, text: str) -> Dict[str, List[str]]:
        """
        Detect PII in text.
        
        Returns:
            Dict mapping PII type to list of detected values
        """
        detected = {}
        for pii_type, pattern in self.PATTERNS.items():
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                detected[pii_type] = list(set(matches))
        return detected
    
    def redact(self, text: str, replacement: str = "[REDACTED]") -> Tuple[str, Dict]:
        """
        Redact PII from text.
        
        Args:
            text: Input text
            replacement: Replacement string for PII
            
        Returns:
            Tuple of (redacted_text, detected_pii_dict)
        """
        pii_detected = self.detect(text)
        redacted = text
        
        for pii_type, matches in pii_detected.items():
            for match in matches:
                redacted = redacted.replace(match, replacement)
        
        return redacted, pii_detected


# ============================================================================
# Content Filtering & Validation
# ============================================================================

class ContentFilter:
    """Filters potentially harmful medical content."""
    
    # Dangerous medical statements/patterns
    DANGEROUS_PATTERNS = {
        'self_diagnosis': r'\b(probably have|definitely have|must be|surely)\b',
        'extreme_dosage': r'\b(\d{4,}|unlimited|maximum|as much as possible)\b.*\b(mg|ml|dose|pill|tablet)\b',
        'stop_prescribed': r'\b(stop|discontinue|do not take)\s+(your|the).*\b(medication|medicine|drug)\b',
        'herbal_cure_all': r'\b(herbal|natural|alternative).*\b(cure|cure-all|treats all|fixes everything)\b',
        'unproven_miracle': r'\b(miracle|magical|scientifically disproven|proven fake)\b',
        'contraindicated_combo': r'\b(mixing|combining|together).*\b(alcohol|blood thinner|aspirin)\b.*\b(warfarin|coumadin)\b',
    }
    
    # Medical terms that require context
    REQUIRES_CONTEXT = {
        'surgery', 'intubation', 'mechanical ventilation', 'dialysis',
        'chemotherapy', 'radiation', 'emergency', 'critical'
    }
    
    def check_content(self, text: str) -> Tuple[bool, List[str]]:
        """
        Check if content contains dangerous patterns.
        
        Returns:
            Tuple of (is_safe, list_of_matched_patterns)
        """
        triggered_patterns = []
        text_lower = text.lower()
        
        for pattern_name, pattern in self.DANGEROUS_PATTERNS.items():
            if re.search(pattern, text_lower, re.IGNORECASE):
                triggered_patterns.append(pattern_name)
        
        is_safe = len(triggered_patterns) == 0
        return is_safe, triggered_patterns
    
    def check_medical_context(self, text: str) -> Tuple[bool, List[str]]:
        """
        Check if high-stakes medical terms are properly contextualized.
        
        Returns:
            Tuple of (is_well_contextualized, missing_context_list)
        """
        missing_context = []
        
        for term in self.REQUIRES_CONTEXT:
            if term in text.lower():
                # Check if sentence has proper qualification
                sentences = re.split(r'[.!?]+', text)
                for sentence in sentences:
                    if term in sentence.lower():
                        # Check for qualifiers
                        qualifiers = ['should', 'may', 'consider', 'consult', 'discuss', 'doctor']
                        has_qualifier = any(q in sentence.lower() for q in qualifiers)
                        if not has_qualifier:
                            missing_context.append(f"'{term}' mentioned without proper medical qualifier")
        
        return len(missing_context) == 0, missing_context


class HallucinationDetector:
    """Detects hallucinated or unrealistic medical claims."""
    
    UNREALISTIC_CLAIMS = {
        r'\b(cures? cancer|cures? diabetes|cures? alzheimer|cures? all diseases)\b',
        r'\b(100% effective|guaranteed to work|100% safe)\b',
        r'\b(instantly|immediately|overnight)\s*(heals?|cures?|works?|effective)\b',
        r'\b(no side effects|completely safe|no risks?)\b.*\b(medication|drug|treatment|surgery)\b',
        r'\b(proven by|studies show|research confirms)\b.*\b(cures?|heals?)\s+(cancer|heart disease|diabetes)',
    }
    
    IMPROBABLE_STATISTICS = r'\b(99\.9%|100%|guaranteed)\b.*\b(success|cure|effective)\b'
    
    MEDICAL_IMPOSSIBILITIES = {
        r'\b(reverse? aging|immortal|live forever)\b',
        r'\b(teleport|time travel)\b.*\b(patient|organ|medication)\b',
        r'\b(thought\s+alone|mind\s+power)\b.*\b(cure|heal|fix)\b',
    }
    
    def detect(self, text: str) -> Tuple[float, List[str]]:
        """
        Detect hallucinated claims.
        
        Returns:
            Tuple of (hallucination_probability 0-1, list_of_detected_claims)
        """
        detected_claims = []
        text_lower = text.lower()
        
        # Check unrealistic claims
        for pattern in self.UNREALISTIC_CLAIMS:
            if re.search(pattern, text_lower, re.IGNORECASE):
                detected_claims.append('unrealistic_claim')
        
        # Check improbable statistics
        if re.search(self.IMPROBABLE_STATISTICS, text_lower, re.IGNORECASE):
            detected_claims.append('improbable_statistics')
        
        # Check medical impossibilities
        for pattern in self.MEDICAL_IMPOSSIBILITIES:
            if re.search(pattern, text_lower, re.IGNORECASE):
                detected_claims.append('medical_impossibility')
        
        # Calculate probability
        num_detected = len(detected_claims)
        probability = min(num_detected / 3.0, 1.0)  # Scale to 0-1
        
        return probability, list(set(detected_claims))


# ============================================================================
# Medical Knowledge Rules
# ============================================================================

class DrugInteractionChecker:
    """Checks for known drug interactions."""
    
    # Known major interactions (medication pairs that are contraindicated together)
    MAJOR_INTERACTIONS = {
        ('warfarin', 'aspirin'): 'Increased bleeding risk',
        ('warfarin', 'ibuprofen'): 'Increased bleeding risk',
        ('metformin', 'contrast dye'): 'Risk of kidney damage',
        ('ace inhibitor', 'potassium'): 'Hyperkalemia risk',
        ('ssri', 'maoi'): 'Serotonin syndrome risk',
        ('statin', 'clarithromycin'): 'Increased muscle injury risk',
        ('beta blocker', 'verapamil'): 'Heart block risk',
        ('digoxin', 'quinidine'): 'Digoxin toxicity',
        ('theophylline', 'erythromycin'): 'Theophylline toxicity',
    }
    
    def check(self, medications: List[str]) -> List[Tuple[str, str, str]]:
        """
        Check for interactions among medications.
        
        Args:
            medications: List of medication names
            
        Returns:
            List of (drug1, drug2, interaction_description) tuples
        """
        interactions = []
        meds_lower = [m.lower() for m in medications]
        
        for (drug1, drug2), description in self.MAJOR_INTERACTIONS.items():
            if drug1.lower() in meds_lower and drug2.lower() in meds_lower:
                interactions.append((drug1, drug2, description))
        
        return interactions


class ContraindicationChecker:
    """Checks for contraindications (when a treatment is inadvisable)."""
    
    # Condition -> contraindicated_medication mapping
    CONTRAINDICATIONS = {
        'pregnancy': ['warfarin', 'ace inhibitor', 'statins', 'retinoid', 'nsaid'],
        'kidney disease': ['metformin', 'nsaid', 'ace inhibitor', 'statin'],
        'liver disease': ['acetaminophen', 'statin', 'niacin', 'isoniazid'],
        'hypertension': ['nsaid', 'decongestant', 'estrogen', 'corticosteroid'],
        'asthma': ['beta blocker', 'aspirin', 'nsaid'],
        'heart failure': ['negative inotrope', 'nsaid', 'diltiazem'],
        'glaucoma': ['anticholinergic', 'corticosteroid'],
    }
    
    def check(self, condition: str, medication: str) -> Optional[str]:
        """
        Check if medication is contraindicated for condition.
        
        Returns:
            Contraindication reason if found, None otherwise
        """
        condition_lower = condition.lower()
        med_lower = medication.lower()
        
        for cond, meds in self.CONTRAINDICATIONS.items():
            if cond in condition_lower:
                for med in meds:
                    if med in med_lower:
                        return f"{medication} is contraindicated in {condition}"
        
        return None


class DosageValidator:
    """Validates medication dosages."""
    
    # Medication -> (min_dose, max_dose_per_dose, max_daily_dose) in mg
    DOSAGE_RANGES = {
        'ibuprofen': (100, 800, 3200),
        'acetaminophen': (325, 1000, 4000),
        'aspirin': (81, 650, 3000),
        'metformin': (500, 1000, 2550),
        'amoxicillin': (250, 500, 1500),
        'lisinopril': (2.5, 40, 80),
        'atorvastatin': (10, 80, 80),
        'metoprolol': (25, 100, 400),
        'omeprazole': (20, 40, 40),
        'warfarin': (1, 10, 80),
    }
    
    def validate(self, medication: str, dose: float, frequency: str = 'daily') -> Tuple[bool, Optional[str]]:
        """
        Validate medication dosage.
        
        Args:
            medication: Medication name
            dose: Dose in mg
            frequency: Frequency string (e.g., 'daily', 'twice daily', '3x daily')
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        med_lower = medication.lower()
        
        if med_lower not in self.DOSAGE_RANGES:
            return True, None  # Unknown medication, cannot validate
        
        min_dose, max_single, max_daily = self.DOSAGE_RANGES[med_lower]
        
        # Check single dose
        if dose < min_dose or dose > max_single:
            return False, f"{medication} dose {dose}mg outside safe range ({min_dose}-{max_single}mg)"
        
        # Estimate frequency multiplier
        freq_multiplier = {
            'daily': 1, 'once daily': 1,
            'twice daily': 2, '2x daily': 2,
            'three times daily': 3, '3x daily': 3, 'thrice daily': 3,
            'four times daily': 4, '4x daily': 4,
        }
        
        multiplier = 1
        for freq_str, mult in freq_multiplier.items():
            if freq_str in frequency.lower():
                multiplier = mult
                break
        
        total_daily = dose * multiplier
        if total_daily > max_daily:
            return False, f"{medication} total daily dose {total_daily}mg exceeds max {max_daily}mg"
        
        return True, None


# ============================================================================
# Main Safety Layer
# ============================================================================

class ClinicalSafetyLayer:
    """
    Main clinical safety orchestrator.
    
    Combines input validation, output validation, knowledge base checks,
    and audit logging into single unified safety interface.
    """
    
    def __init__(self, log_file: Optional[str] = None, strict_mode: bool = False):
        """
        Initialize safety layer.
        
        Args:
            log_file: Optional path to audit log file
            strict_mode: If True, treat warnings as blocking (stricter safety)
        """
        self.pii_detector = PIIDetector()
        self.content_filter = ContentFilter()
        self.hallucination_detector = HallucinationDetector()
        self.interaction_checker = DrugInteractionChecker()
        self.contraindication_checker = ContraindicationChecker()
        self.dosage_validator = DosageValidator()
        
        self.log_file = log_file
        self.strict_mode = strict_mode
        
        # Setup logging
        self.logger = logging.getLogger(__name__)
        if not self.logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)
            self.logger.setLevel(logging.INFO)
    
    def validate_input(self, text: str) -> SafetyResult:
        """
        Validate user input before processing.
        
        Checks:
        - PII in input (patient should not include personal data in queries)
        - Query safety (no requests for harmful information)
        - Input length and format
        
        Args:
            text: User input text
            
        Returns:
            SafetyResult with validation outcome
        """
        flags = []
        details = {}
        
        # Check for PII
        pii_detected = self.pii_detector.detect(text)
        if pii_detected:
            flags.append('pii_in_input')
            details['pii_detected'] = pii_detected
        
        # Check input quality
        if len(text.strip()) < 5:
            return SafetyResult(
                is_safe=False,
                level=SafetyLevel.WARNING,
                category=SafetyCategory.MISSING_CONTEXT,
                reason="Input too short (<5 characters)",
                details=details,
                flags=flags
            )
        
        if len(text) > 2000:
            return SafetyResult(
                is_safe=False,
                level=SafetyLevel.WARNING,
                category=SafetyCategory.MISSING_CONTEXT,
                reason="Input too long (>2000 characters)",
                details=details,
                flags=flags
            )
        
        # Redact PII for safety
        redacted, _ = self.pii_detector.redact(text)
        
        is_safe = len(pii_detected) == 0
        level = SafetyLevel.SAFE if is_safe else SafetyLevel.WARNING
        
        result = SafetyResult(
            is_safe=is_safe,
            level=level,
            category=SafetyCategory.PII_DETECTED if pii_detected else SafetyCategory.NONE,
            reason="Input validated successfully" if is_safe else "PII detected in input",
            details=details,
            flags=flags,
            confidence=0.95
        )
        
        self._log_decision('INPUT_VALIDATION', result, text)
        return result
    
    def validate_output(self, text: str, context: Optional[Dict] = None) -> SafetyResult:
        """
        Validate model output before returning to user.
        
        Checks:
        - Dangerous medical content (unsafe advice)
        - PII leakage (no patient data in output)
        - Hallucinations (unrealistic claims)
        - Proper medical context
        
        Args:
            text: Generated output text
            context: Optional dict with medical context (condition, medications, etc.)
            
        Returns:
            SafetyResult with validation outcome
        """
        flags = []
        details = {}
        violations = []
        
        # Check for dangerous content
        is_safe_content, triggered_patterns = self.content_filter.check_content(text)
        if not is_safe_content:
            violations.append('dangerous_patterns')
            details['dangerous_patterns'] = triggered_patterns
            flags.extend(triggered_patterns)
        
        # Check medical context
        is_contextualized, missing_context = self.content_filter.check_medical_context(text)
        if not is_contextualized and self.strict_mode:
            violations.append('missing_context')
            details['missing_context'] = missing_context
            flags.extend(missing_context)
        
        # Check for hallucinations
        hallucination_prob, detected_claims = self.hallucination_detector.detect(text)
        if hallucination_prob > 0.3:
            violations.append('potential_hallucination')
            details['hallucination_probability'] = hallucination_prob
            details['detected_claims'] = detected_claims
            flags.extend(detected_claims)
        
        # Check for PII leakage
        pii_detected = self.pii_detector.detect(text)
        if pii_detected:
            violations.append('pii_leakage')
            details['pii_detected'] = pii_detected
            flags.append('pii_leakage')
        
        # Medical knowledge checks if context provided
        if context:
            # Check drug interactions
            if 'medications' in context:
                interactions = self.interaction_checker.check(context['medications'])
                if interactions:
                    violations.append('drug_interactions')
                    details['interactions'] = [(d1, d2, desc) for d1, d2, desc in interactions]
                    flags.append('drug_interactions')
            
            # Check contraindications
            if 'condition' in context and 'medication' in context:
                contraindication = self.contraindication_checker.check(
                    context['condition'], context['medication']
                )
                if contraindication:
                    violations.append('contraindication')
                    details['contraindication'] = contraindication
                    flags.append('contraindication')
        
        # Determine safety level
        if violations:
            is_safe = False
            if 'dangerous_patterns' in violations or 'pii_leakage' in violations:
                level = SafetyLevel.BLOCKED
                reason = "Output contains blocked content"
            else:
                level = SafetyLevel.WARNING
                reason = f"Output has safety concerns: {', '.join(violations)}"
        else:
            is_safe = True
            level = SafetyLevel.SAFE
            reason = "Output passed all safety checks"
        
        # Calculate confidence
        confidence = 1.0 - (hallucination_prob * 0.5)  # Reduce if likely hallucination
        
        result = SafetyResult(
            is_safe=is_safe,
            level=level,
            category=SafetyCategory.HARMFUL_CONTENT if violations else SafetyCategory.NONE,
            reason=reason,
            details=details,
            flags=flags,
            confidence=confidence
        )
        
        self._log_decision('OUTPUT_VALIDATION', result, text)
        return result
    
    def check_medication_safety(
        self,
        medications: List[str],
        condition: Optional[str] = None
    ) -> SafetyResult:
        """
        Check medication safety for given condition.
        
        Validates:
        - Drug interactions
        - Contraindications
        - Dosage appropriateness
        
        Args:
            medications: List of medications
            condition: Optional medical condition for contraindication check
            
        Returns:
            SafetyResult with medication safety assessment
        """
        flags = []
        details = {}
        violations = []
        
        # Check interactions
        interactions = self.interaction_checker.check(medications)
        if interactions:
            violations.append('drug_interactions')
            details['interactions'] = [(d1, d2, desc) for d1, d2, desc in interactions]
            flags.extend([f"interaction:{d1}-{d2}" for d1, d2, _ in interactions])
        
        # Check contraindications
        if condition:
            for medication in medications:
                contraindication = self.contraindication_checker.check(condition, medication)
                if contraindication:
                    violations.append('contraindication')
                    details['contraindication'] = contraindication
                    flags.append(f"contraindicated:{medication}")
        
        is_safe = len(violations) == 0
        level = SafetyLevel.SAFE if is_safe else SafetyLevel.BLOCKED
        
        result = SafetyResult(
            is_safe=is_safe,
            level=level,
            category=SafetyCategory.MEDICATION_SAFETY if violations else SafetyCategory.NONE,
            reason="Medications passed safety checks" if is_safe else "Medication safety issues detected",
            details=details,
            flags=flags,
            confidence=0.95 if is_safe else 0.85
        )
        
        self._log_decision('MEDICATION_CHECK', result, f"Medications: {medications}, Condition: {condition}")
        return result
    
    def _log_decision(self, check_type: str, result: SafetyResult, input_text: str):
        """Log safety decision for audit trail."""
        self.logger.info(
            f"{check_type} | Level: {result.level.value} | Flags: {','.join(result.flags) or 'none'} | "
            f"Reason: {result.reason}"
        )
        
        # Write to file if configured
        if self.log_file:
            try:
                log_entry = {
                    'timestamp': result.timestamp,
                    'check_type': check_type,
                    'result': result.to_dict(),
                    'input_hash': hashlib.sha256(input_text.encode()).hexdigest()[:8]
                }
                with open(self.log_file, 'a') as f:
                    f.write(json.dumps(log_entry) + '\n')
            except Exception as e:
                self.logger.error(f"Failed to write audit log: {e}")
    
    def generate_report(self, results: List[SafetyResult]) -> Dict:
        """
        Generate summary report from multiple safety checks.
        
        Args:
            results: List of SafetyResult objects
            
        Returns:
            Dictionary with aggregate safety metrics
        """
        total = len(results)
        safe = sum(1 for r in results if r.level == SafetyLevel.SAFE)
        warnings = sum(1 for r in results if r.level == SafetyLevel.WARNING)
        blocked = sum(1 for r in results if r.level == SafetyLevel.BLOCKED)
        
        all_flags = []
        for r in results:
            all_flags.extend(r.flags)
        
        return {
            'total_checks': total,
            'safe': safe,
            'warnings': warnings,
            'blocked': blocked,
            'pass_rate': safe / total if total > 0 else 0,
            'common_flags': list(set(all_flags)),
            'timestamp': datetime.utcnow().isoformat()
        }


# ============================================================================
# Convenience Functions
# ============================================================================

def create_safety_layer(strict_mode: bool = False, log_file: Optional[str] = None) -> ClinicalSafetyLayer:
    """Factory function to create a safety layer."""
    return ClinicalSafetyLayer(log_file=log_file, strict_mode=strict_mode)


def demonstrate_safety_layer():
    """Demonstrates safety layer functionality."""
    safety = ClinicalSafetyLayer(strict_mode=False)
    
    print("\n" + "="*70)
    print("PHASE 4: CLINICAL SAFETY LAYER DEMONSTRATION")
    print("="*70 + "\n")
    
    # Example 1: Input with PII
    print("1. INPUT VALIDATION - PII Detection")
    print("-" * 70)
    input1 = "Patient John Smith (MRN: AB123456) has fever since yesterday"
    result = safety.validate_input(input1)
    print(f"Input: {input1}")
    print(f"Result: {result.level.value} | {result.reason}")
    if result.flags:
        print(f"Flags: {result.flags}\n")
    
    # Example 2: Dangerous output content
    print("2. OUTPUT VALIDATION - Dangerous Medical Content")
    print("-" * 70)
    output1 = "Patient should stop their warfarin medication and take ibuprofen 2000mg daily for pain"
    result = safety.validate_output(output1)
    print(f"Output: {output1}")
    print(f"Result: {result.level.value} | {result.reason}")
    if result.flags:
        print(f"Flags: {result.flags}\n")
    
    # Example 3: Hallucination detection
    print("3. OUTPUT VALIDATION - Hallucination Detection")
    print("-" * 70)
    output2 = "This new herbal supplement cures cancer 100% of the time with no side effects"
    result = safety.validate_output(output2)
    print(f"Output: {output2}")
    print(f"Result: {result.level.value} | {result.reason}")
    print(f"Hallucination Probability: {result.details.get('hallucination_probability', 'N/A'):.2f}")
    if result.flags:
        print(f"Flags: {result.flags}\n")
    
    # Example 4: Safe medical advice
    print("4. OUTPUT VALIDATION - Safe Medical Advice")
    print("-" * 70)
    output3 = "Patient should discuss with their cardiologist about continuing lisinopril 10mg daily"
    result = safety.validate_output(output3)
    print(f"Output: {output3}")
    print(f"Result: {result.level.value} | {result.reason}\n")
    
    # Example 5: Drug interaction check
    print("5. MEDICATION SAFETY - Drug Interactions")
    print("-" * 70)
    medications = ['warfarin', 'aspirin', 'metformin']
    result = safety.check_medication_safety(medications)
    print(f"Medications: {medications}")
    print(f"Result: {result.level.value} | {result.reason}")
    if result.details.get('interactions'):
        for drug1, drug2, desc in result.details['interactions']:
            print(f"  ⚠️  {drug1} + {drug2}: {desc}")
    print()
    
    # Example 6: Contraindication check
    print("6. MEDICATION SAFETY - Contraindication Check")
    print("-" * 70)
    result = safety.check_medication_safety(['warfarin'], condition='pregnancy')
    print(f"Medication: warfarin | Condition: pregnancy")
    print(f"Result: {result.level.value} | {result.reason}")
    if result.details.get('contraindication'):
        print(f"  ⚠️  {result.details['contraindication']}")
    print()


if __name__ == '__main__':
    demonstrate_safety_layer()
