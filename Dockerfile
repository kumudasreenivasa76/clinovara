# One container serves the API and the built frontend. Mount a volume at /data to keep clinic data.
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package*.json frontend/
RUN npm ci --prefix frontend
COPY frontend frontend
RUN npm run build --prefix frontend

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=4200 CLINOVARA_DATA_DIR=/data
COPY backend/package*.json backend/
RUN npm ci --omit=dev --prefix backend
COPY backend backend
COPY --from=build /app/frontend/dist frontend/dist
VOLUME /data
EXPOSE 4200
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:4200/api/health || exit 1
CMD ["node", "backend/src/server.js"]
