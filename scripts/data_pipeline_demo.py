#!/usr/bin/env python3
"""
Data Pipeline Demo & Integration Test

Shows how to use all pipeline components together:
1. De-identification
2. ETL chunking
3. Tokenization
4. NER training data

Usage:
    python data_pipeline_demo.py
"""

import os
import sys
import json
from pathlib import Path

# Add scripts to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))

from deidentify import DeidentificationPipeline
from train_tokenizer import create_synthetic_corpus, TokenizerTrainer, load_tokenizer
from generate_ner_data import create_gold_standard_dataset


def demo_deidentification():
    """Demonstrate de-identification pipeline."""
    print("\n" + "="*60)
    print("1. DE-IDENTIFICATION DEMO")
    print("="*60)
    
    pipeline = DeidentificationPipeline()
    
    # Example medical text
    text = """
    Patient AN123456 (HN 999888) John Smith
    Date: 2026-05-15
    Contact: john.smith@example.com, +66-8-1234-5678
    
    Doctor: Dr. Sarah Johnson
    
    Assessment: 
    John Smith presents with fever (39°C) and cough.
    Patient is hospitalized in ward 4B, bed 12.
    Started on Azithromycin 500mg daily x5 days.
    """
    
    print("\n[ORIGINAL TEXT]")
    print(text)
    
    # Detect PII
    print("\n[DETECTED PII]")
    matches = pipeline.detect_pii(text)
    for match in matches:
        print(f"  {match.entity_type:10} | {match.text:30} | {match.replacement}")
    
    # De-identify
    print("\n[DE-IDENTIFIED TEXT]")
    deidentified = pipeline.deidentify(text)
    print(deidentified)
    
    # De-identify JSON
    print("\n[DE-IDENTIFY JSON EXAMPLE]")
    json_data = {
        "patientName": "John Smith",
        "hn": "HN999888",
        "doctorName": "Dr. Sarah Johnson",
        "assessment": "Patient John Smith has fever. HN999888."
    }
    
    print("Original:")
    print(json.dumps(json_data, indent=2))
    
    deidentified_json = pipeline.deidentify_json(json_data)
    print("\nDe-identified:")
    print(json.dumps(deidentified_json, indent=2))


def demo_tokenization():
    """Demonstrate tokenizer training and usage."""
    print("\n" + "="*60)
    print("2. TOKENIZATION DEMO")
    print("="*60)
    
    # Create synthetic corpus
    corpus_file = '/tmp/clinical_corpus_demo.txt'
    print(f"\n[Creating synthetic corpus: {corpus_file}]")
    create_synthetic_corpus(corpus_file)
    
    # Train tokenizer
    print("\n[Training SentencePiece BPE tokenizer]")
    output_dir = '/tmp/tokenizer_demo'
    trainer = TokenizerTrainer(vocab_size=8000)  # Smaller for demo
    model_file = trainer.train(corpus_file, output_dir)
    
    # Load and use tokenizer
    print("\n[Testing tokenizer]")
    sp = load_tokenizer(model_file)
    
    test_texts = [
        "Patient has fever 39°C and productive cough",
        "ผู้ป่วยมีไข้สูง 39°C ไอมีเสมหะ",
        "Start Azithromycin 500mg PO daily x5 days",
        "WBC elevated at 13.5K, CXR shows infiltrates RLL",
    ]
    
    for text in test_texts:
        tokens = sp.encode_as_pieces(text)
        print(f"\nInput:  {text}")
        print(f"Tokens: {tokens}")
        print(f"Count:  {len(tokens)} pieces")


def demo_etl():
    """Demonstrate ETL pipeline concepts."""
    print("\n" + "="*60)
    print("3. ETL PIPELINE DEMO")
    print("="*60)
    
    print("""
[ETL Pipeline Flow]

Raw Excel Files (data/AN1/AN1_DoctorProgress_note.xlsx, etc.)
    ↓
Read Excel → DataFrame
    ↓
Extract Records → Dict
    ↓
De-identify (optional)
    ↓
Chunk by Section (assessment, plan, findings, etc.)
    ↓
Add Metadata (timestamp, author role, vitals)
    ↓
Output: JSONL Chunks + Index JSON

[Example Output Chunk]
""")
    
    example_chunk = {
        "chunk_id": "chunk_000001",
        "encounter_id": "AN1",
        "patient_id": "patient_0001",
        "chunk_type": "doctor_note",
        "section": "assessment",
        "content": "Patient AN001 presents with fever (39.5°C), productive cough, and shortness of breath for 3 days. Chest X-ray shows bilateral infiltrates in RLL.",
        "timestamp": "2026-02-14T09:30:00Z",
        "author_role": "doctor",
        "author_id": "staff_0001",
        "document_title": "AN1_DoctorProgress_note.xlsx",
        "metadata": {
            "temperature": 101.5,
            "bloodPressure": "130/85",
            "heartRate": 88,
            "respiratoryRate": 22,
            "oxygenSaturation": 94
        }
    }
    
    print(json.dumps(example_chunk, indent=2))


def demo_ner():
    """Demonstrate NER training data."""
    print("\n" + "="*60)
    print("4. NER TRAINING DATA DEMO")
    print("="*60)
    
    print("\n[Generating 100+ clinician-labeled NER examples]")
    dataset = create_gold_standard_dataset()
    dataset.print_stats()
    
    # Show first few examples
    print("\n[First 3 Examples]")
    for i, ex in enumerate(dataset.examples[:3], 1):
        print(f"\nExample {i}: {ex.example_id}")
        print(f"Text: {ex.text[:100]}...")
        print(f"Entities: {len(ex.entities)}")
        for ent in ex.entities[:3]:
            print(f"  - {ent.entity_type:10} : {ent.text}")
    
    # Show entity distribution
    print("\n[Entity Type Distribution]")
    from collections import Counter
    entity_types = Counter(ent.entity_type for ex in dataset.examples for ent in ex.entities)
    for entity_type, count in sorted(entity_types.items(), key=lambda x: -x[1]):
        print(f"  {entity_type:10} : {count:3d} ({count/sum(entity_types.values())*100:5.1f}%)")


def demo_end_to_end():
    """Demonstrate end-to-end pipeline."""
    print("\n" + "="*60)
    print("5. END-TO-END PIPELINE EXAMPLE")
    print("="*60)
    
    print("""
[Complete Flow: Raw Data → Vector Embedding]

1. START: Raw hospital Excel export
   └─ data/AN1/AN1_DoctorProgress_note.xlsx

2. DE-IDENTIFICATION
   Input:  "Patient AN123456 John Smith has fever"
   Output: "Patient [AN] [PATIENT_NAME] has fever"

3. ETL PIPELINE
   Input:  Raw record (dict)
   Output: Chunks with metadata:
   {
     "chunk_id": "chunk_000001",
     "content": "Patient presents with fever (39.5°C)...",
     "author_role": "doctor",
     "timestamp": "2026-02-14T09:30:00Z"
   }

4. TOKENIZATION
   Input:  "Patient has fever 39°C"
   Output: ['▁Patient', '▁has', '▁fever', '▁39', '°C']
           [1502, 456, 789, 156, 234]  (IDs)

5. NER EXTRACTION
   Input:  "Patient has fever 39°C and cough"
   Output: [
     {"text": "fever", "type": "SYMPTOM"},
     {"text": "39°C", "type": "VITAL"},
     {"text": "cough", "type": "SYMPTOM"}
   ]

6. EMBEDDING & STORAGE
   Tokenized chunk → Dense vector (384-dim) → Milvus
   Enables semantic retrieval for RAG

READY FOR:
  ✓ Delta summary generation
  ✓ Citation retrieval
  ✓ Multi-tenant search
  ✓ Clinical decision support
""")


def main():
    """Run all demos."""
    print("\n" + "#"*60)
    print("# CareMind Data Pipeline Demo")
    print("#"*60)
    
    try:
        demo_deidentification()
        demo_tokenization()
        demo_etl()
        demo_ner()
        demo_end_to_end()
        
        print("\n" + "="*60)
        print("✓ ALL DEMOS COMPLETE")
        print("="*60)
        print("""
Next Steps:
  1. Review scripts/deidentify.py for PII detection
  2. Review scripts/train_tokenizer.py for tokenization
  3. Review scripts/etl_pipeline.py for chunking
  4. Review scripts/generate_ner_data.py for NER labels
  5. Read docs/DATA_PIPELINE_AND_TOKENIZER.md for full guide
  6. Run on your own data:
     python scripts/etl_pipeline.py --input-dir data/ --output-dir output/
     python scripts/train_tokenizer.py --corpus output/clinical_corpus.txt
     python scripts/generate_ner_data.py --output-dir ner_data/
""")
        
    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == '__main__':
    sys.exit(main())
