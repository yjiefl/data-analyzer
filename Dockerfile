# Stage 1: Build Frontend
FROM docker.m.daocloud.io/library/node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Runtime
FROM docker.m.daocloud.io/library/node:20-alpine
WORKDIR /app

# Copy Backend
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production
COPY backend/ ./backend/

# Copy Frontend Build
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Env variables
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "backend/server.js"]
