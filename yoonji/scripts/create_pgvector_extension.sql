-- Enable pgvector for production-style vector search.
-- Run this once on the target PostgreSQL database with a role that can create extensions.

CREATE EXTENSION IF NOT EXISTS vector;

-- Phase 2 stores embeddings on content_chunks as JSON for portability while the
-- vector store boundary is still being built. When the project moves to a real
-- pgvector column, keep vector-specific DDL in migrations instead of ad hoc app code.
