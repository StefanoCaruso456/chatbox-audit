FROM node:22.12.0-bookworm-slim AS builder

WORKDIR /app
ENV CI=1

# Native modules pulled in during workspace install (for example zipfile and
# sharp) need a basic Linux toolchain plus libvips when Railway falls back to
# source builds.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        python3 \
        make \
        g++ \
        pkg-config \
        libvips-dev \
    && rm -rf /var/lib/apt/lists/*

ARG PNPM_VERSION=10.15.1
RUN npm install --global "pnpm@${PNPM_VERSION}"

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY .erb ./.erb
COPY patches ./patches
COPY release ./release

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build:web

FROM node:22.12.0-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY scripts/serve-web.mjs ./scripts/serve-web.mjs
COPY --from=builder /app/release/app/dist/renderer ./release/app/dist/renderer

EXPOSE 3000

CMD ["node", "scripts/serve-web.mjs"]
