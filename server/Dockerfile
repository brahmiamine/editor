FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY schema.sql ./
COPY src ./src
USER node
EXPOSE 8080
CMD ["node", "src/index.js"]
