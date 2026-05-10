"""Small causal transformer for CareMind Phase 3.

This module provides:
- a simple word-level tokenizer optimized for small clinical corpus
- a tiny decoder-only transformer
- corpus collection helpers that extract from clinical JSON data
- a fast smoke-test training loop

The goal is a real, trainable,
local transformer that can overfit a small clinical corpus and generate
short, grounded text snippets for experimentation.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

import torch
import torch.nn as nn
import torch.nn.functional as F


SPECIAL_TOKENS = ["<pad>", "<bos>", "<eos>", "<unk>"]


@dataclass
class SmallTransformerConfig:
    block_size: int = 128
    embedding_dim: int = 128
    num_heads: int = 4
    num_layers: int = 2
    feedforward_dim: int = 256
    dropout: float = 0.1


class WordTokenizer:
    """Word-level tokenizer optimized for small clinical corpora."""
    
    def __init__(self, vocab: Sequence[str]):
        self.vocab = list(vocab)
        self.token_to_id = {token: index for index, token in enumerate(self.vocab)}
        self.pad_token = "<pad>"
        self.bos_token = "<bos>"
        self.eos_token = "<eos>"
        self.unk_token = "<unk>"
        self.pad_id = self.token_to_id[self.pad_token]
        self.bos_id = self.token_to_id[self.bos_token]
        self.eos_id = self.token_to_id[self.eos_token]
        self.unk_id = self.token_to_id[self.unk_token]

    @classmethod
    def build(cls, texts: Sequence[str], vocab_size: int = 2000, min_freq: int = 1) -> "WordTokenizer":
        """Build tokenizer from texts with smart sizing and frequency filtering.
        
        Args:
            texts: Training texts
            vocab_size: Target vocabulary size (will be adjusted for small corpora)
            min_freq: Minimum frequency required for a word to be in vocabulary
        """
        word_freq: dict[str, int] = {}
        for text in texts:
            words = cls._tokenize_text(text)
            for word in words:
                word_freq[word] = word_freq.get(word, 0) + 1
        
        # Filter by minimum frequency
        frequent_words = [(w, f) for w, f in word_freq.items() if f >= min_freq]
        
        # Adaptive vocabulary size based on corpus
        adjusted_vocab_size = max(200, min(vocab_size, len(frequent_words) + 4))
        
        # Keep only top frequency words
        sorted_words = sorted(frequent_words, key=lambda x: x[1], reverse=True)
        top_words = [word for word, _ in sorted_words[:adjusted_vocab_size - 4]]
        
        vocab = SPECIAL_TOKENS + top_words
        return cls(vocab)

    @staticmethod
    def _tokenize_text(text: str) -> list[str]:
        """Smart tokenization preserving medical values and abbreviations."""
        text = text.lower()
        # Normalize spacing around punctuation
        text = re.sub(r'([.!?,;"\'()])', r' \1 ', text)
        # Normalize multiple spaces
        text = re.sub(r'\s+', ' ', text)
        tokens = text.split()
        # Filter: keep tokens that aren't pure punctuation
        result = []
        for t in tokens:
            if len(t) > 0 and not all(c in '.:;,!?\'" ' for c in t):
                result.append(t)
        return result

    def encode(self, text: str, add_special_tokens: bool = True) -> list[int]:
        words = self._tokenize_text(text)
        token_ids = [self.token_to_id.get(word, self.unk_id) for word in words]
        if add_special_tokens:
            return [self.bos_id] + token_ids + [self.eos_id]
        return token_ids

    def decode(self, token_ids: Sequence[int]) -> str:
        decoded_words: list[str] = []
        for token_id in token_ids:
            if token_id in {self.bos_id, self.eos_id, self.pad_id}:
                continue
            if 0 <= token_id < len(self.vocab):
                token = self.vocab[token_id]
                decoded_words.append("?" if token == self.unk_token else token)
            else:
                decoded_words.append("?")
        return " ".join(decoded_words)


def build_demo_corpus() -> list[str]:
    """Fallback corpus when sample_data not available."""
    return [
        "Patient has fever and cough. Vitals are stable. Monitor symptoms and provide supportive care.",
        "Lab results show elevated WBC. Culture pending. Continue antibiotic treatment as ordered.",
        "Chest X-ray shows mild infiltrates. Recommend pulmonary follow-up in one week.",
        "Acetaminophen prescribed for fever. Patient should rest, hydrate, and take medication as directed.",
        "Appointment scheduled for follow-up review. Patient should bring prior lab results and medication list.",
    ]


def get_clinical_prompts() -> list[str]:
    """Common clinical prompts for generation experimentation."""
    return [
        "Patient has",
        "Patient presents with",
        "Lab results show",
        "Vital signs include",
        "Chest X-ray shows",
        "Recommendation",
        "Continue",
        "Monitor",
    ]


def _extract_json_texts(file_path: Path) -> list[str]:
    """Extract clinical text from JSON clinical data files."""
    try:
        data = json.loads(file_path.read_text(encoding="utf-8", errors="ignore"))
    except Exception:
        return []

    texts = []
    if isinstance(data, list):
        for record in data:
            if isinstance(record, dict):
                texts.extend(_extract_from_record(record))
    elif isinstance(data, dict):
        texts.extend(_extract_from_record(data))
    
    # Filter: minimum length, no JSON/XML artifacts, mostly alphanumeric
    cleaned_texts = []
    for text in texts:
        if not text or len(text.split()) < 2:
            continue
        # Skip if too many special characters
        special_count = sum(1 for c in text if c in '{}[]:;"\'')
        if special_count > len(text) * 0.15:
            continue
        # Skip if malformed (too many digits mixed with text oddly)
        malformed_score = sum(1 for i, c in enumerate(text) if c.isdigit() and i > 0 and text[i-1].isalpha())
        if malformed_score > len(text) * 0.2:
            continue
        cleaned_texts.append(text)
    
    return cleaned_texts


def _extract_from_record(record: dict) -> list[str]:
    """Extract text fields from a clinical record."""
    texts = []
    
    # Priority 1: Lab interpretations and clinical findings
    if "interpretation" in record and isinstance(record["interpretation"], str):
        text = record["interpretation"].strip()
        if text and not any(c in text for c in ['[', ']', '{', '}']):
            texts.append(text)
    
    if "findings" in record and isinstance(record["findings"], str):
        text = record["findings"].strip()
        if text and not any(c in text for c in ['[', ']', '{', '}']):
            texts.append(text)
    
    if "impression" in record and isinstance(record["impression"], str):
        text = record["impression"].strip()
        if text and not any(c in text for c in ['[', ']', '{', '}']):
            texts.append(text)
    
    # Priority 2: Narrative notes
    for key in ["notes", "note", "clinical_note", "nurse_note", "doctor_note", "assessment", "plan"]:
        if key in record and isinstance(record[key], str):
            text = record[key].strip()
            if text and len(text) > 10:  # Only substantial notes
                texts.append(text)
    
    # Priority 3: Key clinical findings from structured data (avoid repetitive patterns)
    if "results" in record and isinstance(record["results"], dict):
        abnormal_findings = []
        for test_name, values in record["results"].items():
            if isinstance(values, dict) and "flag" in values:
                flag = str(values.get("flag", "")).lower()
                # Only include abnormal findings to reduce repetition
                if flag in ["high", "elevated", "low", "abnormal"]:
                    value = values.get("value", "")
                    abnormal_findings.append(f"{test_name} {flag} at {value}")
        if abnormal_findings:
            # Create a single sentence from multiple findings (limit to 3)
            finding_text = "Lab abnormalities: " + ", ".join(abnormal_findings[:3])
            if len(finding_text) > 15:
                texts.append(finding_text)
    
    return texts


def _read_text_file(file_path: Path) -> str:
    try:
        return file_path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""


def collect_corpus_texts(data_roots: Sequence[str | Path] | None = None) -> list[str]:
    """Collect clinical text corpus from sample_data JSON files."""
    candidate_roots = [Path(root) for root in data_roots] if data_roots else []
    repo_root = Path(__file__).resolve().parents[1]
    for default_name in ["sample_data", "data", "caremind_data"]:
        candidate_roots.append(repo_root / default_name)

    # Only extract from clinical JSON files, not documentation
    clinical_file_patterns = [
        "*_clean.json",  # Prefer cleaned data
        "doc*.json",
        "drug*.json", 
        "lab*.json",
        "nurse*.json",
        "xray*.json",
    ]

    discovered_files: list[Path] = []
    for root in candidate_roots:
        if not root.exists():
            continue
        for pattern in clinical_file_patterns:
            discovered_files.extend(root.glob(pattern))

    discovered_files = sorted({path for path in discovered_files if path.is_file()})
    if not discovered_files:
        return build_demo_corpus()

    texts: list[str] = []

    # Process JSON files
    for file_path in discovered_files:
        json_texts = _extract_json_texts(file_path)
        texts.extend(json_texts)

    # Fallback if no texts extracted
    return texts if texts else build_demo_corpus()


class CausalSelfAttention(nn.Module):
    def __init__(self, embedding_dim: int, num_heads: int, dropout: float):
        super().__init__()
        if embedding_dim % num_heads != 0:
            raise ValueError("embedding_dim must be divisible by num_heads")
        self.num_heads = num_heads
        self.head_dim = embedding_dim // num_heads
        self.query_key_value = nn.Linear(embedding_dim, 3 * embedding_dim)
        self.projection = nn.Linear(embedding_dim, embedding_dim)
        self.dropout = nn.Dropout(dropout)

    def forward(self, hidden_states: torch.Tensor) -> torch.Tensor:
        batch_size, sequence_length, embedding_dim = hidden_states.shape
        qkv = self.query_key_value(hidden_states)
        qkv = qkv.view(batch_size, sequence_length, 3, self.num_heads, self.head_dim)
        query, key, value = qkv.unbind(dim=2)
        query = query.transpose(1, 2)
        key = key.transpose(1, 2)
        value = value.transpose(1, 2)

        attention_scores = (query @ key.transpose(-2, -1)) / math.sqrt(self.head_dim)
        causal_mask = torch.triu(
            torch.ones(sequence_length, sequence_length, device=hidden_states.device, dtype=torch.bool),
            diagonal=1,
        )
        attention_scores = attention_scores.masked_fill(causal_mask, float("-inf"))
        attention_weights = torch.softmax(attention_scores, dim=-1)
        attention_weights = self.dropout(attention_weights)
        attended = attention_weights @ value
        attended = attended.transpose(1, 2).contiguous().view(batch_size, sequence_length, embedding_dim)
        return self.projection(attended)


class TransformerBlock(nn.Module):
    def __init__(self, embedding_dim: int, num_heads: int, feedforward_dim: int, dropout: float):
        super().__init__()
        self.attention_norm = nn.LayerNorm(embedding_dim)
        self.attention = CausalSelfAttention(embedding_dim, num_heads, dropout)
        self.ffn_norm = nn.LayerNorm(embedding_dim)
        self.feedforward = nn.Sequential(
            nn.Linear(embedding_dim, feedforward_dim),
            nn.GELU(),
            nn.Linear(feedforward_dim, embedding_dim),
            nn.Dropout(dropout),
        )

    def forward(self, hidden_states: torch.Tensor) -> torch.Tensor:
        hidden_states = hidden_states + self.attention(self.attention_norm(hidden_states))
        hidden_states = hidden_states + self.feedforward(self.ffn_norm(hidden_states))
        return hidden_states


class SmallCausalTransformer(nn.Module):
    def __init__(self, vocab_size: int, config: SmallTransformerConfig):
        super().__init__()
        self.config = config
        self.token_embedding = nn.Embedding(vocab_size, config.embedding_dim)
        self.position_embedding = nn.Embedding(config.block_size, config.embedding_dim)
        self.dropout = nn.Dropout(config.dropout)
        self.blocks = nn.ModuleList(
            [
                TransformerBlock(
                    embedding_dim=config.embedding_dim,
                    num_heads=config.num_heads,
                    feedforward_dim=config.feedforward_dim,
                    dropout=config.dropout,
                )
                for _ in range(config.num_layers)
            ]
        )
        self.final_norm = nn.LayerNorm(config.embedding_dim)
        self.lm_head = nn.Linear(config.embedding_dim, vocab_size, bias=False)

    def forward(self, input_ids: torch.Tensor, targets: torch.Tensor | None = None):
        batch_size, sequence_length = input_ids.shape
        if sequence_length > self.config.block_size:
            input_ids = input_ids[:, -self.config.block_size :]
            sequence_length = input_ids.shape[1]

        position_ids = torch.arange(sequence_length, device=input_ids.device).unsqueeze(0)
        hidden_states = self.token_embedding(input_ids) + self.position_embedding(position_ids)
        hidden_states = self.dropout(hidden_states)

        for block in self.blocks:
            hidden_states = block(hidden_states)

        logits = self.lm_head(self.final_norm(hidden_states))
        loss = None
        if targets is not None:
            loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1))
        return logits, loss

    @torch.no_grad()
    def generate(
        self,
        input_ids: torch.Tensor,
        max_new_tokens: int = 80,
        temperature: float = 1.0,
        top_k: int | None = None,
    ) -> torch.Tensor:
        for _ in range(max_new_tokens):
            context = input_ids[:, -self.config.block_size :]
            logits, _ = self(context)
            next_token_logits = logits[:, -1, :] / max(temperature, 1e-6)
            if top_k is not None:
                top_values, _ = torch.topk(next_token_logits, k=min(top_k, next_token_logits.size(-1)))
                cutoff = top_values[:, -1].unsqueeze(-1)
                next_token_logits = torch.where(
                    next_token_logits < cutoff,
                    torch.full_like(next_token_logits, float("-inf")),
                    next_token_logits,
                )
            probabilities = torch.softmax(next_token_logits, dim=-1)
            next_token = torch.multinomial(probabilities, num_samples=1)
            input_ids = torch.cat([input_ids, next_token], dim=1)
        return input_ids


def make_training_tensor(tokenizer: WordTokenizer, texts: Sequence[str], device: torch.device) -> torch.Tensor:
    """Concatenate all texts and encode into token IDs."""
    merged_text = " ".join(texts)  # Join with space instead of newlines for word tokenizer
    token_ids = tokenizer.encode(merged_text)
    if len(token_ids) < 8:
        token_ids = tokenizer.encode(" ".join(build_demo_corpus()))
    return torch.tensor(token_ids, dtype=torch.long, device=device)


def sample_batch(token_ids: torch.Tensor, block_size: int, batch_size: int) -> tuple[torch.Tensor, torch.Tensor]:
    """Sample random batches for training."""
    max_start = token_ids.size(0) - block_size - 1
    if max_start <= 0:
        raise ValueError("Corpus is too small for the configured block size")
    start_indices = torch.randint(0, max_start, (batch_size,), device=token_ids.device)
    input_batches = torch.stack([token_ids[start : start + block_size] for start in start_indices])
    target_batches = torch.stack([token_ids[start + 1 : start + 1 + block_size] for start in start_indices])
    return input_batches, target_batches


def train_small_transformer(
    texts: Sequence[str],
    config: SmallTransformerConfig | None = None,
    *,
    steps: int = 120,
    batch_size: int = 16,
    learning_rate: float = 3e-4,
    seed: int = 42,
    device: str | None = None,
    min_word_freq: int = 1,
) -> tuple[SmallCausalTransformer, WordTokenizer, list[float]]:
    """Train a small transformer on clinical texts.
    
    Args:
        texts: Training texts
        config: Model configuration
        steps: Training steps
        batch_size: Batch size
        learning_rate: Learning rate
        seed: Random seed
        device: Device to train on
        min_word_freq: Minimum word frequency to be included in vocabulary
    """
    if not texts:
        texts = build_demo_corpus()

    config = config or SmallTransformerConfig()
    # Adaptively size vocabulary based on corpus
    tokenizer = WordTokenizer.build(texts, vocab_size=800, min_freq=min_word_freq)
    config.vocab_size = len(tokenizer.vocab)

    training_device = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
    random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

    token_ids = make_training_tensor(tokenizer, texts, training_device)
    model = SmallCausalTransformer(vocab_size=config.vocab_size, config=config).to(training_device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)

    losses: list[float] = []
    model.train()
    for step in range(steps):
        input_batch, target_batch = sample_batch(token_ids, config.block_size, batch_size)
        optimizer.zero_grad(set_to_none=True)
        _, loss = model(input_batch, target_batch)
        assert loss is not None
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        losses.append(float(loss.item()))
        if (step + 1) % max(1, steps // 4) == 0:
            print(f"step {step + 1}/{steps} loss={loss.item():.4f}")

    return model, tokenizer, losses


@torch.no_grad()
def generate_text(
    model: SmallCausalTransformer,
    tokenizer: WordTokenizer,
    prompt: str,
    *,
    max_new_tokens: int = 80,
    temperature: float = 0.8,
    top_k: int = 20,
    device: str | None = None,
    min_confidence: float = 0.1,
) -> str:
    """Generate text with confidence-based filtering to avoid nonsense.
    
    Args:
        model: Trained transformer
        tokenizer: Word tokenizer
        prompt: Starting text
        max_new_tokens: Maximum tokens to generate
        temperature: Sampling temperature (higher = more random)
        top_k: Top-k sampling cutoff
        device: Device to run on
        min_confidence: Minimum confidence (max prob) to accept a token, else use unk
    """
    generation_device = torch.device(device or next(model.parameters()).device)
    model.eval()
    input_ids = torch.tensor([tokenizer.encode(prompt)], dtype=torch.long, device=generation_device)
    
    # Generate with confidence tracking
    generated_ids = []
    current_ids = input_ids[0].tolist()
    
    for _ in range(max_new_tokens):
        # Get predictions for next token
        context = torch.tensor([current_ids[-model.config.block_size:]], dtype=torch.long, device=generation_device)
        logits, _ = model(context)
        next_token_logits = logits[:, -1, :] / max(temperature, 1e-6)
        
        # Top-k sampling
        if top_k is not None:
            top_values, _ = torch.topk(next_token_logits, k=min(top_k, next_token_logits.size(-1)))
            cutoff = top_values[:, -1].unsqueeze(-1)
            next_token_logits = torch.where(
                next_token_logits < cutoff,
                torch.full_like(next_token_logits, float("-inf")),
                next_token_logits,
            )
        
        probs = torch.softmax(next_token_logits, dim=-1)
        max_prob = probs.max().item()
        
        # If confidence too low, use special token to skip
        if max_prob < min_confidence:
            next_token = torch.tensor([[tokenizer.unk_id]], device=generation_device)
        else:
            next_token = torch.multinomial(probs, num_samples=1)
        
        next_id = next_token[0, 0].item()
        if next_id == tokenizer.eos_id:
            break  # Stop on EOS token
        
        current_ids.append(next_id)
        generated_ids.append(next_id)
    
    return tokenizer.decode(current_ids)


def smoke_test() -> None:
    """Run a comprehensive smoke test showing different generation prompts."""
    texts = collect_corpus_texts()
    print(f"Loaded {len(texts)} training snippets")
    
    # Train with appropriate settings for small corpus
    config = SmallTransformerConfig(
        block_size=96,
        embedding_dim=96,
        num_heads=4,
        num_layers=2,
        feedforward_dim=192,
        dropout=0.05,
    )
    model, tokenizer, losses = train_small_transformer(
        texts,
        config=config,
        steps=80,  # Longer training for better convergence
        batch_size=8,
        learning_rate=5e-4,
        min_word_freq=1,
    )
    
    print(f"\nFinal training loss: {losses[-1]:.4f}")
    print(f"Loss improvement: {losses[0] - losses[-1]:.4f}")
    print(f"Vocabulary size: {len(tokenizer.vocab)} tokens\n")
    
    # Test different prompts
    test_prompts = [
        "Patient has",
        "Lab results show",
        "Continue",
        "Vital signs",
    ]
    
    print("Generation samples:")
    print("-" * 70)
    for prompt in test_prompts:
        generated = generate_text(
            model,
            tokenizer,
            prompt,
            max_new_tokens=30,
            temperature=0.65,  # Slightly lower for coherence
            top_k=15,
            min_confidence=0.10,  # Higher to avoid unknowns
        )
        print(f"Prompt: {prompt!r}")
        print(f"Generated: {generated}")
        print()


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Train a small causal transformer for CareMind")
    parser.add_argument("--data-root", action="append", default=[], help="Optional root directory with clinical files")
    parser.add_argument("--steps", type=int, default=120, help="Training steps")
    parser.add_argument("--batch-size", type=int, default=16, help="Batch size")
    parser.add_argument("--block-size", type=int, default=128, help="Context length")
    parser.add_argument("--embedding-dim", type=int, default=128, help="Transformer embedding size")
    parser.add_argument("--num-heads", type=int, default=4, help="Attention heads")
    parser.add_argument("--num-layers", type=int, default=2, help="Transformer blocks")
    parser.add_argument("--feedforward-dim", type=int, default=256, help="Feed-forward width")
    parser.add_argument("--dropout", type=float, default=0.1, help="Dropout probability")
    parser.add_argument("--learning-rate", type=float, default=3e-4, help="Optimizer learning rate")
    parser.add_argument("--prompt", default="Patient has", help="Generation prompt (try: 'Patient has', 'Lab results show', 'Continue')")
    parser.add_argument("--max-new-tokens", type=int, default=40, help="Generated token count")
    parser.add_argument("--temperature", type=float, default=0.7, help="Sampling temperature (lower=deterministic, higher=random)")
    parser.add_argument("--min-confidence", type=float, default=0.05, help="Minimum confidence for token acceptance")
    parser.add_argument("--smoke-test", action="store_true", help="Run a comprehensive smoke test with multiple prompts")
    return parser


def main() -> None:
    parser = build_arg_parser()
    args = parser.parse_args()

    if args.smoke_test:
        smoke_test()
        return

    texts = collect_corpus_texts(args.data_root)
    print(f"Loaded {len(texts)} clinical snippets from corpus")
    
    config = SmallTransformerConfig(
        block_size=args.block_size,
        embedding_dim=args.embedding_dim,
        num_heads=args.num_heads,
        num_layers=args.num_layers,
        feedforward_dim=args.feedforward_dim,
        dropout=args.dropout,
    )
    
    print(f"Training for {args.steps} steps with batch_size={args.batch_size}...")
    model, tokenizer, losses = train_small_transformer(
        texts,
        config=config,
        steps=args.steps,
        batch_size=args.batch_size,
        learning_rate=args.learning_rate,
        min_word_freq=1,
    )
    
    print(f"\nTraining complete. Final loss: {losses[-1]:.4f}")
    print(f"Vocabulary size: {len(tokenizer.vocab)} tokens")
    
    # Generate with specified parameters
    generated_text = generate_text(
        model,
        tokenizer,
        args.prompt,
        max_new_tokens=args.max_new_tokens,
        temperature=args.temperature,
        top_k=20,
        min_confidence=args.min_confidence,
    )
    
    print(f"\nGeneration Results:")
    print(f"Prompt: {args.prompt!r}")
    print(f"Generated text:\n{generated_text}")


if __name__ == "__main__":
    main()
