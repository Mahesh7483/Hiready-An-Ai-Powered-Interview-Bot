FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 5000

# /api/health returns 503 when the database is unreachable, so an outage
# actually marks the container unhealthy. /api/test could not fail, which meant
# compose reported this service healthy while every data route was 500-ing.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

CMD ["node", "server.js"]
