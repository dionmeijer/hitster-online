# Production image: API + Socket.io + built React client (same-origin on Fly.io)
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY bots/package.json bots/

RUN npm ci

COPY shared ./shared
COPY server ./server
COPY client ./client

RUN npm run build

FROM node:20-alpine AS run
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY server/package.json server/

RUN npm ci --omit=dev -w server

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
COPY shared ./shared

ENV PORT=8080
EXPOSE 8080

CMD ["npm", "run", "start", "-w", "server"]
