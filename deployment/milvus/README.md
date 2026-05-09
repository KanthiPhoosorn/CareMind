Milvus (Docker Compose)
========================

This folder contains a Docker Compose stack for Milvus standalone local testing.

Quick start
-----------

1. From the repo root run:

```bash
cd deployment/milvus
docker compose up -d
```

If you are already inside `deployment/milvus`, run `docker compose up -d` directly.

2. Wait ~30-60s for Milvus to initialize. Check logs:

```bash
docker compose logs -f milvus-standalone
```

3. Run the ingest smoke test from the repo root (after installing `scripts/requirements-milvus.txt`):

```bash
pip install -r scripts/requirements-milvus.txt
python scripts/ingest_to_milvus.py --data-dir ./sample_data --milvus-host 127.0.0.1 --milvus-port 19530
```

Notes
-----

- This compose is intended for local development and testing only. For production, use the Milvus Operator / Helm and configure TLS, persistence, backups, and resource limits.
- If you run into connection timeouts, ensure Docker is running and that port `19530` is free on your host.
- The stack uses internal `etcd` and `minio` services, so only the Milvus gRPC port is exposed on the host.
