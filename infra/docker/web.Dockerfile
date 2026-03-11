FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
COPY packages/ui/package.json packages/ui/
COPY apps/web/package.json apps/web/

RUN npm install --workspace=apps/web --workspace=packages/contracts --workspace=packages/types --workspace=packages/config --workspace=packages/ui

COPY packages/ packages/
COPY apps/web/ apps/web/

RUN npm -w packages/contracts run build
RUN npm -w packages/types run build
RUN npm -w apps/web run build

FROM nginx:alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
