# Debian rather than Alpine: the coding round compiles and runs submissions in
# seven languages, and those toolchains are packaged for Debian.
FROM node:20-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 g++ openjdk-17-jdk-headless golang-go rustc ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# TypeScript needs no global install: the typescript package is an ordinary
# dependency, used by services/tsTranspile.js.

WORKDIR /app

ENV NODE_ENV=production
# Run each submission as its own unprivileged uid with rlimits; see
# executeRestricted in services/sandbox.js. It needs this container to run as
# root, which is why there is no USER line: the server stays root so it can
# hand each child a different uid, and the children never are.
ENV SANDBOX_RUNNER=restricted
# Measured on a 0.1-CPU instance (Render free): javac 21s, g++ 11s. The 15s
# default suits real CPUs; this keeps compiled languages usable on the slowest.
ENV SANDBOX_COMPILE_TIMEOUT_MS=45000

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 5000

# /api/health returns 503 when the database is unreachable, so an outage
# actually marks the container unhealthy. /api/test could not fail, which meant
# compose reported this service healthy while every data route was 500-ing.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
