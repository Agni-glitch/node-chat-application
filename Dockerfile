# Single image: Express API + Socket.IO + the React build served from the same origin.
# Build:  docker build -t quick-chat .
# Run:    docker run -p 5000:5000 --env-file server/.env -e SERVE_CLIENT=true quick-chat

# ---- Build the React client ----
FROM node:26-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
# Same-origin deploy: leave the API URL empty so the client talks to its own host.
ARG REACT_APP_API_URL=""
ARG REACT_APP_MAX_IMAGE_MB=5
ENV REACT_APP_API_URL=$REACT_APP_API_URL \
    REACT_APP_MAX_IMAGE_MB=$REACT_APP_MAX_IMAGE_MB \
    GENERATE_SOURCEMAP=false
RUN npm run build

# ---- Runtime ----
FROM node:26-alpine
ENV NODE_ENV=production \
    SERVE_CLIENT=true \
    PORT=5000
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/ ./
COPY --from=client /app/client/build /app/client/build
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1
CMD ["node", "server.js"]
