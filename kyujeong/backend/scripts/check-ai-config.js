const { Client } = require('pg');
require('dotenv').config();

function getRagMinSimilarity() {
  const configuredSimilarity = Number(
    process.env.AI_RECOMMENDATION_MIN_SIMILARITY,
  );

  if (Number.isFinite(configuredSimilarity)) {
    return Math.min(Math.max(configuredSimilarity, 0), 1);
  }

  return 0.55;
}

function getRagMinIngredientOverlap() {
  const configuredOverlap = Number(
    process.env.AI_RECOMMENDATION_MIN_INGREDIENT_OVERLAP,
  );

  if (Number.isFinite(configuredOverlap)) {
    return Math.max(Math.floor(configuredOverlap), 0);
  }

  return 1;
}

async function main() {
  const openAiConfigured = Boolean(process.env.OPENAI_API_KEY?.trim());
  const result = {
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL?.trim()),
    openAiConfigured,
    mode: openAiConfigured ? 'OPENAI' : 'FALLBACK',
    embeddingModel: openAiConfigured
      ? (process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small')
      : 'local-hash-v1',
    chatModel: openAiConfigured
      ? (process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini')
      : null,
    dailyLimit: null,
    ragMinSimilarity: getRagMinSimilarity(),
    ragMinIngredientOverlap: getRagMinIngredientOverlap(),
    pgvectorAvailable: false,
    pgvectorInstalled: false,
    pgvectorDecision: 'not checked',
  };

  if (!result.databaseUrlConfigured) {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 1;
    return;
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const available = await client.query(
      "select name from pg_available_extensions where name = 'vector'",
    );
    const installed = await client.query(
      "select extname from pg_extension where extname = 'vector'",
    );

    result.pgvectorAvailable = available.rowCount > 0;
    result.pgvectorInstalled = installed.rowCount > 0;
    result.pgvectorDecision = result.pgvectorInstalled
      ? 'pgvector is installed; vector search can run.'
      : result.pgvectorAvailable
        ? 'pgvector is available; run migrations to install the vector extension.'
        : 'pgvector is not available from this database image.';
  } finally {
    await client.end();
  }

  console.log(JSON.stringify(result, null, 2));

  if (!openAiConfigured) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
