# ADR 0002 — Local Model Citation Chatbots

**Status:** accepted
**Date:** 2026-05-08

## Context

CareMind now has two AI use cases that must stay inside our own infrastructure:

- Patient chatbot for symptom screening, queue guidance, and basic workflow help
- Staff chatbot for clinical summaries, handoff support, and record navigation

The hospital data model is tenant-scoped and PHI-sensitive. The new `data/` folder contains hospital case files that can seed a local retrieval corpus, but the system must not rely on external LLM APIs. The same chatbot stack must work across Thai hospitals with different HIS layouts and still preserve row-level isolation.

## Decision

Use a **self-hosted local model stack** as the only AI provider for CareMind.

- All AI requests go through a single backend abstraction in `shared/services/ai.ts`
- The backend owns prompt assembly, retrieval, citation enforcement, and response validation
- Patient and staff assistants are separate products with separate prompts, scopes, and permissions
- Answers are citation-based: no clinical claim is allowed without retrieved evidence attached to it
- Retrieval must always enforce hospital, role, and patient boundaries before model generation
- The local model runtime, embedding model, and vector store are deployment choices, not product dependencies

## Consequences

- Stronger privacy posture because PHI stays inside our controlled environment
- Lower vendor dependency and easier deployment to hospitals that cannot use public AI APIs
- Better long-term fit for Thai hospital HIS variation because adapters can normalize source data before retrieval
- Higher operational burden because we now own model hosting, capacity planning, updates, and monitoring
- Product quality depends on retrieval quality, citation coverage, and PHI-safe prompt construction more than raw model size

## Follow-up work

- Define the local inference runtime and deployment topology
- Build document ingestion for `data/` and `sample_data/`
- Add chunking, metadata tagging, and citation storage
- Implement role-aware retrieval filters and audit logging
- Create evaluation tests for citation accuracy, hallucination rate, and cross-tenant leakage