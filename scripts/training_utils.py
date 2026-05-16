#!/usr/bin/env python3
"""
Utilities for medical transformer training pipeline.

Includes:
- Medical corpus building (Thai + English medical text)
- Dataset preparation (MLM, NER, classification)
- Model checkpointing and resumption
- Evaluation metrics (F1, accuracy, perplexity)
- Thai text preprocessing
"""

import os
import json
import random
import logging
from pathlib import Path
from typing import List, Dict, Tuple, Any, Optional
from collections import defaultdict
import warnings

import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader

try:
    from transformers import AutoTokenizer, PreTrainedTokenizer
except ImportError:
    warnings.warn("transformers not installed; some features may not work")

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)


class MedicalTextProcessor:
    """Preprocess Thai + English medical text for training."""
    
    def __init__(self):
        # Thai medical abbreviations and expansions
        self.thai_abbrevs = {
            'ผู้ป่วย': 'patient',
            'แพทย์': 'doctor',
            'พยาบาล': 'nurse',
            'คำว่า': 'word',
            'ความเสี่ยง': 'risk',
            'อาการ': 'symptom',
            'โรค': 'disease',
            'ยา': 'drug',
            'ส่วนตัว': 'personal',
        }
        
        self.medical_abbrevs = {
            'HTN': 'hypertension',
            'DM': 'diabetes mellitus',
            'CAD': 'coronary artery disease',
            'MI': 'myocardial infarction',
            'COPD': 'chronic obstructive pulmonary disease',
            'CHF': 'congestive heart failure',
            'CKD': 'chronic kidney disease',
            'CVA': 'cerebrovascular accident',
            'BP': 'blood pressure',
            'HR': 'heart rate',
            'RR': 'respiratory rate',
            'O2': 'oxygen',
            'CBC': 'complete blood count',
            'CXR': 'chest x-ray',
            'EKG': 'electrocardiogram',
            'WBC': 'white blood cell',
            'RBC': 'red blood cell',
        }
    
    def normalize_text(self, text: str) -> str:
        """
        Normalize medical text:
        - Thai spacing (add space between Thai words)
        - Medical abbreviation expansion (for training)
        - Number normalization (blood pressure, temperature, dosage)
        - Remove redundant whitespace
        """
        # Expand medical abbreviations
        for abbrev, expansion in self.medical_abbrevs.items():
            text = text.replace(abbrev, expansion)
        
        # Normalize measurements
        text = self._normalize_measurements(text)
        
        # Clean whitespace
        text = ' '.join(text.split())
        
        return text
    
    def _normalize_measurements(self, text: str) -> str:
        """Normalize medical measurements for consistency."""
        # Temperature: standardize to Celsius notation
        import re
        
        # BP: 130/85 → blood pressure 130/85
        text = re.sub(r'(\d+)/(\d+)\s*mmHg', r'blood pressure \1/\2 mmHg', text)
        
        # HR: 88 bpm → heart rate 88 bpm
        text = re.sub(r'(\d+)\s*bpm', r'heart rate \1 bpm', text)
        
        # Temperature: 39°C → 39 degrees Celsius
        text = re.sub(r'(\d+(?:\.\d+)?)\s*°?C\b', r'\1 degrees celsius', text)
        
        return text
    
    def split_into_sentences(self, text: str) -> List[str]:
        """Split Thai+English mixed text into sentences."""
        import re
        
        # Handle Thai sentence endings (period, question mark)
        # Thai sometimes uses | or other markers
        sentences = re.split(r'[\.!?|]+(?:\s+|$)', text)
        
        # Clean and filter empty sentences
        sentences = [s.strip() for s in sentences if s.strip()]
        
        return sentences


class MedicalCorpusBuilder:
    """Build medical corpus from various sources."""
    
    def __init__(self, processor: Optional[MedicalTextProcessor] = None):
        self.processor = processor or MedicalTextProcessor()
        self.corpus = []
        self.stats = defaultdict(int)
    
    def add_raw_text(self, text: str, metadata: Optional[Dict] = None) -> None:
        """Add raw clinical text."""
        text = self.processor.normalize_text(text)
        sentences = self.processor.split_into_sentences(text)
        
        for sent in sentences:
            if len(sent.split()) >= 3:  # At least 3 tokens
                self.corpus.append({
                    'text': sent,
                    'metadata': metadata or {}
                })
        
        self.stats['documents_added'] += 1
        self.stats['sentences_added'] += len(sentences)
    
    def add_from_jsonl(self, file_path: str, text_field: str = 'content',
                       metadata_fields: Optional[List[str]] = None) -> None:
        """Load text from JSONL file (e.g., ETL pipeline output)."""
        metadata_fields = metadata_fields or ['encounter_id', 'chunk_type', 'section']
        
        with open(file_path, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                try:
                    obj = json.loads(line)
                    text = obj.get(text_field, '')
                    
                    metadata = {k: obj.get(k) for k in metadata_fields if k in obj}
                    
                    self.add_raw_text(text, metadata)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON at line {line_num}")
                except Exception as e:
                    logger.warning(f"Error processing line {line_num}: {e}")
    
    def add_from_directory(self, dir_path: str, pattern: str = '*.jsonl',
                          text_field: str = 'content') -> None:
        """Load text from all JSONL files in directory."""
        dir_path = Path(dir_path)
        
        for file in sorted(dir_path.glob(pattern)):
            logger.info(f"Loading {file}")
            self.add_from_jsonl(str(file), text_field)
    
    def save_corpus(self, output_path: str, format: str = 'jsonl') -> None:
        """Save corpus to file."""
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        if format == 'jsonl':
            with open(output_path, 'w', encoding='utf-8') as f:
                for item in self.corpus:
                    f.write(json.dumps(item, ensure_ascii=False) + '\n')
        
        elif format == 'txt':
            with open(output_path, 'w', encoding='utf-8') as f:
                for item in self.corpus:
                    f.write(item['text'] + '\n')
        
        logger.info(f"✓ Saved {len(self.corpus)} items to {output_path}")
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get corpus statistics."""
        all_tokens = sum(len(item['text'].split()) for item in self.corpus)
        
        return {
            'total_documents': len(self.corpus),
            'total_tokens': all_tokens,
            'avg_tokens_per_doc': all_tokens / len(self.corpus) if self.corpus else 0,
            **dict(self.stats)
        }
    
    def print_stats(self) -> None:
        """Print corpus statistics."""
        stats = self.get_statistics()
        
        print("\n=== Medical Corpus Statistics ===")
        for key, value in stats.items():
            if isinstance(value, float):
                print(f"{key:25} : {value:10.2f}")
            else:
                print(f"{key:25} : {value:10d}")


class MaskedLanguageModelingDataset(Dataset):
    """PyTorch dataset for masked language modeling."""
    
    def __init__(self, corpus: List[Dict], tokenizer: PreTrainedTokenizer,
                 max_length: int = 512, mlm_probability: float = 0.15):
        self.corpus = corpus
        self.tokenizer = tokenizer
        self.max_length = max_length
        self.mlm_probability = mlm_probability
    
    def __len__(self) -> int:
        return len(self.corpus)
    
    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        text = self.corpus[idx]['text']
        
        # Tokenize
        encoding = self.tokenizer(
            text,
            max_length=self.max_length,
            padding='max_length',
            truncation=True,
            return_tensors='pt'
        )
        
        # Apply MLM: randomly mask 15% of tokens
        labels = encoding['input_ids'].clone()
        mask_indices = torch.bernoulli(
            torch.full(labels.shape, self.mlm_probability)
        ).bool()
        
        # 80% of the time: replace with [MASK]
        # 10% of the time: replace with random token
        # 10% of the time: keep the same
        indices_to_mask = mask_indices[0].nonzero(as_tuple=True)[0]
        
        for idx_to_mask in indices_to_mask:
            rand = torch.rand(1).item()
            if rand < 0.8:
                labels[0, idx_to_mask] = self.tokenizer.mask_token_id
            elif rand < 0.9:
                labels[0, idx_to_mask] = torch.randint(0, self.tokenizer.vocab_size, (1,))
            # else: keep original token
        
        # Set unmask positions to -100 (ignored in loss)
        labels[0, ~mask_indices[0]] = -100
        
        return {
            'input_ids': encoding['input_ids'].squeeze(),
            'attention_mask': encoding['attention_mask'].squeeze(),
            'labels': labels.squeeze()
        }


class CheckpointManager:
    """Manage model checkpoints and training state."""
    
    def __init__(self, checkpoint_dir: str = 'checkpoints/'):
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
    
    def save_checkpoint(self, model, optimizer, epoch: int, step: int,
                       metrics: Dict[str, float]) -> str:
        """Save model checkpoint."""
        checkpoint_name = f"checkpoint-epoch{epoch}-step{step}"
        checkpoint_path = self.checkpoint_dir / checkpoint_name
        checkpoint_path.mkdir(exist_ok=True)
        
        # Save model
        model.save_pretrained(str(checkpoint_path))
        
        # Save optimizer state
        torch.save(optimizer.state_dict(), checkpoint_path / 'optimizer.pt')
        
        # Save metrics
        with open(checkpoint_path / 'metrics.json', 'w') as f:
            json.dump({
                'epoch': epoch,
                'step': step,
                'metrics': metrics
            }, f, indent=2)
        
        logger.info(f"✓ Saved checkpoint: {checkpoint_path}")
        return str(checkpoint_path)
    
    def load_checkpoint(self, model, optimizer, checkpoint_path: str) -> Tuple[int, int]:
        """Load model checkpoint and return epoch, step."""
        checkpoint_path = Path(checkpoint_path)
        
        # Load model
        model = model.from_pretrained(str(checkpoint_path))
        
        # Load optimizer
        optimizer.load_state_dict(torch.load(checkpoint_path / 'optimizer.pt'))
        
        # Load metadata
        with open(checkpoint_path / 'metrics.json') as f:
            metadata = json.load(f)
        
        logger.info(f"✓ Loaded checkpoint from {checkpoint_path}")
        return metadata['epoch'], metadata['step']
    
    def list_checkpoints(self) -> List[str]:
        """List all available checkpoints."""
        return sorted([d.name for d in self.checkpoint_dir.iterdir() if d.is_dir()])


def create_data_loaders(corpus: List[Dict], tokenizer: PreTrainedTokenizer,
                       batch_size: int = 32, max_length: int = 512,
                       train_ratio: float = 0.9, num_workers: int = 0) -> Tuple[DataLoader, DataLoader]:
    """Create train and eval data loaders."""
    
    # Split corpus
    num_train = int(len(corpus) * train_ratio)
    train_corpus = corpus[:num_train]
    eval_corpus = corpus[num_train:]
    
    # Create datasets
    train_dataset = MaskedLanguageModelingDataset(train_corpus, tokenizer, max_length)
    eval_dataset = MaskedLanguageModelingDataset(eval_corpus, tokenizer, max_length)
    
    # Create data loaders
    train_loader = DataLoader(
        train_dataset,
        batch_size=batch_size,
        shuffle=True,
        num_workers=num_workers
    )
    
    eval_loader = DataLoader(
        eval_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers
    )
    
    return train_loader, eval_loader


def set_seed(seed: int = 42) -> None:
    """Set random seed for reproducibility."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def get_device() -> torch.device:
    """Get device (GPU if available, else CPU)."""
    if torch.cuda.is_available():
        device = torch.device('cuda')
        logger.info(f"Using GPU: {torch.cuda.get_device_name(0)}")
    else:
        device = torch.device('cpu')
        logger.info("Using CPU (GPU not available)")
    
    return device


if __name__ == '__main__':
    # Demo
    print("Medical Training Utilities")
    print("- MedicalTextProcessor: Normalize medical text")
    print("- MedicalCorpusBuilder: Build corpus from various sources")
    print("- MaskedLanguageModelingDataset: PyTorch dataset")
    print("- CheckpointManager: Save/load checkpoints")
    print("- create_data_loaders: Create train/eval loaders")
