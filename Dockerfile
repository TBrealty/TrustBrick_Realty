# The Trustbrick website as a Docker image (deploy/README.md). Three stages:
#   deps     all npm packages
#   tools    the full source with every package: migrations, seeds, the admin bootstrap
#   runner   just the built server (Next.js standalone output), what runs in production
#
# NEXT_PUBLIC_SITE_URL is fixed into the browser code at build time, so pass the real address:
#   docker build --build-arg NEXT_PUBLIC_SITE_URL=https://trustbrick.org .

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Amazon RDS's certificates, so connections to the database are encrypted and verified
# (DATABASE_URL ends in ?sslmode=verify-full).
# Readable by everyone: the website runs as the unprivileged `node` user, and Node skips a
# certificate file it can't read (ADD from a URL makes it root-only by default).
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-global-bundle.pem
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS tools
COPY . .
ENV NODE_ENV=production

FROM tools AS builder
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_TELEMETRY_DISABLED=1
# The server checks its settings when modules load, which the build does too. These stand-ins
# only get it through the build; the real values come from the server's .env at run time.
RUN DATABASE_URL=postgres://build:build@127.0.0.1:5432/build \
    BETTER_AUTH_URL=$NEXT_PUBLIC_SITE_URL \
    BETTER_AUTH_SECRET=build-time-placeholder-not-used-at-runtime \
    npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
COPY --from=deps --chmod=644 /etc/ssl/certs/rds-global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-global-bundle.pem \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# Uploads when STORAGE_DRIVER=local (a volume is mounted here).
RUN mkdir -p /data/storage && chown node:node /data/storage
USER node
EXPOSE 3000
CMD ["node", "server.js"]
