FROM node:22-alpine AS build

ARG NUXT_PUBLIC_DEMO_LOCAL=false
ENV NUXT_PUBLIC_DEMO_LOCAL=$NUXT_PUBLIC_DEMO_LOCAL

WORKDIR /app

COPY app/package*.json ./
RUN npm ci

COPY app/ ./
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV NUXT_PUBLIC_DEMO_LOCAL=false

COPY --from=build /app/.output ./.output

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
