# Food Metadata MCP

This MCP server exposes Korean food nutrition metadata from the Public Data
Portal food nutrition API. It is designed as factual support for the existing
community RAG flow. It does not choose dishes, generate cooking steps, or replace
the post/comment evidence path.

## Environment

Add these values to `backend/.env`:

```bash
PUBLIC_DATA_FOOD_API_KEY="your-data-go-kr-service-key"
PUBLIC_DATA_FOOD_API_URL="https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02"
PUBLIC_DATA_FOOD_API_TIMEOUT_MS=10000
```

The service key must stay on the backend or MCP host. Do not expose it from the
frontend.

## Run

Development:

```bash
npm run mcp:food
```

After build:

```bash
npm run build
npm run mcp:food:prod
```

Check the live public data API after setting the service key:

```bash
npm run mcp:food:check -- 계란
```

The check prints whether the public API returned JSON, how many candidates came
back, and the first candidate's field names. It never prints the service key.

## Tools

### `search_food_items`

Looks up candidate food records by Korean food name.

Input:

```json
{
  "query": "계란",
  "limit": 5
}
```

Output includes the original input, normalized input, candidates, serving size,
nutrition facts, data source, and match status.

### `get_food_nutrition`

Fetches the first matching food nutrition record, or a specific candidate when a
food id is provided.

Input:

```json
{
  "query": "두부",
  "foodId": "optional-food-code"
}
```

### `analyze_ingredients_nutrition`

Looks up multiple ingredients and returns per-ingredient facts plus simple totals
and averages. The totals are metadata only and should not be treated as the final
meal nutrition unless ingredient weights are known.

Input:

```json
{
  "ingredients": ["계란", "대파", "두부"]
}
```

## RAG Boundary

The MCP server is only a food metadata provider:

- It may normalize food names.
- It may return food candidates and nutrition facts.
- It may report missing data, API errors, and source information.
- It must not choose the final dish.
- It must not generate cooking instructions.
- It must not claim community evidence.

The existing post/comment RAG flow remains responsible for finding similar
community posts and using comment evidence.

## Failure Behavior

When the API key is missing, the tools return structured content with
`matchStatus: "configuration_missing"` instead of throwing an unstructured
runtime error.

When no food item is found, the tools return `matchStatus: "not_found"` with an
empty candidate list.

When the public API fails or rate limits the request, the tools return
`matchStatus: "api_error"` and include a message that can be shown in logs or
developer diagnostics.
