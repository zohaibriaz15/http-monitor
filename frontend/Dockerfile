# Frontend: build the Vite bundle, then serve the static dist/ with `serve`.
# VITE_* are inlined at build time, so they arrive as build args (set them on the
# Railway service or via docker-compose; on Railway they're passed automatically).

# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE
ARG VITE_WS_URL
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_WS_URL=$VITE_WS_URL
RUN npm run build

# ---- runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g serve@14
COPY --from=build /app/dist ./dist
EXPOSE 4173
# Shell form so ${PORT} is expanded; bind 0.0.0.0 so the published port is reachable.
CMD ["sh", "-c", "serve -s dist -l tcp://0.0.0.0:${PORT:-4173}"]
