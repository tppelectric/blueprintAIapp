FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY services/api/package.json services/api/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/config packages/config
COPY packages/types packages/types
COPY packages/shared packages/shared
COPY services/api services/api

RUN npm install
RUN npm --prefix packages/types run build
RUN npm --prefix packages/shared run build
RUN npm --prefix services/api run build

ENV NODE_ENV=production
EXPOSE 4000

CMD ["npm", "--prefix", "services/api", "run", "start"]
