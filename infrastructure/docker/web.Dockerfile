FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/config packages/config
COPY packages/types packages/types
COPY packages/shared packages/shared
COPY apps/web apps/web

RUN npm install
RUN npm --prefix packages/types run build
RUN npm --prefix packages/shared run build
RUN npm --prefix apps/web run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "--prefix", "apps/web", "run", "start", "--", "--hostname", "0.0.0.0", "--port", "3000"]
