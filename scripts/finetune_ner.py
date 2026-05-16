#!/usr/bin/env python3
"""
Fine-tune medical encoder for Named Entity Recognition (NER).

Finetunes the pre-trained encoder on clinician-labeled NER data.
Target: 500-1000 labeled notes by end of week 4.

Entity types: DRUG, DISEASE, SYMPTOM, LAB, DOSAGE, VITAL, ANATOMY, PROCEDURE

Usage:
    # Fine-tune for NER
    python finetune_ner.py --train \
        --pretrained-model checkpoints/medical_encoder/checkpoint-epoch2-step50000/ \
        --train-data ner_data/ner_train.json \
        --output-dir checkpoints/medical_ner/ \
        --batch-size 16 \
        --max-epochs 10
    
    # Evaluate on test set
    python finetune_ner.py --evaluate \
        --model-path checkpoints/medical_ner/best_model/ \
        --test-data ner_data/ner_test.json
    
    # Generate 500+ labeled examples from unlabeled data
    python finetune_ner.py --generate-labels \
        --model-path checkpoints/medical_ner/best_model/ \
        --unlabeled-data ner_data/unlabeled_clinical_notes.jsonl \
        --output-labels ner_data/ner_generated.json
"""

import os
import sys
import json
import argparse
import logging
from pathlib import Path
from typing import List, Dict, Tuple, Optional, Any

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torch.optim import AdamW

try:
    from transformers import (
        AutoTokenizer, AutoModel, AutoModelForTokenClassification,
        get_linear_schedule_with_warmup
    )
    from seqeval.metrics import classification_report, f1_score, precision_score, recall_score
except ImportError:
    raise ImportError("pip install transformers torch seqeval")

sys.path.insert(0, os.path.dirname(__file__))
from training_utils import CheckpointManager, set_seed, get_device

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)


# NER tag to ID mapping
NER_TAGS = {
    'O': 0,  # Outside
    'B-DRUG': 1, 'I-DRUG': 2,
    'B-DISEASE': 3, 'I-DISEASE': 4,
    'B-SYMPTOM': 5, 'I-SYMPTOM': 6,
    'B-LAB': 7, 'I-LAB': 8,
    'B-DOSAGE': 9, 'I-DOSAGE': 10,
    'B-VITAL': 11, 'I-VITAL': 12,
    'B-ANATOMY': 13, 'I-ANATOMY': 14,
    'B-PROCEDURE': 15, 'I-PROCEDURE': 16,
}

ID_TO_TAGS = {v: k for k, v in NER_TAGS.items()}


class NERDataset(Dataset):
    """PyTorch dataset for NER task."""
    
    def __init__(self, examples: List[Dict], tokenizer, max_length: int = 512):
        self.examples = examples
        self.tokenizer = tokenizer
        self.max_length = max_length
    
    def __len__(self) -> int:
        return len(self.examples)
    
    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        example = self.examples[idx]
        text = example['text']
        entities = example.get('entities', [])
        
        # Create token-level labels
        tokens = text.split()
        labels = ['O'] * len(tokens)
        
        for entity in entities:
            entity_text = entity['text']
            entity_type = entity['type']
            start = entity.get('start', 0)
            end = entity.get('end', start + len(entity_text))
            
            # Find tokens within this entity span
            char_pos = 0
            for token_idx, token in enumerate(tokens):
                token_start = text.find(token, char_pos)
                if token_start == -1:
                    continue
                token_end = token_start + len(token)
                char_pos = token_end
                
                # Check if token overlaps with entity
                if token_start < end and token_end > start:
                    if token_start == start:
                        labels[token_idx] = f'B-{entity_type}'
                    else:
                        labels[token_idx] = f'I-{entity_type}'
        
        # Tokenize with subword handling
        encoding = self.tokenizer(
            tokens,
            max_length=self.max_length,
            padding='max_length',
            truncation=True,
            is_split_into_words=True,
            return_tensors='pt'
        )
        
        # Align labels with subword tokens
        word_ids = encoding.word_ids()
        label_ids = []
        
        for word_id in word_ids:
            if word_id is None:
                label_ids.append(-100)  # Special tokens
            else:
                if word_id < len(labels):
                    label_ids.append(NER_TAGS[labels[word_id]])
                else:
                    label_ids.append(0)  # O tag
        
        return {
            'input_ids': encoding['input_ids'].squeeze(),
            'attention_mask': encoding['attention_mask'].squeeze(),
            'token_type_ids': encoding.get('token_type_ids', torch.zeros_like(encoding['input_ids'])).squeeze(),
            'labels': torch.tensor(label_ids)
        }


class NERModel(nn.Module):
    """Fine-tuned encoder for NER task."""
    
    def __init__(self, pretrained_model_name: str, num_labels: int = 17):
        super().__init__()
        self.encoder = AutoModel.from_pretrained(pretrained_model_name)
        self.dropout = nn.Dropout(0.1)
        self.classifier = nn.Linear(self.encoder.config.hidden_size, num_labels)
    
    def forward(self, input_ids, attention_mask, token_type_ids=None, labels=None):
        outputs = self.encoder(
            input_ids=input_ids,
            attention_mask=attention_mask,
            token_type_ids=token_type_ids,
            return_dict=True
        )
        
        sequence_output = outputs.last_hidden_state
        sequence_output = self.dropout(sequence_output)
        logits = self.classifier(sequence_output)
        
        loss = None
        if labels is not None:
            loss_fn = nn.CrossEntropyLoss()
            active_loss = attention_mask.view(-1) == 1
            active_logits = logits.view(-1, 17)[active_loss]
            active_labels = labels.view(-1)[active_loss]
            loss = loss_fn(active_logits, active_labels)
        
        return {
            'logits': logits,
            'loss': loss
        }


def load_ner_data(file_path: str) -> List[Dict]:
    """Load NER training data from JSON."""
    with open(file_path, 'r', encoding='utf-8') as f:
        if file_path.endswith('.jsonl'):
            data = [json.loads(line) for line in f]
        else:
            data = json.load(f)
    
    return data if isinstance(data, list) else [data]


def finetune_ner(
    pretrained_model: str,
    train_data_path: str,
    output_dir: str = 'checkpoints/medical_ner/',
    batch_size: int = 16,
    learning_rate: float = 2e-5,
    max_epochs: int = 10,
    max_steps: int = None,
    warmup_steps: int = 500,
    eval_ratio: float = 0.1,
) -> None:
    """Fine-tune model on NER task."""
    
    logger.info("Starting NER fine-tuning")
    set_seed(42)
    device = get_device()
    
    # Load data
    logger.info(f"Loading training data from {train_data_path}")
    train_data = load_ner_data(train_data_path)
    logger.info(f"Loaded {len(train_data)} examples")
    
    # Split train/eval
    num_eval = int(len(train_data) * eval_ratio)
    eval_data = train_data[:num_eval]
    train_data = train_data[num_eval:]
    
    logger.info(f"Train: {len(train_data)}, Eval: {len(eval_data)}")
    
    # Load tokenizer
    logger.info(f"Loading tokenizer from {pretrained_model}")
    tokenizer = AutoTokenizer.from_pretrained(pretrained_model)
    
    # Create datasets
    train_dataset = NERDataset(train_data, tokenizer)
    eval_dataset = NERDataset(eval_data, tokenizer)
    
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    eval_loader = DataLoader(eval_dataset, batch_size=batch_size)
    
    # Load model
    logger.info(f"Loading model from {pretrained_model}")
    model = NERModel(pretrained_model, num_labels=17).to(device)
    
    # Optimizer and scheduler
    optimizer = AdamW(model.parameters(), lr=learning_rate, weight_decay=0.01)
    total_steps = len(train_loader) * max_epochs if not max_steps else max_steps
    scheduler = get_linear_schedule_with_warmup(
        optimizer,
        num_warmup_steps=warmup_steps,
        num_training_steps=total_steps
    )
    
    # Training loop
    logger.info(f"Training for {max_epochs} epochs")
    checkpoint_manager = CheckpointManager(output_dir)
    best_f1 = 0.0
    global_step = 0
    
    for epoch in range(max_epochs):
        logger.info(f"\n=== Epoch {epoch + 1}/{max_epochs} ===")
        
        # Training
        model.train()
        epoch_loss = 0.0
        
        for batch_idx, batch in enumerate(train_loader):
            batch = {k: v.to(device) for k, v in batch.items()}
            
            outputs = model(**batch)
            loss = outputs['loss']
            
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            optimizer.zero_grad()
            
            epoch_loss += loss.item()
            global_step += 1
            
            if (batch_idx + 1) % 10 == 0:
                logger.info(f"Step {global_step} - Loss: {epoch_loss / (batch_idx + 1):.4f}")
            
            if max_steps and global_step >= max_steps:
                break
        
        # Evaluation
        logger.info("Evaluating...")
        eval_loss, metrics = evaluate_ner(model, eval_loader, device)
        logger.info(f"Eval Loss: {eval_loss:.4f}")
        logger.info(f"Eval F1: {metrics['f1']:.4f}")
        
        # Save best checkpoint
        if metrics['f1'] > best_f1:
            best_f1 = metrics['f1']
            logger.info("Saving best checkpoint")
            checkpoint_path = os.path.join(output_dir, 'best_model')
            os.makedirs(checkpoint_path, exist_ok=True)
            model.encoder.save_pretrained(checkpoint_path)
            tokenizer.save_pretrained(checkpoint_path)
    
    logger.info(f"✓ Fine-tuning complete. Best F1: {best_f1:.4f}")


def evaluate_ner(model, eval_loader, device) -> Tuple[float, Dict]:
    """Evaluate NER model."""
    model.eval()
    total_loss = 0.0
    all_predictions = []
    all_labels = []
    num_batches = 0
    
    with torch.no_grad():
        for batch in eval_loader:
            batch = {k: v.to(device) for k, v in batch.items()}
            
            outputs = model(**batch)
            loss = outputs['loss']
            logits = outputs['logits']
            
            total_loss += loss.item()
            num_batches += 1
            
            # Get predictions
            predictions = torch.argmax(logits, dim=-1)
            
            # Convert to tag sequences (ignoring padding)
            for pred, label, mask in zip(predictions, batch['labels'], batch['attention_mask']):
                pred_tags = [ID_TO_TAGS[p.item()] for p, m in zip(pred, mask) if m == 1]
                label_tags = [ID_TO_TAGS[l.item()] for l, m in zip(label, mask) if m == 1 and l.item() != -100]
                
                all_predictions.append(pred_tags)
                all_labels.append(label_tags)
    
    model.train()
    
    # Calculate metrics
    avg_loss = total_loss / num_batches if num_batches > 0 else 0.0
    f1 = f1_score(all_labels, all_predictions)
    precision = precision_score(all_labels, all_predictions)
    recall = recall_score(all_labels, all_predictions)
    
    return avg_loss, {
        'f1': f1,
        'precision': precision,
        'recall': recall
    }


def generate_labels_batch(
    model_path: str,
    unlabeled_data_path: str,
    output_path: str,
    batch_size: int = 32,
    confidence_threshold: float = 0.8
) -> None:
    """Generate labels for unlabeled data using fine-tuned model."""
    
    logger.info("Generating labels for unlabeled data")
    device = get_device()
    
    # Load model
    model = NERModel.from_pretrained(model_path).to(device)
    model.eval()
    
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    
    # Load unlabeled data
    with open(unlabeled_data_path, 'r') as f:
        unlabeled = [json.loads(line) for line in f]
    
    logger.info(f"Loaded {len(unlabeled)} unlabeled documents")
    
    # Predict labels
    predictions = []
    
    with torch.no_grad():
        for doc in unlabeled:
            text = doc['text']
            tokens = text.split()
            
            # Tokenize
            encoding = tokenizer(
                tokens,
                max_length=512,
                padding='max_length',
                truncation=True,
                is_split_into_words=True,
                return_tensors='pt'
            )
            
            # Forward pass
            inputs = {k: v.to(device) for k, v in encoding.items()}
            outputs = model(**inputs)
            logits = outputs['logits']
            
            # Get predictions and confidence
            probs = torch.softmax(logits, dim=-1)
            pred_ids = torch.argmax(logits, dim=-1)
            confidences = torch.max(probs, dim=-1).values
            
            # Extract entities with high confidence
            word_ids = encoding.word_ids()
            entities = []
            current_entity = None
            
            for word_idx, word_id in enumerate(word_ids):
                if word_id is None:
                    continue
                
                pred_id = pred_ids[0, word_idx].item()
                confidence = confidences[0, word_idx].item()
                
                if confidence < confidence_threshold:
                    continue
                
                tag = ID_TO_TAGS.get(pred_id, 'O')
                
                if tag == 'O':
                    if current_entity:
                        entities.append(current_entity)
                        current_entity = None
                elif tag.startswith('B-'):
                    if current_entity:
                        entities.append(current_entity)
                    entity_type = tag[2:]
                    current_entity = {
                        'type': entity_type,
                        'tokens': [tokens[word_id]] if word_id < len(tokens) else []
                    }
                elif tag.startswith('I-'):
                    if current_entity:
                        entity_type = tag[2:]
                        if current_entity['type'] == entity_type and word_id < len(tokens):
                            current_entity['tokens'].append(tokens[word_id])
            
            if current_entity:
                entities.append(current_entity)
            
            # Create prediction
            pred_doc = {
                'example_id': doc.get('example_id', f"generated_{len(predictions)}"),
                'text': text,
                'entities': [
                    {
                        'text': ' '.join(e['tokens']),
                        'type': e['type'],
                        'confidence': 0.85  # Placeholder
                    }
                    for e in entities
                ],
                'note_type': doc.get('note_type', 'unknown'),
                'source': 'model_generated'
            }
            
            predictions.append(pred_doc)
    
    # Save predictions
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(predictions, f, ensure_ascii=False, indent=2)
    
    logger.info(f"✓ Generated labels for {len(predictions)} documents")
    logger.info(f"Saved to {output_path}")


def main():
    parser = argparse.ArgumentParser(description='Fine-tune encoder for NER')
    
    parser.add_argument('--train', action='store_true', help='Fine-tune on NER data')
    parser.add_argument('--pretrained-model', type=str, default='bert-base-uncased',
                       help='Pre-trained model path')
    parser.add_argument('--train-data', type=str, required=False,
                       help='Training data path')
    parser.add_argument('--output-dir', type=str, default='checkpoints/medical_ner/',
                       help='Output directory')
    parser.add_argument('--batch-size', type=int, default=16,
                       help='Batch size')
    parser.add_argument('--learning-rate', type=float, default=2e-5,
                       help='Learning rate')
    parser.add_argument('--max-epochs', type=int, default=10,
                       help='Maximum epochs')
    parser.add_argument('--max-steps', type=int, default=None,
                       help='Maximum steps')
    
    parser.add_argument('--evaluate', action='store_true', help='Evaluate model')
    parser.add_argument('--model-path', type=str, help='Model path for evaluation')
    parser.add_argument('--test-data', type=str, help='Test data path')
    
    parser.add_argument('--generate-labels', action='store_true',
                       help='Generate labels for unlabeled data')
    parser.add_argument('--unlabeled-data', type=str, help='Unlabeled data path')
    parser.add_argument('--output-labels', type=str, help='Output labels path')
    
    args = parser.parse_args()
    
    if args.train and args.train_data:
        finetune_ner(
            pretrained_model=args.pretrained_model,
            train_data_path=args.train_data,
            output_dir=args.output_dir,
            batch_size=args.batch_size,
            learning_rate=args.learning_rate,
            max_epochs=args.max_epochs,
            max_steps=args.max_steps
        )
    
    elif args.generate_labels and args.unlabeled_data and args.output_labels:
        generate_labels_batch(
            model_path=args.model_path or args.output_dir + 'best_model/',
            unlabeled_data_path=args.unlabeled_data,
            output_path=args.output_labels
        )


if __name__ == '__main__':
    main()
