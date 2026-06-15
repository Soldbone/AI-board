FROM node:24-bookworm-slim

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 python3-pip python3-venv \
  && python3 -m venv /opt/youtube-transcript \
  && /opt/youtube-transcript/bin/pip install --no-cache-dir -r backend/requirements.txt \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

ENV PATH="/opt/youtube-transcript/bin:${PATH}"

RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @arena/backend build

EXPOSE 3000

CMD ["node", "backend/dist/main.js"]
