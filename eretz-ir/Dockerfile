FROM node:22-alpine
WORKDIR /app
COPY package.json game.mjs room.mjs server.mjs ./
COPY public ./public
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
USER node
HEALTHCHECK CMD wget -qO- http://localhost:3000/healthz || exit 1
CMD ["node", "server.mjs"]
