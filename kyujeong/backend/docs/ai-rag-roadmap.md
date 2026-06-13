# AI RAG Roadmap

## Current decision

The first AI MVP keeps the retrieval boundary inside the NestJS backend and does
not introduce LlamaIndex yet.

The next retrieval upgrade should be pgvector first, then LlamaIndex after the
data path is stable.

The current local PostgreSQL database does not expose the `vector` extension in
`pg_available_extensions`, so pgvector should not be enabled in this worktree
until the database image or managed database plan supports it.

## Why pgvector first

- The application already uses PostgreSQL and Prisma.
- Recommendation evidence must remain traceable to community posts.
- pgvector improves similarity search without adding a second runtime boundary.
- LlamaIndex can still be introduced later as an orchestration layer around the
  same post document and recommendation services.

## Current operating policy

- AI recommendation lookup is public because it only reads saved results.
- AI recommendation generation requires login to reduce accidental or anonymous
  OpenAI cost.
- AI recommendation generation is limited per user per day with
  `AI_RECOMMENDATION_DAILY_LIMIT` so repeated button clicks do not create
  unbounded paid calls.
- If `OPENAI_API_KEY` is empty, the service uses the local fallback recommender.
- If `OPENAI_API_KEY` is set, the backend can call OpenAI for embeddings and
  recipe generation.

## Configuration check

Run this after editing `.env`:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run ai:check
```

Expected mode:

- `mode: "FALLBACK"` means `OPENAI_API_KEY` is empty and no OpenAI cost is used.
- `mode: "OPENAI"` means `OPENAI_API_KEY` is set and paid OpenAI calls can be
  used by authenticated recommendation requests.
- `pgvectorAvailable: false` means this database should keep using the current
  fallback retrieval until the database exposes the `vector` extension.

## Recommended next steps

1. Use a PostgreSQL build or managed database plan that exposes pgvector.
2. Add pgvector support after confirming the local and production databases have
   the `vector` extension available.
3. Move post embeddings from `Float[]` to a vector column or a raw SQL-managed
   vector table.
4. Add an ad-hoc ingredient input flow so users can request a recommendation
   without writing a post first.
5. Introduce LlamaIndex only after pgvector search quality and saved evidence
   tracking are verified.
