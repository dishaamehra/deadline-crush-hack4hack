FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci
COPY server server
RUN npm run build -w server
EXPOSE 4000
CMD ["node", "server/dist/index.js"]
