FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
COPY apps/api/package.json apps/api/

RUN npm install --workspace=apps/api --workspace=packages/contracts --workspace=packages/types --workspace=packages/config

COPY packages/contracts/ packages/contracts/
COPY packages/types/ packages/types/
COPY packages/config/ packages/config/
COPY apps/api/ apps/api/

RUN npm -w packages/contracts run build
RUN npm -w packages/types run build
RUN npm -w apps/api run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/packages ./packages

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/main.js"]
