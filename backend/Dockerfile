# Production image for the QuranReview Express backend.
# Universal: runs on Railway, Render, Fly.io, or Hostinger Docker hosting.
# Multi-stage — compile TypeScript in the builder, ship only prod deps + dist.

# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# The app reads PORT from the environment (defaults to 3000). Most hosts inject
# their own PORT; EXPOSE is documentation only.
EXPOSE 3000
CMD ["node", "dist/index.js"]
