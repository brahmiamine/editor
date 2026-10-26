# Compile le site (étape « web ») puis l'embarque dans l'image de l'API, qui sert le site à la racine et l'API sous /api.
# Contexte de build : la racine du dépôt (voir docker-compose.yml).
FROM node:24-alpine AS web
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production STATIC_DIR=/app/public
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/schema.sql ./
COPY server/src ./src
COPY --from=web /web/out ./public
USER node
EXPOSE 8080
CMD ["node", "src/index.js"]
