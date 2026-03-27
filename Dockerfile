FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages/types/package.json packages/types/tsconfig.json packages/types/
COPY packages/core/package.json packages/core/tsconfig.json packages/core/
RUN npm install
COPY packages/types/ packages/types/
COPY packages/core/ packages/core/
RUN npx tsc -b packages/types packages/core

FROM node:22-slim
WORKDIR /app

# Security: non-root user
RUN groupadd -r keygate && useradd -r -g keygate -s /bin/false keygate

# Copy built packages
COPY --from=builder /app/node_modules node_modules/
COPY --from=builder /app/packages/types/dist packages/types/dist/
COPY --from=builder /app/packages/types/package.json packages/types/
COPY --from=builder /app/packages/core/dist packages/core/dist/
COPY --from=builder /app/packages/core/package.json packages/core/
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/tsconfig.base.json ./

# Copy source for tsx runtime (MVP — switch to dist in prod)
COPY packages/core/src packages/core/src/

# Default dirs
RUN mkdir -p /data /plugins && chown -R keygate:keygate /data /plugins

# Plugins get mounted as volume
VOLUME ["/data", "/plugins"]

USER keygate

EXPOSE 9800 9801

ENTRYPOINT ["npx", "tsx", "packages/core/src/bin/sandbox.ts"]
CMD ["--data-dir", "/data", "--plugin-dir", "/plugins", "--agent-port", "9800", "--client-port", "9801"]
