#!/usr/bin/env python3
"""
SentencePiece Tokenizer Training for CareMind

Trains a SentencePiece BPE tokenizer (32k vocab) on mixed Thai+English+medical corpus.

Features:
- Handles Thai, English, and medical terminology
- BPE merging strategy (subword units)
- 32k vocabulary size
- Normalizes text for consistent tokenization
- Evaluates on real clinical notes

Usage:
    python train_tokenizer.py --corpus clinical_text.txt --output-dir models/
    
    # Use tokenizer:
    from train_tokenizer import load_tokenizer
    sp = load_tokenizer('models/caremind_32k.model')
    tokens = sp.encode_as_pieces('Patient has fever')
    print(tokens)
"""

import os
import sys
import argparse
from pathlib import Path
from typing import List, Dict
import re

try:
    import sentencepiece as spm
except ImportError:
    print("Error: sentencepiece not installed. Run: pip install sentencepiece")
    sys.exit(1)


class ClinicialCorpusPreprocessor:
    """Preprocess clinical text for tokenizer training."""
    
    def __init__(self):
        """Initialize preprocessor."""
        self.thai_stop_chars = set('.,;:!?()[]{}\"\'\\/')
    
    def normalize_text(self, text: str) -> str:
        """Normalize clinical text while preserving medical terms."""
        
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text)
        
        # Normalize Thai text (handle tone marks, vowels)
        # Preserve Thai characters but normalize spacing
        text = re.sub(r'([ก-๙])\s+([ก-๙])', r'\1\2', text)
        
        # Normalize English medical terms and abbreviations
        # Examples: mg, mL, bpm, etc. - keep as-is
        
        # Normalize dates to consistent format (YYYY-MM-DD)
        text = re.sub(r'(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})', r'\3-\1-\2', text)
        
        # Normalize measurements (keep units with numbers)
        text = re.sub(r'(\d+)\s*(mg|mL|°C|bpm|mmHg|gm|kg|cm|mm)', r'\1\2', text)
        
        # Preserve hyphens in medical terms (e.g., "non-invasive")
        # but normalize spacing around them
        text = re.sub(r'\s*-\s*', '-', text)
        
        # Normalize slashes (ratios, alternatives) in medical context
        # e.g., "systolic/diastolic" -> keep as-is, but "/ " -> "/"
        text = re.sub(r'\s*/\s*', '/', text)
        
        # Remove trailing punctuation from ends of lines
        text = re.sub(r'([.!?])\s+([a-z])', r'\1 \2', text)
        
        # Collapse multiple punctuation
        text = re.sub(r'[.!?]+', '.', text)
        text = re.sub(r'[,;]+', ',', text)
        
        # Lower case English, preserve Thai case
        text = re.sub(r'[A-Z]{2,}', lambda m: m.group(0)[0] + m.group(0)[1:].lower(), text)
        
        return text.strip()
    
    def create_training_corpus(self, input_files: List[str], output_file: str):
        """
        Create training corpus from multiple input files.
        
        Args:
            input_files: List of input text files
            output_file: Output corpus file
        """
        with open(output_file, 'w', encoding='utf-8') as out:
            total_lines = 0
            for input_file in input_files:
                if not os.path.exists(input_file):
                    print(f"Warning: {input_file} not found, skipping")
                    continue
                
                with open(input_file, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            normalized = self.normalize_text(line)
                            out.write(normalized + '\n')
                            total_lines += 1
        
        print(f"Created corpus with {total_lines} lines: {output_file}")
        return output_file


class TokenizerTrainer:
    """Trains SentencePiece BPE tokenizer."""
    
    def __init__(self, vocab_size: int = 32000, model_type: str = 'bpe'):
        """
        Initialize trainer.
        
        Args:
            vocab_size: Vocabulary size (default: 32k)
            model_type: 'bpe', 'char', 'word', 'unigram'
        """
        self.vocab_size = vocab_size
        self.model_type = model_type
    
    def train(self, corpus_file: str, output_dir: str, model_prefix: str = 'caremind'):
        """
        Train SentencePiece model.
        
        Args:
            corpus_file: Path to training corpus
            output_dir: Output directory for model files
            model_prefix: Prefix for output model files
        
        Returns:
            Path to trained model (.model file)
        """
        os.makedirs(output_dir, exist_ok=True)
        
        output_prefix = os.path.join(output_dir, f'{model_prefix}_{self.vocab_size // 1000}k')
        
        print(f"Training SentencePiece {self.model_type.upper()} tokenizer...")
        print(f"  Corpus: {corpus_file}")
        print(f"  Vocab size: {self.vocab_size:,}")
        print(f"  Output: {output_prefix}.model")
        
        # Train SentencePiece
        spm.SentencePieceTrainer.train(
            input=corpus_file,
            model_prefix=output_prefix,
            vocab_size=self.vocab_size,
            model_type=self.model_type,
            
            # Training parameters
            normalization_rule_name='identity',  # Preserve Thai/English distinctly
            
            # Thai-specific settings
            use_all_vocab=False,
            character_coverage=0.9999,  # Include rare characters
            
            # BPE settings
            unk_id=0,  # <unk>
            bos_id=1,  # <s>
            eos_id=2,  # </s>
            pad_id=-1,  # No padding token
            unk_surface=r'<unk>',
            unk_piece=r'<unk>',
            bos_piece=r'<s>',
            eos_piece=r'</s>',
            
            # Sentence splitting
            split_by_whitespace=False,
            split_by_unicode_script=True,  # Important for Thai+English
            split_digits=True,
            
            # Training specifics
            max_sentencepiece_length=16,
            num_threads=4,
        )
        
        model_file = f'{output_prefix}.model'
        vocab_file = f'{output_prefix}.vocab'
        
        print(f"✓ Model trained: {model_file}")
        print(f"✓ Vocab file: {vocab_file}")
        
        return model_file


def load_tokenizer(model_file: str) -> spm.SentencePieceProcessor:
    """Load a trained SentencePiece model."""
    sp = spm.SentencePieceProcessor()
    sp.load(model_file)
    return sp


def evaluate_tokenizer(model_file: str, test_texts: List[str]):
    """Evaluate tokenizer on test texts."""
    sp = load_tokenizer(model_file)
    
    print(f"\n=== Tokenizer Evaluation ({model_file}) ===")
    print(f"Vocab size: {sp.vocab_size()}")
    
    for text in test_texts:
        tokens = sp.encode_as_pieces(text)
        ids = sp.encode_as_ids(text)
        
        print(f"\nInput: {text}")
        print(f"Tokens ({len(tokens)}): {tokens}")
        print(f"IDs: {ids}")
        
        # Decode and verify
        decoded = sp.decode_pieces(tokens)
        print(f"Decoded: {decoded}")


def demo_tokenizer_usage():
    """Demonstrate tokenizer usage."""
    print("\n=== Example: Using the Tokenizer ===")
    print("""
    from train_tokenizer import load_tokenizer
    
    # Load model
    sp = load_tokenizer('models/caremind_32k.model')
    
    # Encode text to pieces (subword units)
    text = "Patient has fever (39°C) and productive cough"
    tokens = sp.encode_as_pieces(text)
    print(tokens)
    # Output: ['Patient', '▁has', '▁fever', '▁(', '39', '°C', ')', '▁and', '▁productive', '▁cough']
    
    # Encode to IDs
    ids = sp.encode_as_ids(text)
    print(ids)
    # Output: [1502, 456, 789, ...]
    
    # Decode back
    decoded = sp.decode_pieces(tokens)
    print(decoded)
    # Output: Patient has fever (39°C) and productive cough
    """)


def create_synthetic_corpus(output_file: str = 'clinical_corpus.txt'):
    """Create a synthetic clinical corpus for demo purposes."""
    
    clinical_texts = [
        # English medical notes
        "Patient presents with persistent cough and shortness of breath for 3 days.",
        "Vital signs: Temperature 38.5°C, HR 88 bpm, BP 130/85 mmHg, RR 22, O2 sat 94%.",
        "Physical examination reveals decreased breath sounds in right lower lobe.",
        "Chest X-ray shows bilateral infiltrates consistent with pneumonia.",
        "Assessment: Community-acquired pneumonia. Start azithromycin 500mg PO daily x5 days.",
        "Patient has history of hypertension, type 2 diabetes mellitus, and hyperlipidemia.",
        "Medication list: Metformin 1000mg BD, Lisinopril 10mg daily, Atorvastatin 40mg daily.",
        "Lab results: WBC 13.2K (elevated), CMP normal, troponin negative.",
        "Electrocardiogram shows sinus rhythm without acute ST changes.",
        "Patient tolerated procedure well. No complications noted.",
        
        # Thai medical notes (transliterated examples)
        "ผู้ป่วยมีไข้สูง 39 องศาเซลเซียส ปวดศรีษะ มาวันแรก",
        "ตรวจร่างกาย พบหายใจระหว่าง ผิวหนังแดง ลิ้นแดง",
        "คำวินิจฉัย: ไข้เด็กวัฒนาวิสุทธิ (สกาเลตฟีเวอร์) โรคหัดหลังคน",
        "ให้ยา พาราเซตามอล 500 มก. 4 เท่าต่อวัน อาหารทีละน้อย",
        "ติดตามแนวโน้มท้องแน่นลดลง ท้องเสียรำลึก",
        "ผู้ป่วยหญิง อายุ 35 ปี มาด้วยอาการปวดท้องด้านขวาบน",
        "ตรวจสัมผัส: บริเวณท้องด้านขวาบน มีความเจ็บปวด",
        "ขึ้นอาการเกิดจากการกินอาหารไขมันสูง",
        "ให้สัญญาอาหารง่าย หลีกเลี่ยงไขมัน",
        "ติดตามผลการตรวจข้างหน้า",
        
        # Mixed Thai-English (code-switching)
        "Patient AN123456 มีไข้ 39°C เป็นเวลา 3 วัน มี productive cough",
        "O/E: fever, tachycardia, decreased breath sounds RLL, crackles",
        "CXR shows infiltrate RLL consistent with CAP",
        "Diagnosis: Acute bronchitis with possible pneumonia",
        "ให้ยา Azithromycin 500mg PO daily x5 days",
        "ติดตาม กลับมา 3 วัน ถ้ากลายพยาบาล",
        "Vital signs: T 38.5, HR 88, BP 130/85, RR 22, O2 94%",
        "Lab: CBC - WBC 13.2K (↑), CMP normal",
        "Plan: Continue antibiotics, monitor respiratory status",
        "Patient tolerating well, symptoms improving",
        
        # Medical terminology and abbreviations
        "DOB: 1980-05-15, HN: 123456, AN: 456789",
        "HTN, T2DM, HLD - on Lisinopril, Metformin, Atorvastatin",
        "EKG: NSR, no STEMI, troponin neg",
        "CXR PA/Lat: no acute cardiopulmonary process",
        "Assessment and Plan: Monitor and supportive care",
        "Continue current medications. RTC 1 week.",
        "Aller: NKDA. Social Hx: smoker 10 pack-years",
        "Reviewed imaging studies. Discussed with patient/family.",
        "Prescribed regimen clearly documented in EMR",
        "Patient counseled regarding medications and follow-up.",
    ]
    
    with open(output_file, 'w', encoding='utf-8') as f:
        for text in clinical_texts:
            f.write(text + '\n')
    
    print(f"Created synthetic corpus: {output_file} ({len(clinical_texts)} lines)")
    return output_file


def main():
    parser = argparse.ArgumentParser(
        description='Train SentencePiece BPE tokenizer for clinical text'
    )
    parser.add_argument(
        '--corpus', type=str, default='clinical_corpus.txt',
        help='Path to training corpus (one sentence per line)'
    )
    parser.add_argument(
        '--output-dir', type=str, default='models',
        help='Output directory for trained model'
    )
    parser.add_argument(
        '--vocab-size', type=int, default=32000,
        help='Vocabulary size (default: 32000)'
    )
    parser.add_argument(
        '--model-type', type=str, default='bpe',
        choices=['bpe', 'char', 'word', 'unigram'],
        help='SentencePiece model type'
    )
    parser.add_argument(
        '--create-synthetic', action='store_true',
        help='Create synthetic corpus for demo'
    )
    parser.add_argument(
        '--evaluate', action='store_true',
        help='Evaluate tokenizer after training'
    )
    
    args = parser.parse_args()
    
    # Create synthetic corpus if requested or corpus doesn't exist
    if args.create_synthetic or not os.path.exists(args.corpus):
        print("Creating synthetic clinical corpus...")
        args.corpus = create_synthetic_corpus(args.corpus)
    
    # Train tokenizer
    trainer = TokenizerTrainer(vocab_size=args.vocab_size, model_type=args.model_type)
    model_file = trainer.train(args.corpus, args.output_dir)
    
    # Evaluate if requested
    if args.evaluate:
        test_texts = [
            "Patient has fever 39°C and productive cough",
            "ผู้ป่วยมีไข้สูง 39 องศา ไอมีเสมหะ",
            "O/E: HR 88 bpm, BP 130/85 mmHg, RR 22, O2 sat 94%",
            "Diagnosis: Community-acquired pneumonia, start Azithromycin 500mg PO x5d",
        ]
        evaluate_tokenizer(model_file, test_texts)
    
    # Show usage demo
    demo_tokenizer_usage()


if __name__ == '__main__':
    main()
