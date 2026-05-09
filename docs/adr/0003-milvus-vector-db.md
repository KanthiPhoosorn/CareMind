---
title: "0003 - Milvus as Vector DB for CareMind"
status: accepted
deciders: [KanthiPhoosorn]
date: 2026-05-09
tags: [infrastructure, vector-db, privacy]
---

Context
-------

CareMind requires an on-prem / self-hosted vector database that:

- Supports high-performance similarity search for clinical embeddings.
- Can be operated within a hospital or private cloud (no external API keys).
- Provides production-grade deployment options (Kubernetes, Docker), RBAC, and encryption-at-rest / in-transit.

Decision
--------

We will use Milvus as the primary vector database for CareMind ingestion and retrieval. Milvus meets the requirements for self-hosted deployments, mature production features, and an active ecosystem for integrations (pymilvus, operators).

Consequences
------------

- Pros:
  - Self-hosted: fits ADR 0002 requirement to avoid third-party LLM providers.
  - Scalable: supports large collections and GPU acceleration when available.
  - Metadata support: allows storing patient-scoped metadata to enable tenant isolation and filtered searches.

- Cons / Caveats:
  - Operational overhead: requires running Milvus (K8s/operator recommended) and backups.
  - Security: must be deployed with network controls, TLS, and disk encryption to meet hospital security policies.
  - Audit: search and upsert operations should be logged in Supabase audit tables to capture who queried which patient data.

Implementation Notes
--------------------

- Ingestion:
  - Use `scripts/ingest_to_milvus.py` for format-agnostic chunking and deterministic local embeddings (TF-IDF+SVD) for testing.
  - Production: replace local embedder with `LOCAL_EMBEDDING_MODEL` service and generate embeddings before upsert.
  - Ensure PHI redaction and consent checks occur before embedding/upsert, per `QUALITY.md`.

- Deployment:
  - Recommend Kubernetes with the Milvus operator and persisted volumes.
  - Configure TLS for client-server communication and use cloud/hardware KMS for disk encryption keys.
  - Limit network exposure: allow only internal subnets and the application servers to access Milvus.

- Environment variables (to add to `.env.example`):
  - `MILVUS_HOST` — host/IP of Milvus server
  - `MILVUS_PORT` — port (example: `19530`)
  - `MILVUS_COLLECTION` — collection name for clinical chunks
  - `MILVUS_DIM` — embedding vector dimension
  - `MILVUS_USER` / `MILVUS_PASSWORD` — optional credentials for managed deployments

Security and Compliance
-----------------------

- Authentication: prefer mutual TLS or network-level authentication; use Milvus user/password only when supported and secured.
- Audit logging: all ingestion and search requests must be logged in Supabase audit tables with `hospital_id`, `user_id`, `patient_an`, and query metadata.
- Data lifecycle: provide scripts to delete patient-scoped vectors when requested (right-to-erasure) and to rotate keys appropriately.

Follow-ups
----------

- Add a deployment ADR that documents the chosen Helm chart/operator, storage class, and backup strategy.
- Implement production `ingest_to_milvus` runner that calls the `LOCAL_EMBEDDING_MODEL` and upserts embeddings atomically.
