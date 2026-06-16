# AI RAG Roadmap

## Current decision

The AI MVP keeps the retrieval boundary inside the NestJS backend and does not
introduce LlamaIndex yet.

The retrieval path should now move directly to pgvector. Fallback retrieval is
kept only as a safety net when a database has not been migrated yet; it is not
the quality-improvement path.

The local Docker database should use the `pgvector/pgvector:pg16` image so the
`vector` extension is available. Existing `postgres:16` volumes can usually keep
their data because the PostgreSQL major version stays 16, but the migration must
be run after switching images.

## Why pgvector first

- The application already uses PostgreSQL and Prisma.
- Recommendation evidence must remain traceable to community posts.
- pgvector improves similarity search without adding a second runtime boundary.
- LlamaIndex can still be introduced later as an orchestration layer around the
  same post document and recommendation services.

## Current operating policy

- AI recommendation lookup is public because it only reads saved results.
- AI recommendation generation requires login so anonymous users cannot trigger
  OpenAI calls.
- AI recommendation generation no longer has a daily count limit. When
  `OPENAI_API_KEY` is set, each authenticated recommendation request can create
  paid OpenAI calls.
- If `OPENAI_API_KEY` is empty, the service uses the local fallback recommender.
- If `OPENAI_API_KEY` is set, the backend can call OpenAI for embeddings and
  recipe generation.
- Recommendations now store a grounding type:
  - `COMMUNITY_RAG` means one or more community posts were used as evidence.
  - `GENERAL_AI` means pgvector found no usable community evidence, so the
    recommendation was made from the current request and general cooking
    knowledge.
- Community posts are only treated as usable evidence when their similarity is
  at least `AI_RECOMMENDATION_MIN_SIMILARITY` (`0.55` by default) and at least
  `AI_RECOMMENDATION_MIN_INGREDIENT_OVERLAP` target ingredient is shared
  (`1` by default).
- Ingredient overlap is a filter, not a score boost. One shared ingredient does
  not make a post more similar; it only prevents unrelated ingredient posts from
  being used as evidence.
- Community evidence should come from comment advice on the matched post. The
  original post body is treated as question/context, not as recipe evidence.
- `GENERAL_AI` is not treated as a pgvector failure. It is the first-post or
  sparse-data path where the service should be honest that no community posts
  were referenced.

## Configuration check

Run this after editing `.env`:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run ai:check
```

Expected mode:

- `mode: "FALLBACK"` means `OPENAI_API_KEY` is empty and no OpenAI cost is used.
- `mode: "OPENAI"` means `OPENAI_API_KEY` is set and paid OpenAI calls can be
  used by authenticated recommendation requests.
- `pgvectorAvailable: true` means the database image exposes the `vector`
  extension.
- `pgvectorInstalled: true` means the current database has the extension enabled
  and vector search is the intended retrieval path.

## Recommended next steps

1. Switch local Docker PostgreSQL to `pgvector/pgvector:pg16`.
2. Run Prisma migration so `CREATE EXTENSION vector` and the vector column are
   applied.
3. Recreate or refresh post RAG documents so old array embeddings are replaced
   with pgvector embeddings.
4. Keep the ad-hoc ingredient input flow connected to the same vector search.
5. Introduce LlamaIndex only after pgvector search quality and saved evidence
   tracking are verified.
