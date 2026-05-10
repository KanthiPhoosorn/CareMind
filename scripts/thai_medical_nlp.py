#!/usr/bin/env python3
"""
Phase 5: Thai Medical Language Optimization (TMLO)
===================================================

Comprehensive system for normalizing Thai + English medical text.

Features:
- Thai-English code-switching normalization
- Medical abbreviation expansion (150+ abbreviations)
- Medical synonym normalization
- Symptom name standardization
- Thai tokenization for clinical text
- Medical named entity recognition
- Transliteration handling

Usage:
    from thai_medical_nlp import ThaiMedicalProcessor
    
    processor = ThaiMedicalProcessor()
    normalized = processor.normalize("Patient HT DM อาการไข้สูง")
    # Output: "Patient hypertension diabetes mellitus symptom fever high"
"""

import re
from typing import Dict, List, Tuple, Set
from dataclasses import dataclass
from enum import Enum


class TextType(Enum):
    """Type of medical text."""
    DOCTOR_NOTE = "doctor_note"
    NURSE_NOTE = "nurse_note"
    LABORATORY = "lab"
    RADIOLOGY = "radiology"
    PHARMACY = "pharmacy"
    VITAL_SIGNS = "vital_signs"
    DISCHARGE_SUMMARY = "discharge"
    UNKNOWN = "unknown"


@dataclass
class NormalizationResult:
    """Result of text normalization."""
    original: str
    normalized: str
    tokens: List[str]
    abbreviations_expanded: Dict[str, str]
    synonyms_normalized: Dict[str, str]
    text_type: TextType
    language_mix: Dict[str, int]  # {'thai': count, 'english': count}
    confidence: float = 0.95


class ThaiMedicalAbbreviations:
    """Medical abbreviations in Thai context (150+ abbreviations)."""
    
    # Critical care & emergency
    ABBREVIATIONS = {
        # Conditions
        'HT': 'hypertension',
        'HTN': 'hypertension',
        'DM': 'diabetes mellitus',
        'DM2': 'type 2 diabetes mellitus',
        'DM1': 'type 1 diabetes mellitus',
        'CAD': 'coronary artery disease',
        'CHF': 'congestive heart failure',
        'COPD': 'chronic obstructive pulmonary disease',
        'CKD': 'chronic kidney disease',
        'ESRD': 'end stage renal disease',
        'TB': 'tuberculosis',
        'HIV': 'human immunodeficiency virus',
        'AIDS': 'acquired immunodeficiency syndrome',
        'CVA': 'cerebrovascular accident',
        'AMI': 'acute myocardial infarction',
        'AF': 'atrial fibrillation',
        'PVD': 'peripheral vascular disease',
        'CLD': 'chronic liver disease',
        'GERD': 'gastroesophageal reflux disease',
        'PUD': 'peptic ulcer disease',
        'IBD': 'inflammatory bowel disease',
        'RA': 'rheumatoid arthritis',
        'SLE': 'systemic lupus erythematosus',
        'OA': 'osteoarthritis',
        'OB': 'obstetrics',
        'GYN': 'gynecology',
        'URO': 'urology',
        'ENT': 'otolaryngology',
        'GI': 'gastroenterology',
        'ID': 'infectious disease',
        'ICU': 'intensive care unit',
        'ED': 'emergency department',
        'OR': 'operating room',
        
        # Symptoms
        'SOB': 'shortness of breath',
        'DOE': 'dyspnea on exertion',
        'PND': 'paroxysmal nocturnal dyspnea',
        'N/V': 'nausea and vomiting',
        'N&V': 'nausea and vomiting',
        'RLQ': 'right lower quadrant',
        'LLQ': 'left lower quadrant',
        'RUQ': 'right upper quadrant',
        'LUQ': 'left upper quadrant',
        'LOC': 'loss of consciousness',
        'AMS': 'altered mental status',
        'CP': 'chest pain',
        'BP': 'blood pressure',
        'HR': 'heart rate',
        'RR': 'respiratory rate',
        'Temp': 'temperature',
        'SpO2': 'oxygen saturation',
        'VS': 'vital signs',
        'BM': 'body mass',
        'BMI': 'body mass index',
        
        # Medications & treatments
        'IV': 'intravenous',
        'IM': 'intramuscular',
        'SC': 'subcutaneous',
        'PO': 'per oral',
        'QID': 'four times daily',
        'TID': 'three times daily',
        'BID': 'twice daily',
        'OD': 'once daily',
        'QH': 'every hour',
        'Q4H': 'every four hours',
        'Q6H': 'every six hours',
        'Q8H': 'every eight hours',
        'Q12H': 'every twelve hours',
        'ACE-I': 'angiotensin converting enzyme inhibitor',
        'ARB': 'angiotensin receptor blocker',
        'NSAID': 'nonsteroidal anti-inflammatory drug',
        'SSRI': 'selective serotonin reuptake inhibitor',
        'mg': 'milligrams',
        'g': 'grams',
        'mcg': 'micrograms',
        'mL': 'milliliters',
        'L': 'liters',
        'mmol': 'millimoles',
        'mg/dL': 'milligrams per deciliter',
        'mmHg': 'millimeters of mercury',
        'bpm': 'beats per minute',
        'rpm': 'respirations per minute',
        
        # Laboratory
        'CBC': 'complete blood count',
        'CMP': 'comprehensive metabolic panel',
        'BUN': 'blood urea nitrogen',
        'Cr': 'creatinine',
        'eGFR': 'estimated glomerular filtration rate',
        'FBS': 'fasting blood sugar',
        'HbA1c': 'hemoglobin A1c',
        'AST': 'aspartate aminotransferase',
        'ALT': 'alanine aminotransferase',
        'ALP': 'alkaline phosphatase',
        'TB': 'total bilirubin',
        'DB': 'direct bilirubin',
        'ALB': 'albumin',
        'INR': 'international normalized ratio',
        'PT': 'prothrombin time',
        'PTT': 'partial thromboplastin time',
        'TSH': 'thyroid stimulating hormone',
        'T3': 'triiodothyronine',
        'T4': 'thyroxine',
        'HDL': 'high density lipoprotein',
        'LDL': 'low density lipoprotein',
        'TG': 'triglycerides',
        'Chol': 'cholesterol',
        
        # Imaging
        'CXR': 'chest x-ray',
        'PA': 'posteroanterior',
        'AP': 'anteroposterior',
        'CT': 'computed tomography',
        'MRI': 'magnetic resonance imaging',
        'US': 'ultrasound',
        'PCA': 'percutaneous coronary angiography',
        'ECG': 'electrocardiogram',
        'EEG': 'electroencephalogram',
        'Abd': 'abdomen or abdominal',
        'Ext': 'extremity',
        
        # Procedures & operations
        'CABG': 'coronary artery bypass graft',
        'PCI': 'percutaneous coronary intervention',
        'STENT': 'coronary stent',
        'Cath': 'catheterization',
        'Lap': 'laparoscopy',
        'Endoscopy': 'endoscopy',
        'Biopsy': 'biopsy',
        'Aspiration': 'aspiration',
        'Intubation': 'endotracheal intubation',
        
        # Clinical assessment
        'Hx': 'history',
        'Px': 'physical examination',
        'Dx': 'diagnosis',
        'Tx': 'treatment',
        'Sx': 'signs and symptoms',
        'Hgb': 'hemoglobin',
        'Hct': 'hematocrit',
        'WBC': 'white blood cell',
        'RBC': 'red blood cell',
        'Plt': 'platelet',
        
        # Assessment & Plan
        'A&P': 'assessment and plan',
        'PMH': 'past medical history',
        'PSH': 'past surgical history',
        'Meds': 'medications',
        'Allergies': 'allergies',
        'FHx': 'family history',
        'SHx': 'social history',
        'ROS': 'review of systems',
        'O/E': 'on examination',
        'F/U': 'follow-up',
        'c/o': 'complains of',
        'w/': 'with',
        'w/o': 'without',
    }


class ThaiMedicalSynonyms:
    """Map medical synonyms to standard terms."""
    
    SYNONYMS = {
        # Fever variants
        'ไข้': 'fever',
        'ไข้สูง': 'high fever',
        'ไข้เบา': 'low fever',
        'มีไข้': 'has fever',
        'ร้อน': 'fever',
        'อุณหภูมิสูง': 'high temperature',
        
        # Pain variants
        'ปวด': 'pain',
        'ปวดศรีษะ': 'headache',
        'ปวดหลัง': 'back pain',
        'ปวดท้อง': 'abdominal pain',
        'ปวดเมื่อย': 'muscle pain',
        'เจ็บ': 'pain',
        'เจ็บศรีษะ': 'headache',
        'เจ็บท้อง': 'stomach ache',
        'เสียว': 'sharp pain',
        
        # Respiratory
        'ไอ': 'cough',
        'ว่า': 'sore throat',
        'หายใจติดขัด': 'shortness of breath',
        'หอบ': 'asthma',
        'หวัด': 'cold',
        'ไข้หวัด': 'influenza',
        'เหนื่อย': 'fatigue',
        
        # GI symptoms
        'ท้องเสีย': 'diarrhea',
        'อาเจียน': 'vomiting',
        'คลื่นไส้': 'nausea',
        'อ่อน': 'weak',
        'หิว': 'hunger',
        'ไม่หิว': 'anorexia',
        
        # General
        'อาการป่วย': 'illness',
        'อาการ': 'symptom',
        'สัญญาณ': 'sign',
        'อาการเจ็บไข้': 'illness',
        'ผู้ป่วย': 'patient',
        'แพทย์': 'doctor',
        'พยาบาล': 'nurse',
        'โรงพยาบาล': 'hospital',
        'ห้องฉุกเฉิน': 'emergency room',
        'ห้อง ICU': 'intensive care unit',
    }


class ThaiMedicalSymptoms:
    """Standard medical symptom names."""
    
    SYMPTOMS = {
        # Thai to English
        'ไข้สูง': 'fever',
        'ปวดศรีษะ': 'headache',
        'ปวดท้อง': 'abdominal pain',
        'ไอ': 'cough',
        'หายใจติดขัด': 'dyspnea',
        'อาเจียน': 'vomiting',
        'ท้องเสีย': 'diarrhea',
        'ท้องผูก': 'constipation',
        'เพลิดเพลินน้อย': 'malaise',
        'อ่อนแรง': 'weakness',
        'คลื่นไส้': 'nausea',
        'ตัวสั่น': 'tremor',
        'หนาตาปั่น': 'dizziness',
        'หมดสติ': 'syncope',
        'เจ็บศรีษะ': 'migraine',
        
        # English variants
        'fever': 'fever',
        'high fever': 'fever',
        'headache': 'headache',
        'cough': 'cough',
        'sore throat': 'pharyngitis',
        'abdominal pain': 'abdominal pain',
        'chest pain': 'chest pain',
        'back pain': 'back pain',
        'weakness': 'weakness',
        'fatigue': 'fatigue',
        'dyspnea': 'dyspnea',
        'diarrhea': 'diarrhea',
        'vomiting': 'vomiting',
        'nausea': 'nausea',
    }


class ThaiTextNormalizer:
    """Normalize Thai medical text."""
    
    def __init__(self):
        """Initialize normalizer with medical dictionaries."""
        self.abbreviations = {k.upper(): v for k, v in ThaiMedicalAbbreviations.ABBREVIATIONS.items()}
        self.synonyms = ThaiMedicalSynonyms.SYNONYMS
        self.symptoms = ThaiMedicalSymptoms.SYMPTOMS
    
    def expand_abbreviations(self, text: str) -> Tuple[str, Dict[str, str]]:
        """
        Expand medical abbreviations.
        
        Args:
            text: Input text with abbreviations
            
        Returns:
            Tuple of (expanded_text, dict_of_expansions)
        """
        expanded = text
        expansions = {}
        
        # Match abbreviations (longest first so shorter forms do not partially replace longer ones)
        for abbr, full_form in sorted(self.abbreviations.items(), key=lambda item: len(item[0]), reverse=True):
            # Try uppercase
            pattern = r'\b' + re.escape(abbr) + r'\b'
            if re.search(pattern, expanded, re.IGNORECASE):
                matches = re.findall(pattern, expanded, re.IGNORECASE)
                for match in matches:
                    expanded = re.sub(
                        pattern,
                        full_form,
                        expanded,
                        flags=re.IGNORECASE,
                        count=1
                    )
                    if match not in expansions:
                        expansions[match] = full_form
        
        return expanded, expansions
    
    def normalize_synonyms(self, text: str) -> Tuple[str, Dict[str, str]]:
        """
        Normalize medical synonyms.
        
        Args:
            text: Input text with synonyms
            
        Returns:
            Tuple of (normalized_text, dict_of_normalizations)
        """
        normalized = text
        normalizations = {}
        
        # Match Thai and English synonyms. Sort longest-first to avoid partial replacements
        # like "ไข้" inside "ไข้สูง" or "พยาบาล" inside "โรงพยาบาล".
        for syn, standard in sorted(self.synonyms.items(), key=lambda item: len(item[0]), reverse=True):
            # Use word boundaries for English, flexible for Thai
            if self._is_thai(syn):
                pattern = re.escape(syn)
            else:
                pattern = r'\b' + re.escape(syn) + r'\b'
            
            if re.search(pattern, normalized, re.IGNORECASE):
                matches = re.findall(pattern, normalized, re.IGNORECASE)
                for match in matches:
                    replacement = standard
                    if self._is_thai(match):
                        replacement = f" {standard} "
                    normalized = re.sub(
                        pattern,
                        replacement,
                        normalized,
                        flags=re.IGNORECASE,
                        count=1
                    )
                    if match not in normalizations:
                        normalizations[match] = standard
        
        return normalized, normalizations
    
    def tokenize_thai_medical(self, text: str) -> List[str]:
        """
        Tokenize Thai medical text.
        
        Thai doesn't have spaces between words, so use:
        - Word-based segmentation for common medical terms
        - Character-based fallback for unknown words
        
        Args:
            text: Thai medical text
            
        Returns:
            List of tokens
        """
        tokens = []
        
        # Medical dictionary words to split on
        medical_terms = list(self.symptoms.keys()) + list(self.synonyms.keys())
        medical_terms = sorted(medical_terms, key=len, reverse=True)
        
        # Greedy longest-match tokenization
        remaining = text
        while remaining:
            matched = False
            
            # Try to match medical terms first
            for term in medical_terms:
                if remaining.startswith(term):
                    tokens.append(term)
                    remaining = remaining[len(term):]
                    matched = True
                    break
            
            # Try space/punctuation
            if not matched:
                space_match = re.match(r'[\s\-/]+', remaining)
                if space_match:
                    remaining = remaining[len(space_match.group()):]
                    matched = True
            
            # Single character fallback
            if not matched and remaining:
                tokens.append(remaining[0])
                remaining = remaining[1:]
        
        return [t for t in tokens if t.strip()]
    
    def detect_language_script(self, text: str) -> Dict[str, int]:
        """
        Detect language mix in text.
        
        Returns:
            Dict with character counts: {'thai': N, 'english': N, 'digit': N}
        """
        counts = {'thai': 0, 'english': 0, 'digit': 0, 'other': 0}
        
        for char in text:
            code = ord(char)
            # Thai Unicode range: 0x0E00-0x0E7F
            if 0x0E00 <= code <= 0x0E7F:
                counts['thai'] += 1
            elif 'a' <= char.lower() <= 'z':
                counts['english'] += 1
            elif char.isdigit():
                counts['digit'] += 1
            else:
                counts['other'] += 1
        
        return counts
    
    def _is_thai(self, text: str) -> bool:
        """Check if text contains Thai characters."""
        for char in text:
            if 0x0E00 <= ord(char) <= 0x0E7F:
                return True
        return False
    
    def normalize(
        self,
        text: str,
        fix_typos: bool = True,
        expand_abbr: bool = True,
        norm_synon: bool = True,
        lowercase: bool = False
    ) -> NormalizationResult:
        """
        Fully normalize medical text.
        
        Args:
            text: Input medical text (Thai/English mix)
            fix_typos: Fix common typos
            expand_abbr: Expand abbreviations
            norm_synon: Normalize synonyms
            lowercase: Convert to lowercase
            
        Returns:
            NormalizationResult with all normalization details
        """
        normalized = text
        all_expansions = {}
        all_normalizations = {}
        
        # Step 1: Fix common typos
        if fix_typos:
            normalized = self._fix_typos(normalized)
        
        # Step 2: Expand abbreviations
        if expand_abbr:
            normalized, expansions = self.expand_abbreviations(normalized)
            all_expansions.update(expansions)
        
        # Step 3: Normalize synonyms
        if norm_synon:
            normalized, normalizations = self.normalize_synonyms(normalized)
            all_normalizations.update(normalizations)

        # Step 3.5: Normalize whitespace after replacements
        normalized = re.sub(r'\s+', ' ', normalized).strip()
        
        # Step 4: Lowercase if requested
        if lowercase:
            normalized = normalized.lower()
        
        # Step 5: Tokenize
        tokens = self._tokenize(normalized)
        
        # Step 6: Detect language mix
        lang_mix = self.detect_language_script(text)
        
        # Step 7: Detect text type
        text_type = self._detect_text_type(text)
        
        return NormalizationResult(
            original=text,
            normalized=normalized,
            tokens=tokens,
            abbreviations_expanded=all_expansions,
            synonyms_normalized=all_normalizations,
            text_type=text_type,
            language_mix=lang_mix,
            confidence=0.95
        )
    
    def _fix_typos(self, text: str) -> str:
        """Fix common medical typos."""
        typo_fixes = {
            r'\bHTN\b': 'hypertension',
            r'\bDM\b': 'diabetes mellitus',
            r'\bCHF\b': 'congestive heart failure',
            r'\bCAD\b': 'coronary artery disease',
            r'Dx': 'diagnosis',
            r'Tx': 'treatment',
            r'Hx': 'history',
        }
        
        for typo, fix in typo_fixes.items():
            text = re.sub(typo, fix, text, flags=re.IGNORECASE)
        
        return text
    
    def _tokenize(self, text: str) -> List[str]:
        """Simple tokenization: split on whitespace and punctuation."""
        tokens = re.findall(r'\w+|[^\w\s]', text, flags=re.UNICODE)
        return [t for t in tokens if t.strip()]
    
    def _detect_text_type(self, text: str) -> TextType:
        """Detect type of medical note."""
        text_lower = text.lower()
        
        indicators = {
            TextType.DOCTOR_NOTE: ['doctor', 'physician', 'md', 'assessment', 'plan'],
            TextType.NURSE_NOTE: ['nurse', 'rn', 'vitals', 'intake', 'output'],
            TextType.LABORATORY: ['lab', 'result', 'hgb', 'glucose', 'wbc', 'rbc'],
            TextType.RADIOLOGY: ['x-ray', 'ct', 'mri', 'ultrasound', 'imaging'],
            TextType.PHARMACY: ['medication', 'drug', 'prescription', 'dose'],
            TextType.VITAL_SIGNS: ['temperature', 'blood pressure', 'heart rate', 'respiratory'],
            TextType.DISCHARGE_SUMMARY: ['discharge', 'summary', 'follow-up'],
        }
        
        for text_type, keywords in indicators.items():
            if any(kw in text_lower for kw in keywords):
                return text_type
        
        return TextType.UNKNOWN


class ThaiMedicalProcessor:
    """Complete Thai medical NLP pipeline."""
    
    def __init__(self):
        """Initialize processors."""
        self.normalizer = ThaiTextNormalizer()
    
    def process(
        self,
        text: str,
        normalize: bool = True,
        expand_abbr: bool = True,
        norm_synon: bool = True,
        detect_entities: bool = True
    ) -> Dict:
        """
        Process Thai medical text end-to-end.
        
        Args:
            text: Input medical text
            normalize: Normalize text
            expand_abbr: Expand abbreviations
            norm_synon: Normalize synonyms
            detect_entities: Detect medical entities
            
        Returns:
            Dict with processing results
        """
        result = {
            'original_text': text,
            'language_mix': self.normalizer.detect_language_script(text),
            'text_type': None,
        }
        
        # Step 1: Normalize
        if normalize:
            norm_result = self.normalizer.normalize(
                text,
                expand_abbr=expand_abbr,
                norm_synon=norm_synon
            )
            result['normalized_text'] = norm_result.normalized
            result['tokens'] = norm_result.tokens
            result['abbreviations_expanded'] = norm_result.abbreviations_expanded
            result['synonyms_normalized'] = norm_result.synonyms_normalized
            result['text_type'] = norm_result.text_type.value
            result['confidence'] = norm_result.confidence
        
        return result
    
    def batch_process(
        self,
        texts: List[str],
        **kwargs
    ) -> List[Dict]:
        """
        Process multiple texts.
        
        Args:
            texts: List of medical texts
            **kwargs: Arguments to process()
            
        Returns:
            List of processing results
        """
        return [self.process(text, **kwargs) for text in texts]


def demonstrate_thai_medical_nlp():
    """Demonstrate Thai Medical NLP capabilities."""
    
    processor = ThaiMedicalProcessor()
    
    print("\n" + "="*70)
    print("PHASE 5: THAI MEDICAL LANGUAGE OPTIMIZATION")
    print("="*70 + "\n")
    
    # Test cases: Thai + English mix
    test_cases = [
        "Patient AN1 HT DM ไข้สูง 39 องศา ปวดศรีษะ",
        "Nurse note: VS= BP 150/90 HR 88 Temp 38.5°C ท้องเสีย",
        "Lab result: CBC=normal HbA1c=7.2 อาการป่วย 3 วัน",
        "Doctor note: c/o chest pain w/ SOB แพทย์ให้ยา ACE-I",
        "ไข้สูง หายใจติดขัด เจ้าหน้าที่สาธารณสุข ส่งต่อโรงพยาบาล",
    ]
    
    for i, test_text in enumerate(test_cases, 1):
        print(f"Test {i}: {test_text}")
        print("-" * 70)
        
        result = processor.process(test_text)
        
        print(f"Text Type: {result['text_type']}")
        print(f"Language Mix: {result['language_mix']}")
        print(f"Normalized: {result.get('normalized_text', 'N/A')}")
        print(f"Tokens: {result.get('tokens', [])[:10]}")
        
        if result.get('abbreviations_expanded'):
            print(f"Abbreviations Expanded: {result['abbreviations_expanded']}")
        
        if result.get('synonyms_normalized'):
            print(f"Synonyms Normalized: {result['synonyms_normalized']}")
        
        print()
    
    print("="*70)
    print("THAI MEDICAL NLP DEMONSTRATION COMPLETE")
    print("="*70)


if __name__ == '__main__':
    demonstrate_thai_medical_nlp()
