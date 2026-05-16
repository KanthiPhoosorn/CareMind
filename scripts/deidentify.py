#!/usr/bin/env python3
"""
De-identification Pipeline for CareMind

Removes personally identifiable information (PII) from clinical text.
Includes:
- Regex-based detection (dates, phone, email, Thai HN patterns)
- Dictionary-based Thai name masking
- Placeholder NER for advanced detection

Usage:
    from deidentify import DeidentificationPipeline
    pipeline = DeidentificationPipeline()
    deidentified_text = pipeline.deidentify("Patient AN123456 John Doe...")
    deidentified_dict = pipeline.deidentify_json({"name": "John", "hn": "HN123456"})
"""

import re
from typing import Dict, Any, List, Tuple
from dataclasses import dataclass


@dataclass
class PiiMatch:
    """Represents a detected PII entity."""
    text: str
    entity_type: str  # 'NAME', 'HN', 'DATE', 'PHONE', 'EMAIL', 'AN', 'ID', 'OTHER'
    start: int
    end: int
    replacement: str = None


class ThaiNameDictionary:
    """Thai names and common identifiers for masking."""
    
    THAI_FIRST_NAMES = {
        # Common Thai male names (subset; expand as needed)
        'สมชาย', 'ประเทศ', 'วิทยา', 'กรรมการ', 'สุชาติ', 'พงษ์', 'สมาน', 'ดำเนิน',
        'ชาลี', 'วิลัย', 'จำเริญ', 'สันติ', 'อนุชา', 'ประทีป', 'สมศักดิ์', 'วัฒนา',
        # Common Thai female names (subset)
        'สมหญิง', 'ประภาษ', 'วีรัช', 'เพ็ญ', 'สุดา', 'ดวง', 'นรินทร์', 'นันท์',
        'วิไล', 'สุนัฏฐ์', 'อรนุช', 'อรรณา', 'อัมพร', 'อาทิตย์', 'โชคชัย', 'โชติ',
        # English common first names
        'john', 'james', 'robert', 'michael', 'william', 'david', 'richard', 'joseph',
        'thomas', 'charles', 'mary', 'patricia', 'jennifer', 'linda', 'barbara',
        'elizabeth', 'susan', 'jessica', 'sarah', 'karen', 'nancy', 'betty',
    }
    
    THAI_LAST_NAMES = {
        # Common Thai surnames (subset)
        'สมิทธ', 'จันทร์', 'วงศ์', 'ศรีสุข', 'กิจสถิต', 'ศรีวัฒน์', 'เจริงสวัสดิ์',
        'สายสมบูรณ์', 'ศรีพัฒน์', 'วิชัยสิทธิ์', 'ธรรมชาติ', 'มหาชน', 'ศรีแก้ว',
        'กรุณา', 'สนิท', 'เจริญ', 'สมคิด', 'สมศรี', 'สมบูรณ์', 'สมบัติ',
    }
    
    STAFF_TITLES = {
        'dr', 'dr.', 'dr ', 'doctor', 'prof', 'prof.', 'บ.ด.', 'พ.ศ.', 'น.ส.',
        'นาง', 'นางสาว', 'เดือย', 'พยาบาล', 'ผศ', 'ผศ.', 'อ.', 'อาจารย์',
        'doktor', 'dokter', 'กำหนด', 'นาย', 'คุณ', 'คุณหญิง', 'prof', 'dr', 'mr', 'ms', 'mrs',
    }
    
    @classmethod
    def is_common_name(cls, token: str) -> bool:
        """Check if token matches common name patterns."""
        token_lower = token.lower().strip()
        return token_lower in cls.THAI_FIRST_NAMES or token_lower in cls.THAI_LAST_NAMES


class HnPatternDetector:
    """Detects Hospital Number (HN) and similar identifiers."""
    
    # Thai HN patterns: HN + digits, sometimes with dashes
    # Examples: HN123456, HN-123456, HN 123456
    HN_PATTERNS = [
        r'\bHN\s*[-\.]?\s*(\d{5,8})\b',  # HN123456 or HN-123456 or HN 123456
        r'\b(AN|MRN)\s*[-\.]?\s*(\d{5,8})\b',  # AN123456, MRN123456
        r'\bเลขที่\s*[-\.]?\s*(\d{5,8})\b',  # Thai: เลขที่ (number/ID)
    ]
    
    @classmethod
    def find_hn_patterns(cls, text: str) -> List[Tuple[str, int, int]]:
        """Find HN/AN/MRN patterns in text."""
        matches = []
        for pattern in cls.HN_PATTERNS:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                matches.append((match.group(0), match.start(), match.end()))
        return matches


class DeidentificationPipeline:
    """Main de-identification pipeline combining regex, dictionary, and placeholder NER."""
    
    # Replacement templates
    REPLACEMENTS = {
        'NAME': '[PATIENT_NAME]',
        'HN': '[HN]',
        'AN': '[AN]',
        'DATE': '[DATE]',
        'PHONE': '[PHONE]',
        'EMAIL': '[EMAIL]',
        'ID': '[ID]',
        'OTHER': '[PII]',
    }
    
    # Regex patterns
    PATTERNS = {
        'EMAIL': r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
        'PHONE': r'(\+66|0)[0-9]{8,10}|\([0-9]{2,4}\)\s*[0-9]{3,4}[-\s]?[0-9]{3,4}',
        'DATE_EN': r'\b(19|20)\d{2}[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12][0-9]|3[01])\b',
        'DATE_TH': r'(\d{1,2})\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s*(\d{4})',
        'DATE_SLASH': r'\d{1,2}/\d{1,2}/\d{2,4}',
        'AGE_PATTERN': r'\b(age|อายุ)\s*:?\s*(\d{1,3})\b',
    }
    
    def __init__(self, preserve_structure: bool = False):
        """
        Initialize de-identification pipeline.
        
        Args:
            preserve_structure: If True, preserve document structure in replacements
        """
        self.preserve_structure = preserve_structure
        self.replacement_map = {}  # For consistent replacement mapping
    
    def detect_pii(self, text: str) -> List[PiiMatch]:
        """Detect all PII entities in text using combined methods."""
        matches = []
        
        # 1. HN/AN patterns
        for hn_text, start, end in HnPatternDetector.find_hn_patterns(text):
            entity_type = 'HN' if 'HN' in hn_text.upper() else ('AN' if 'AN' in hn_text.upper() else 'ID')
            matches.append(PiiMatch(
                text=hn_text,
                entity_type=entity_type,
                start=start,
                end=end,
                replacement=self.REPLACEMENTS[entity_type]
            ))
        
        # 2. Regex patterns
        for patt_name, pattern in self.PATTERNS.items():
            for match in re.finditer(pattern, text, re.IGNORECASE | re.MULTILINE):
                entity_type = patt_name.split('_')[0]  # 'EMAIL', 'PHONE', 'DATE', etc.
                if entity_type not in self.REPLACEMENTS:
                    entity_type = 'DATE' if 'DATE' in patt_name else 'OTHER'
                matches.append(PiiMatch(
                    text=match.group(0),
                    entity_type=entity_type,
                    start=match.start(),
                    end=match.end(),
                    replacement=self.REPLACEMENTS[entity_type]
                ))
        
        # 3. Thai name patterns (simple heuristic: capitalized Thai words)
        # This is a placeholder; real NER would be more sophisticated
        for match in re.finditer(r'\b[\u0E00-\u0E7F]{2,}[\u0E00-\u0E7F]*\b', text):
            token = match.group(0)
            if ThaiNameDictionary.is_common_name(token):
                matches.append(PiiMatch(
                    text=token,
                    entity_type='NAME',
                    start=match.start(),
                    end=match.end(),
                    replacement=self.REPLACEMENTS['NAME']
                ))
        
        # 4. English names (Title + Name pattern)
        for match in re.finditer(r'\b(' + '|'.join(ThaiNameDictionary.STAFF_TITLES) + r')\s+([A-Z][a-z]+)\s+([A-Z][a-z]+)?\b', text, re.IGNORECASE):
            # Extract name part (after title)
            name_start = match.start(2)
            name_end = match.end(3) if match.group(3) else match.end(2)
            matches.append(PiiMatch(
                text=text[name_start:name_end],
                entity_type='NAME',
                start=name_start,
                end=name_end,
                replacement=self.REPLACEMENTS['NAME']
            ))
        
        # Deduplicate and sort by position
        matches = self._deduplicate_matches(matches)
        return sorted(matches, key=lambda m: m.start)
    
    def _deduplicate_matches(self, matches: List[PiiMatch]) -> List[PiiMatch]:
        """Remove overlapping matches, keeping the longest."""
        if not matches:
            return []
        
        matches = sorted(matches, key=lambda m: (m.start, -(m.end - m.start)))
        deduplicated = []
        last_end = 0
        
        for match in matches:
            if match.start >= last_end:
                deduplicated.append(match)
                last_end = match.end
        
        return deduplicated
    
    def deidentify(self, text: str, strategy: str = 'replace') -> str:
        """
        De-identify text by replacing PII with placeholders.
        
        Args:
            text: Input text
            strategy: 'replace' (default) or 'redact' (replace with [REDACTED])
        
        Returns:
            De-identified text
        """
        matches = self.detect_pii(text)
        
        if not matches:
            return text
        
        # Apply replacements from end to start to preserve positions
        result = text
        for match in reversed(matches):
            replacement = match.replacement or self.REPLACEMENTS.get(match.entity_type, '[REDACTED]')
            result = result[:match.start] + replacement + result[match.end:]
        
        return result
    
    def deidentify_json(self, obj: Dict[str, Any], fields_to_deidentify: List[str] = None) -> Dict[str, Any]:
        """
        De-identify a JSON object (dict).
        
        Args:
            obj: Input dictionary
            fields_to_deidentify: List of field names to deidentify. If None, deidentify all string fields.
        
        Returns:
            De-identified dictionary (new object)
        """
        if fields_to_deidentify is None:
            fields_to_deidentify = [
                'name', 'patientName', 'doctorName', 'nurseName', 'radiologistName',
                'notes', 'assessment', 'plan', 'findings', 'interpretation',
                'chiefComplaint', 'diagnosis', 'medication', 'medicationName',
            ]
        
        result = {}
        for key, value in obj.items():
            if isinstance(value, str) and (key in fields_to_deidentify or fields_to_deidentify is None):
                result[key] = self.deidentify(value)
            elif isinstance(value, dict):
                result[key] = self.deidentify_json(value, fields_to_deidentify)
            elif isinstance(value, list):
                result[key] = [
                    self.deidentify_json(item, fields_to_deidentify) if isinstance(item, dict)
                    else self.deidentify(item) if isinstance(item, str) and (key in fields_to_deidentify)
                    else item
                    for item in value
                ]
            else:
                result[key] = value
        
        return result
    
    def deidentify_with_mapping(self, text: str) -> Tuple[str, Dict[str, str]]:
        """
        De-identify text and return mapping of original to replacement.
        
        Returns:
            Tuple of (deidentified_text, mapping_dict)
        """
        matches = self.detect_pii(text)
        
        mapping = {}
        result = text
        
        for match in reversed(matches):
            replacement = match.replacement or self.REPLACEMENTS.get(match.entity_type, '[REDACTED]')
            # Store mapping: ORIGINAL -> [TYPE]
            if match.text not in mapping:
                mapping[match.text] = f'{replacement}_{match.entity_type}'
            result = result[:match.start] + replacement + result[match.end:]
        
        return result, mapping


# CLI
if __name__ == '__main__':
    import json
    
    # Example 1: De-identify clinical text
    sample_text = """
    Patient: John Smith (HN 123456, AN 456789)
    DOB: 1980-05-15
    Doctor: Dr. Sarah Johnson
    Contact: john.smith@example.com, +66-8-1234-5678
    
    Assessment: Patient has fever (39°C) and cough. Family history of diabetes.
    Diagnosis: Acute bronchitis
    Plan: Azithromycin 500mg PO daily x5 days. Follow-up in 3 days.
    """
    
    pipeline = DeidentificationPipeline()
    
    # Detect PII
    print("=== PII Detection ===")
    matches = pipeline.detect_pii(sample_text)
    for match in matches:
        print(f"{match.entity_type:10} | {match.text:30} | {match.replacement}")
    
    # De-identify
    print("\n=== Original Text ===")
    print(sample_text)
    print("\n=== De-identified Text ===")
    deidentified = pipeline.deidentify(sample_text)
    print(deidentified)
    
    # Example 2: De-identify JSON
    print("\n=== De-identify JSON ===")
    sample_json = {
        "patientId": "an1",
        "patientName": "John Smith",
        "doctorName": "Dr. Sarah Johnson",
        "hn": "HN123456",
        "assessment": "Patient John Smith presents with fever and cough. HN123456.",
    }
    
    deidentified_json = pipeline.deidentify_json(sample_json)
    print(json.dumps(deidentified_json, indent=2, ensure_ascii=False))
