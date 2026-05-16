#!/usr/bin/env python3
"""
Train a small medical transformer encoder from scratch.

Model: 50-100M parameter transformer encoder
Training: Masked Language Modeling (MLM)
Data: 1-5B tokens of Thai + English medical text
Duration: 1-2 weeks (depending on hardware)

Usage:
    # Build corpus
    python train_medical_encoder.py --build-corpus --corpus-source data/ --output-corpus corpus/medical_corpus.jsonl
    
    # Train small encoder
    python train_medical_encoder.py --train \
        --corpus corpus/medical_corpus.jsonl \
        --model-size small \
        --batch-size 64 \
        --max-steps 100000 \
        --checkpoint-dir checkpoints/medical_encoder/
    
    # Resume from checkpoint
    python train_medical_encoder.py --train \
        --corpus corpus/medical_corpus.jsonl \
        --resume-from checkpoints/medical_encoder/checkpoint-epoch2-step50000/
"""

import os
import sys
import json
import argparse
import logging
from pathlib import Path
from typing import Optional

import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torch.optim import AdamW
from torch.optim.lr_scheduler import LinearLR, CosineAnnealingLR

try:
    from transformers import (
        AutoConfig, AutoTokenizer, PreTrainedModel,
        BertConfig, BertModel, BertForMaskedLM
    )
    from transformers.optimization import get_linear_schedule_with_warmup
except ImportError:
    raise ImportError("Please install: pip install transformers torch")

# Add scripts to path
sys.path.insert(0, os.path.dirname(__file__))
from training_utils import (
    MedicalCorpusBuilder, MedicalTextProcessor,
    MaskedLanguageModelingDataset, CheckpointManager,
    create_data_loaders, set_seed, get_device
)

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)


class MedicalEncoderConfig:
    """Configuration for small medical encoder models."""
    
    # Model architecture presets
    SIZES = {
        'tiny': {
            'hidden_size': 256,
            'num_hidden_layers': 4,
            'num_attention_heads': 4,
            'intermediate_size': 1024,
            'max_position_embeddings': 512,
            'vocab_size': 32000,
        },
        'small': {
            'hidden_size': 512,
            'num_hidden_layers': 6,
            'num_attention_heads': 8,
            'intermediate_size': 2048,
            'max_position_embeddings': 512,
            'vocab_size': 32000,
        },
        'medium': {
            'hidden_size': 768,
            'num_hidden_layers': 12,
            'num_attention_heads': 12,
            'intermediate_size': 3072,
            'max_position_embeddings': 512,
            'vocab_size': 32000,
        },
        'base': {
            'hidden_size': 768,
            'num_hidden_layers': 12,
            'num_attention_heads': 12,
            'intermediate_size': 3072,
            'max_position_embeddings': 512,
            'vocab_size': 32000,
        },
    }
    
    @staticmethod
    def estimate_parameters(size: str) -> int:
        """Estimate number of parameters."""
        config = MedicalEncoderConfig.SIZES[size]
        
        # Rough estimate: embedding + transformer layers + output layer
        vocab = config['vocab_size']
        hidden = config['hidden_size']
        layers = config['num_hidden_layers']
        
        # Embedding: vocab * hidden
        embedding_params = vocab * hidden
        
        # Transformer layers: ~5.6M params per layer (for base size)
        transformer_params = layers * (hidden * hidden * 4)  # Simplified
        
        return (embedding_params + transformer_params) // 1_000_000


def build_corpus(
    corpus_source: str,
    output_path: str,
    limit_tokens: Optional[int] = None
) -> None:
    """Build medical corpus from raw data sources."""
    logger.info(f"Building medical corpus from {corpus_source}")
    
    builder = MedicalCorpusBuilder(MedicalTextProcessor())
    
    source_path = Path(corpus_source)
    if source_path.is_file():
        # Single JSONL file
        builder.add_from_jsonl(corpus_source)
    elif source_path.is_dir():
        # Directory of files
        builder.add_from_directory(corpus_source)
    
    # Limit tokens if specified
    if limit_tokens:
        total_tokens = sum(len(item['text'].split()) for item in builder.corpus)
        if total_tokens > limit_tokens:
            ratio = limit_tokens / total_tokens
            builder.corpus = builder.corpus[:int(len(builder.corpus) * ratio)]
            logger.info(f"Limited corpus to {limit_tokens} tokens")
    
    builder.save_corpus(output_path)
    builder.print_stats()


def train_encoder(
    corpus_path: str,
    model_size: str = 'small',
    batch_size: int = 32,
    learning_rate: float = 1e-4,
    max_steps: int = 100000,
    warmup_steps: int = 10000,
    eval_steps: int = 5000,
    checkpoint_dir: str = 'checkpoints/medical_encoder/',
    resume_from: Optional[str] = None,
    gradient_accumulation_steps: int = 1,
) -> None:
    """Train medical encoder with MLM objective."""
    
    logger.info(f"Training medical encoder ({model_size} size)")
    logger.info(f"Model params: ~{MedicalEncoderConfig.estimate_parameters(model_size)}M")
    
    set_seed(42)
    device = get_device()
    
    # Load corpus
    logger.info(f"Loading corpus from {corpus_path}")
    with open(corpus_path, 'r', encoding='utf-8') as f:
        corpus = [json.loads(line) for line in f]
    logger.info(f"Loaded {len(corpus)} documents")
    
    # Initialize tokenizer (assuming SentencePiece from earlier scripts)
    try:
        tokenizer = AutoTokenizer.from_pretrained('gpt2')  # Fallback
    except:
        logger.warning("Using default tokenizer")
        from transformers import BertTokenizer
        tokenizer = BertTokenizer.from_pretrained('bert-base-uncased')
    
    # Create model
    logger.info(f"Creating {model_size} encoder model")
    config_dict = MedicalEncoderConfig.SIZES[model_size]
    config = BertConfig(
        vocab_size=config_dict['vocab_size'],
        hidden_size=config_dict['hidden_size'],
        num_hidden_layers=config_dict['num_hidden_layers'],
        num_attention_heads=config_dict['num_attention_heads'],
        intermediate_size=config_dict['intermediate_size'],
        max_position_embeddings=config_dict['max_position_embeddings'],
        hidden_dropout_prob=0.1,
        attention_probs_dropout_prob=0.1,
    )
    
    model = BertForMaskedLM(config).to(device)
    
    # Load checkpoint if resuming
    checkpoint_manager = CheckpointManager(checkpoint_dir)
    start_epoch = 0
    start_step = 0
    
    if resume_from:
        logger.info(f"Resuming from checkpoint: {resume_from}")
        try:
            start_epoch, start_step = checkpoint_manager.load_checkpoint(
                model, optimizer=None, checkpoint_path=resume_from
            )
        except Exception as e:
            logger.warning(f"Could not resume checkpoint: {e}")
    
    # Create data loaders
    logger.info("Creating data loaders")
    train_loader, eval_loader = create_data_loaders(
        corpus, tokenizer, batch_size=batch_size, max_length=512, train_ratio=0.95
    )
    logger.info(f"Train: {len(train_loader)} batches, Eval: {len(eval_loader)} batches")
    
    # Optimizer and scheduler
    optimizer = AdamW(model.parameters(), lr=learning_rate, weight_decay=0.01)
    total_steps = max_steps
    warmup_pct = warmup_steps / total_steps
    
    scheduler = get_linear_schedule_with_warmup(
        optimizer,
        num_warmup_steps=warmup_steps,
        num_training_steps=total_steps
    )
    
    # Training loop
    logger.info(f"Starting training for {max_steps} steps")
    model.train()
    global_step = start_step
    epoch = start_epoch
    best_eval_loss = float('inf')
    
    try:
        while global_step < max_steps:
            epoch += 1
            logger.info(f"\n=== Epoch {epoch} ===")
            
            epoch_loss = 0.0
            num_batches = 0
            
            for batch_idx, batch in enumerate(train_loader):
                # Move to device
                batch = {k: v.to(device) for k, v in batch.items()}
                
                # Forward pass
                outputs = model(**batch)
                loss = outputs.loss
                
                # Backward pass
                loss.backward()
                
                # Gradient accumulation
                if (batch_idx + 1) % gradient_accumulation_steps == 0:
                    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                    optimizer.step()
                    scheduler.step()
                    optimizer.zero_grad()
                    
                    global_step += 1
                
                epoch_loss += loss.item()
                num_batches += 1
                
                # Logging
                if global_step % 100 == 0:
                    avg_loss = epoch_loss / num_batches
                    logger.info(f"Step {global_step}/{max_steps} - Loss: {avg_loss:.4f}")
                
                # Evaluation
                if global_step % eval_steps == 0 and global_step > 0:
                    eval_loss = evaluate(model, eval_loader, device)
                    logger.info(f"Eval loss: {eval_loss:.4f}")
                    
                    # Save checkpoint
                    if eval_loss < best_eval_loss:
                        best_eval_loss = eval_loss
                        checkpoint_manager.save_checkpoint(
                            model, optimizer, epoch, global_step,
                            {'eval_loss': eval_loss, 'train_loss': epoch_loss / num_batches}
                        )
                
                if global_step >= max_steps:
                    break
            
            logger.info(f"Epoch {epoch} - Avg Loss: {epoch_loss / num_batches:.4f}")
    
    except KeyboardInterrupt:
        logger.info("Training interrupted by user")
    
    # Final checkpoint
    logger.info("Saving final checkpoint")
    checkpoint_manager.save_checkpoint(
        model, optimizer, epoch, global_step,
        {'final': True}
    )
    
    logger.info(f"✓ Training complete. Trained for {global_step} steps over {epoch} epochs")
    logger.info(f"Checkpoints saved to: {checkpoint_dir}")


def evaluate(model, eval_loader, device) -> float:
    """Evaluate model on eval set."""
    model.eval()
    total_loss = 0.0
    num_batches = 0
    
    with torch.no_grad():
        for batch in eval_loader:
            batch = {k: v.to(device) for k, v in batch.items()}
            outputs = model(**batch)
            total_loss += outputs.loss.item()
            num_batches += 1
    
    model.train()
    return total_loss / num_batches if num_batches > 0 else 0.0


def main():
    parser = argparse.ArgumentParser(
        description='Train small medical encoder from scratch'
    )
    
    # Corpus building
    parser.add_argument('--build-corpus', action='store_true',
                       help='Build medical corpus from raw data')
    parser.add_argument('--corpus-source', type=str, default='output/',
                       help='Source directory/file for corpus')
    parser.add_argument('--output-corpus', type=str, default='corpus/medical_corpus.jsonl',
                       help='Output path for corpus')
    parser.add_argument('--limit-tokens', type=int, default=None,
                       help='Limit corpus to N tokens')
    
    # Training
    parser.add_argument('--train', action='store_true',
                       help='Train encoder')
    parser.add_argument('--corpus', type=str, default='corpus/medical_corpus.jsonl',
                       help='Path to training corpus')
    parser.add_argument('--model-size', type=str, default='small',
                       choices=['tiny', 'small', 'medium', 'base'],
                       help='Model size preset')
    parser.add_argument('--batch-size', type=int, default=32,
                       help='Training batch size')
    parser.add_argument('--learning-rate', type=float, default=1e-4,
                       help='Learning rate')
    parser.add_argument('--max-steps', type=int, default=100000,
                       help='Maximum training steps')
    parser.add_argument('--warmup-steps', type=int, default=10000,
                       help='Warmup steps')
    parser.add_argument('--eval-steps', type=int, default=5000,
                       help='Evaluation frequency (steps)')
    parser.add_argument('--checkpoint-dir', type=str, default='checkpoints/medical_encoder/',
                       help='Checkpoint directory')
    parser.add_argument('--resume-from', type=str, default=None,
                       help='Resume from checkpoint path')
    parser.add_argument('--gradient-accumulation-steps', type=int, default=1,
                       help='Gradient accumulation steps')
    
    args = parser.parse_args()
    
    # Build corpus
    if args.build_corpus:
        build_corpus(args.corpus_source, args.output_corpus, args.limit_tokens)
    
    # Train
    if args.train:
        train_encoder(
            corpus_path=args.corpus,
            model_size=args.model_size,
            batch_size=args.batch_size,
            learning_rate=args.learning_rate,
            max_steps=args.max_steps,
            warmup_steps=args.warmup_steps,
            eval_steps=args.eval_steps,
            checkpoint_dir=args.checkpoint_dir,
            resume_from=args.resume_from,
            gradient_accumulation_steps=args.gradient_accumulation_steps,
        )


if __name__ == '__main__':
    main()
