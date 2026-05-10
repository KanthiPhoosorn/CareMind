# Phase 4: Clinical Safety Layer

## Overview

Phase 4 introduces a **production-grade Clinical Safety Layer** that protects medical text generation systems from harmful outputs, data breaches, and hallucinations.

The safety layer operates at two critical points:
1. **Pre-generation (Input)**: Validates and sanitizes user queries to remove PII
2. **Post-generation (Output)**: Validates model outputs before displaying to users

### Key Features

| Feature | Description | Type |
|---------|-------------|------|
| **PII Detection & Redaction** | Detects and removes personal identifiable information | Rule-based |
| **Content Filtering** | Blocks dangerous medical advice patterns | Rule-based |
| **Hallucination Detection** | Identifies unrealistic/impossible medical claims | Rule-based + ML-ready |
| **Drug Interaction Checking** | Validates medication combinations | Knowledge-based |
| **Contraindication Checking** | Ensures medications match conditions safely | Knowledge-based |
| **Dosage Validation** | Verifies safe medication dosages | Knowledge-based |
| **Audit Logging** | Maintains compliance-ready decision logs | Logging |
| **Confidence Scoring** | Provides risk metrics with each output | Hybrid |

## Architecture

```
UserInput
    ↓
┌───────────────────────────────┐
│  INPUT VALIDATOR              │
│  ├─ PIIDetector               │
│  │  └─ Regex patterns          │
│  └─ QueryValidator            │
│     └─ Safety checks           │
└───────────────────────────────┘
    ↓
[Redacted & Validated Input]
    ↓
MedicalChatbot / Transformer Model
    ↓
[Raw Generated Output]
    ↓
┌───────────────────────────────┐
│  OUTPUT VALIDATOR             │
│  ├─ ContentFilter             │
│  │  ├─ Dangerous patterns      │
│  │  └─ Medical context check   │
│  ├─ HallucinationDetector     │
│  │  ├─ Unrealistic claims      │
│  │  └─ Medical impossibilities │
│  ├─ PIILeakageDetector        │
│  └─ ConfidenceScorer          │
└───────────────────────────────┘
    ├─ KnowledgeBaseCheckers    │
    │  ├─ DrugInteractionChecker │
    │  ├─ ContraindicationCheck  │
    │  └─ DosageValidator        │
    └─ AuditLogger               │
    ↓
[SafetyResult]
{
  is_safe: bool,
  level: "safe" | "warning" | "blocked",
  category: safety_category,
  reason: str,
  confidence: float,
  flags: [str],
  ...
}
    ↓
[Decision: Display | Warn User | Block]
```

## Setup

### Installation

The safety layer has **minimal dependencies** - mostly Python standard library:

```bash
# No additional packages required for core functionality
# The safety layer uses only:
# - re (regex patterns)
# - json (audit logs)
# - logging (decision tracking)
# - dataclasses (type safety)
# - enum (safety classifications)
```

### Basic Usage

```python
from clinical_safety_layer import ClinicalSafetyLayer

# Create a safety layer instance
safety = ClinicalSafetyLayer(log_file="safety_audit.jsonl")

# Validate user input
input_result = safety.validate_input("Patient has fever")
if not input_result['is_safe']:
    print(f"Input rejected: {input_result['reason']}")
    # Redact PII before processing
    redacted_input, pii = safety.pii_detector.redact(user_input)

# Generate response (your model here)
response = your_model.generate(input_result['text'])

# Validate output before showing to user
output_result = safety.validate_output(response)
if output_result['level'] == 'BLOCKED':
    response = "I cannot provide that medical advice. Please consult a doctor."
elif output_result['level'] == 'WARNING':
    response = f"{response}\n⚠️ Important: {output_result['reason']}"

# Display safe response
print(response)
```

## Components

### 1. PIIDetector

Detects and redacts personally identifiable information.

**Supported PII Types:**
- Full names (regex: capitalized patterns)
- Email addresses
- Phone numbers (XXX-XXX-XXXX, XXX.XXX.XXXX)
- Social Security Numbers (XXX-XX-XXXX)
- Medical Record Numbers (MRN)
- Dates of birth
- ZIP codes
- Credit card numbers
- IP addresses

**Usage:**

```python
detector = PIIDetector()

# Detection
pii_found = detector.detect("Patient John Doe (john@example.com) called")
# Output: {
#   'name': ['John Doe'],
#   'email': ['john@example.com']
# }

# Redaction
redacted, detected = detector.redact("Call 555-123-4567")
# Output: "Call [REDACTED]"
```

### 2. ContentFilter

Filters dangerous medical patterns from model outputs.

**Blocked Patterns:**
- Extreme dosages (4000+ mg / "unlimited")
- Instructions to stop prescribed medications
- Herbal "cure-alls"
- Unproven miracle claims
- Dangerous drug combinations

**Medical Context Check:**
- Ensures high-stakes terms (surgery, intubation, chemotherapy) have proper qualifiers
- Requires phrases like "should", "may", "consult doctor", "discuss with"

**Usage:**

```python
filter = ContentFilter()

# Check content
is_safe, triggered = filter.check_content(
    "Patient should stop warfarin and take ibuprofen 2000mg daily"
)
# Output: is_safe=False, triggered=['stop_prescribed', 'extreme_dosage']

# Check medical context
is_contextualized, missing = filter.check_medical_context(
    "Patient needs surgery to remove tumor"
)
# Output: is_contextualized=False, 
#         missing=['surgery mentioned without proper medical qualifier']
```

### 3. HallucinationDetector

Detects unrealistic and hallucinated medical claims.

**Detected Hallucinations:**
- "Cures cancer 100%"
- "Guaranteed no side effects"
- "Works instantly/overnight"
- "Medical impossibilities" (reverse aging, teleport organs)
- Improbable statistics (99.9% success guarantee)

**Probability Scoring:**
Returns 0-1 hallucination probability based on detected claims.

**Usage:**

```python
detector = HallucinationDetector()

prob, claims = detector.detect(
    "This herb cures all diseases with 100% effectiveness and no side effects"
)
# Output: prob=0.95, 
#         claims=['unrealistic_claim', 'improbable_statistics', 'medical_impossibility']
```

### 4. DrugInteractionChecker

Validates medication combinations against known major interactions.

**Known Interactions (Curated List):**
- Warfarin + Aspirin → Increased bleeding risk
- Warfarin + Ibuprofen → Increased bleeding risk
- Metformin + Contrast dye → Kidney damage risk
- ACE inhibitor + Potassium → Hyperkalemia
- SSRI + MAOI → Serotonin syndrome
- Statin + Clarithromycin → Muscle injury
- Beta blocker + Verapamil → Heart block
- And more...

**Usage:**

```python
checker = DrugInteractionChecker()

interactions = checker.check(['warfarin', 'aspirin', 'metformin'])
# Output: [('warfarin', 'aspirin', 'Increased bleeding risk')]
```

### 5. ContraindicationChecker

Validates medications against medical conditions.

**Example Contraindications:**
- Pregnancy: No warfarin, ACE inhibitors, statins
- Kidney disease: No metformin, NSAIDs
- Liver disease: Limited acetaminophen, avoid certain statins
- Hypertension: No NSAIDs, decongestants, estrogen
- Asthma: No beta blockers, careful with NSAIDs
- Heart failure: No negative inotropes, NSAIDs

**Usage:**

```python
checker = ContraindicationChecker()

result = checker.check('pregnancy', 'warfarin')
# Output: "warfarin is contraindicated in pregnancy"

result = checker.check('kidney disease', 'furosemide')
# Output: None (safe combination)
```

### 6. DosageValidator

Validates medication dosages against therapeutic ranges.

**Supported Medications:**
- Ibuprofen (100-800mg per dose, max 3200mg/day)
- Acetaminophen (325-1000mg per dose, max 4000mg/day)
- Aspirin (81-650mg per dose, max 3000mg/day)
- Warfarin (1-10mg per dose, max 80mg/day)
- And 10+ more medications...

**Usage:**

```python
validator = DosageValidator()

is_valid, error = validator.validate('ibuprofen', 500, 'twice daily')
# Output: (True, None)

is_valid, error = validator.validate('ibuprofen', 2000, 'daily')
# Output: (False, "ibuprofen dose 2000mg outside safe range (100-800mg)")
```

## Integration with Chatbot

### Complete Pipeline Example

```python
from clinical_safety_layer import ClinicalSafetyLayer
from small_transformer import train_small_transformer, generate_text

# Initialize safety layer
safety = ClinicalSafetyLayer(
    log_file="safety_audit.jsonl",
    strict_mode=True  # Treat warnings as blocking
)

# Load or train your model
model, tokenizer, losses = train_small_transformer(
    steps=120,
    batch_size=16
)

def safe_medical_chatbot(user_query):
    """
    Safe wrapper around medical chatbot.
    """
    # 1. Validate and sanitize input
    input_result = safety.validate_input(user_query)
    
    if input_result['level'] == 'BLOCKED':
        return {
            'response': "Please don't include personal information in your query.",
            'safety_level': 'blocked',
            'reason': input_result['reason']
        }
    
    # Redact PII from user input
    clean_input, pii = safety.pii_detector.redact(user_query)
    
    # 2. Generate response using model
    try:
        response = generate_text(
            model, tokenizer,
            prompt=clean_input,
            max_new_tokens=40,
            temperature=0.7
        )
    except Exception as e:
        return {
            'response': "I encountered an error processing your request.",
            'safety_level': 'error',
            'reason': str(e)
        }
    
    # 3. Validate output before returning
    context = {
        'condition': extract_condition(user_query),
        'medications': extract_medications(user_query)
    }
    
    output_result = safety.validate_output(response, context=context)
    
    if output_result['level'] == 'BLOCKED':
        return {
            'response': "I cannot provide this medical advice. Please consult a healthcare provider.",
            'safety_level': 'blocked',
            'reason': output_result['reason'],
            'flags': output_result['flags']
        }
    elif output_result['level'] == 'WARNING':
        return {
            'response': response,
            'safety_level': 'warning',
            'warning': output_result['reason'],
            'confidence': output_result['confidence']
        }
    else:
        return {
            'response': response,
            'safety_level': 'safe',
            'confidence': output_result['confidence']
        }

# Usage
result = safe_medical_chatbot("What should patient with fever take?")
print(result['response'])
```

### Notebook Integration

In your Jupyter notebook:

```python
# Cell: Setup Safety Layer
from scripts.clinical_safety_layer import (
    ClinicalSafetyLayer,
    PIIDetector,
    HallucinationDetector
)

safety = ClinicalSafetyLayer(strict_mode=False)

# Cell: Test Input Validation
test_input = "Patient John Doe (MRN: AB123456) has fever"
result = safety.validate_input(test_input)
print(f"Input Safe: {result.is_safe}")
print(f"Reason: {result.reason}")
print(f"Flags: {result.flags}")

# Cell: Test Output Validation
test_output = "Patient should take ibuprofen 200mg twice daily for pain"
result = safety.validate_output(test_output)
print(f"Output Safe: {result.is_safe}")
print(f"Level: {result.level.value}")
print(f"Confidence: {result.confidence:.2f}")

# Cell: Test Medication Safety
result = safety.check_medication_safety(
    medications=['warfarin', 'aspirin'],
    condition='tremor'
)
print(f"Medications Safe: {result.is_safe}")
if result.details.get('interactions'):
    for drug1, drug2, desc in result.details['interactions']:
        print(f"  ⚠️ {drug1} + {drug2}: {desc}")
```

## Safety Levels

### SAFE (✅)
**Meaning:** Output passed all safety checks and is safe to display.

**Conditions:**
- No dangerous patterns detected
- No hallucinations detected
- No PII leakage
- Content is properly contextualized
- Medical advice aligns with safe practices

**Action:** Display response to user directly.

```
Output: "Patient should take ibuprofen 200mg twice daily for mild pain"
Level: SAFE
Confidence: 0.98
```

### WARNING (⚠️)
**Meaning:** Output has safety concerns but not critical; may display with warning.

**Conditions:**
- Minor policy violations (e.g., missing doctor consultation qualifier)
- Low hallucination probability (0.2-0.5)
- Possible PII leakage but low confidence
- Medical context incomplete but not dangerous

**Action:** Display with warning disclaimer, reduce confidence.

```
Output: "New herbal supplement may help with inflammation"
Level: WARNING
Reason: "potential_hallucination"
Confidence: 0.65
Display: "⚠️ Important: {reason}. Please consult a doctor for confirmation."
```

### BLOCKED (❌)
**Meaning:** Output contains dangerous content and must not be displayed.

**Conditions:**
- Dangerous medical patterns (stop medications, extreme dosages)
- High hallucination probability (>0.7)
- Clear PII leakage
- Medication contraindications or interactions
- Impossible/harmful medical claims

**Action:** Block output, provide alternative message.

```
Output: "Stop your warfarin and take 5000mg ibuprofen daily"
Level: BLOCKED
Reason: "Output contains blocked content"
Flags: ['stop_prescribed', 'extreme_dosage']
Display: "I cannot provide this medical advice. Please consult a healthcare provider."
```

## Customization

### Strict vs. Permissive Mode

```python
# Strict mode: Warnings become blocking
strict_safety = ClinicalSafetyLayer(strict_mode=True)

# Permissive mode: Warnings are displayed with disclaimer
permissive_safety = ClinicalSafetyLayer(strict_mode=False)
```

### Adding Custom Drug Interactions

```python
safety = ClinicalSafetyLayer()

# Add custom interaction
safety.interaction_checker.MAJOR_INTERACTIONS[('custom_drug', 'aspirin')] = \
    'Custom interaction reason'

# Now it will detect this interaction
result = safety.check_medication_safety(['custom_drug', 'aspirin'])
```

### Extending Dosage Ranges

```python
safety = ClinicalSafetyLayer()

# Add new medication dosage range
safety.dosage_validator.DOSAGE_RANGES['new_drug'] = (
    min_dose=10,
    max_single=50,
    max_daily=200
)
```

### Custom Dangerous Patterns

```python
safety = ClinicalSafetyLayer()

# Add custom pattern to detect
safety.content_filter.DANGEROUS_PATTERNS['my_pattern'] = r'my dangerous regex'
```

## Audit Logging

The safety layer maintains detailed audit logs for compliance.

### Log Format

Each logged decision is stored as JSON:

```json
{
  "timestamp": "2024-05-10T14:30:45.123456",
  "check_type": "OUTPUT_VALIDATION",
  "input_hash": "a1b2c3d4",
  "result": {
    "is_safe": false,
    "level": "blocked",
    "category": "harmful_content",
    "reason": "Output contains blocked content",
    "flags": ["stop_prescribed", "extreme_dosage"],
    "confidence": 0.95,
    "details": {
      "dangerous_patterns": ["stop_prescribed", "extreme_dosage"]
    }
  }
}
```

### Reading Audit Logs

```python
import json

def read_audit_log(log_file):
    """Parse safety audit log."""
    decisions = []
    with open(log_file) as f:
        for line in f:
            decisions.append(json.loads(line))
    return decisions

# Analyze decisions
decisions = read_audit_log("safety_audit.jsonl")
blocked = sum(1 for d in decisions if d['result']['level'] == 'blocked')
print(f"Total blocked decisions: {blocked}")
```

### Compliance Reporting

```python
def generate_compliance_report(log_file):
    """Generate safety compliance report."""
    decisions = read_audit_log(log_file)
    safety = ClinicalSafetyLayer()
    
    results = [d['result'] for d in decisions]
    report = safety.generate_report(
        [SafetyResult(**r) for r in results]
    )
    
    print(f"Pass Rate: {report['pass_rate']:.1%}")
    print(f"Safe: {report['safe']} | Warnings: {report['warnings']} | Blocked: {report['blocked']}")
    print(f"Common Flags: {', '.join(report['common_flags'])}")
    
    return report
```

## Limitations & Gotchas

### 1. Rule-Based Rules Won't Catch Everything

The safety layer uses curated rule sets, not learned patterns. It can block known dangerous patterns but won't generalize to novel harmful content.

**Mitigation:** Combine with ML-based classifiers (scikit-learn) for broader coverage.

### 2. Medication Database is Limited

The knowledge base contains ~20 medications and major interactions. Real clinical practice involves thousands of drugs.

**Mitigation:**
- Complement with professional drug databases (RxNorm, DrugBank)
- Regular updates as medical knowledge evolves
- Human-in-the-loop for complex cases

### 3. Context Extraction is Heuristic

The safety layer can't perfectly extract medical context (condition, medications) from free text.

**Mitigation:**
- Explicitly pass context via API parameters
- Use NLP-based entity extraction for better accuracy
- Validate extracted entities

### 4. Hallucination Detection is Pattern-Matching

The HallucinationDetector looks for known hallucination patterns, not semantic unreasonableness.

**Mitigation:**
- Train ML classifier on real hallucination examples
- Use semantic similarity to reference knowledge base
- Combine with model confidence scores

### 5. PII Detection Uses Regex

Regex-based PII detection has high false negatives (misses obscured PII).

**Mitigation:**
- Use trained NER models for better PII detection
- Manual review of sensitive cases
- Combine with data loss prevention (DLP) tools

### 6. No Real-Time Updates

The safety layer doesn't automatically update medical knowledge as guidelines change.

**Mitigation:**
- Periodic manual updates (quarterly)
- Integration with medical guideline change tracking
- Versioned knowledge base files

## Troubleshooting

### Issue: Safe content being blocked

**Cause:** Overly strict rule or pattern match.

**Solution:**
```python
# Check which pattern triggered
result = safety.validate_output(your_text)
print(result.flags)  # Shows which specific rule blocked it

# Consider using permissive mode
safety = ClinicalSafetyLayer(strict_mode=False)
```

### Issue: Unsafe content passing through

**Cause:** Pattern not in knowledge base or insufficient filtering.

**Solution:**
```python
# Add custom dangerous pattern
safety.content_filter.DANGEROUS_PATTERNS['my_new_pattern'] = r'...'

# Or manually review with higher confidence threshold
if result.confidence < 0.8:
    print("Low confidence, review manually")
```

### Issue: Legitimate medications being flagged

**Cause:** Interaction or contraindication rules too strict.

**Solution:**
```python
# Check specific interaction
interactions = safety.interaction_checker.check(['drug1', 'drug2'])

# Remove if false positive
if ('drug1', 'drug2') in safety.interaction_checker.MAJOR_INTERACTIONS:
    del safety.interaction_checker.MAJOR_INTERACTIONS[('drug1', 'drug2')]
```

## Testing Safety Layer

The safety layer includes built-in demonstrations:

```bash
# Run demo
python scripts/clinical_safety_layer.py
```

This will show:
- PII detection and redaction
- Dangerous content blocking
- Hallucination detection
- Safe medical advice validation
- Drug interaction checking
- Contraindication validation

## FAQ

**Q: Will the safety layer perfectly prevent harm?**
A: No. The safety layer catches known patterns but isn't foolproof. Always maintain human oversight, especially for high-stakes medical advice. It's a tool augmenting human judgment, not replacing it.

**Q: Can I use this in production?**
A: Yes, with proper validation and monitoring. The safety layer is designed for production use with audit logging. However, conduct extensive testing with your specific use case and domain experts.

**Q: How do I contribute new safety rules?**
A: Add patterns to the appropriate checker class (ContentFilter, DrugInteractionChecker, etc.), write tests, document the rule, and submit for review by a medical expert.

**Q: Can I reduce compliance logging overhead?**
A: The logging overhead is minimal (<1% per call). For high-volume deployments, batch logs and use structured logging (python-json-logger).

**Q: How often should I update the knowledge base?**
A: At least quarterly. Subscribe to medical guideline updates (FDA, WHO, specialty societies) and incorporate changes.

## References

- **Medical Knowledge Bases:**
  - [RxNorm](https://www.nlm.nih.gov/research/umls/rxnorm/) - Drug names and interactions
  - [DrugBank](https://go.drugbank.com/) - Drug information and interactions
  - [UpToDate](https://www.uptodate.com/) - Clinical evidence and recommendations

- **PII Detection Standards:**
  - [HIPAA Privacy Rule](https://www.hhs.gov/hipaa/for-professionals/privacy/index.html)
  - [GDPR Data Protection](https://gdpr-info.eu/)

- **Medical Safety Standards:**
  - [FDA Regulations](https://www.fda.gov/drugs)
  - [Joint Commission Safety Standards](https://www.jointcommission.org/)

- **NLP for Healthcare:**
  - [scispacy](https://allenai.github.io/scispacy/) - Biomedical NLP tools
  - [BioBERT](https://github.com/dmis-lab/biobert) - Biomedical BERT model

---

**Last Updated:** May 2026  
**Phase:** 4 (Clinical Safety Layer)  
**Status:** Production-Ready
