# Backend: Express API + cron scheduler + WebSocket broadcaster.
# Runs DB migrations on boot, then listens on $PORT (Railway sets it; 4000 locally).
FROM node:20-alpine

WORKDIR /app

# Production dependencies only.
COPY package*.json ./
RUN npm ci --omit=dev

# App source (config + SQL migrations live under src/).
COPY src ./src

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "src/server.js"]
