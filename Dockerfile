# Voxlabs — production image
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ARG GIT_SHA=
ENV GIT_SHA=$GIT_SHA
LABEL org.opencontainers.image.source="https://github.com/Voxsama/voxlabs"
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DATA_DIR=/data \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/auth/me').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node node_modules/next/dist/bin/next start -p ${PORT} -H ${HOSTNAME}"]
