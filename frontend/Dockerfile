# The site in Docker (docker compose --profile site up): the production build, served by nginx, which forwards /api to
# the API container the way the Cloudflare function does online (one origin: the auth cookie stays first-party).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
