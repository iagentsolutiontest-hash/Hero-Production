FROM node:22.14.0-bookworm-slim

WORKDIR /app

COPY package*.json ./

RUN npm install --include=dev

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

RUN test -f dist/main.js

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/main.js"]
