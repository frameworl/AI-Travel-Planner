# syntax=docker/dockerfile:1

# --- Build stage: compile the Vite React app ---
FROM node:18-alpine AS build
WORKDIR /app

# Install deps first (better layer caching)
COPY client/package*.json client/
RUN cd client && npm ci

# Copy sources
COPY client client/

# Accept build-time configuration for Vite envs
ARG VITE_LLM_PROVIDER
ARG VITE_OPENAI_API_KEY
ARG VITE_OPENAI_MODEL
ARG VITE_DASHSCOPE_API_KEY
ARG VITE_DASHSCOPE_MODEL
ARG VITE_AMAP_KEY
ARG VITE_AMAP_SECURITY_JS_CODE
ARG VITE_AMAP_REST_KEY
ARG VITE_ASR_PROVIDER
ARG VITE_XFYUN_APP_ID
ARG VITE_XFYUN_API_KEY
ARG VITE_XFYUN_API_SECRET
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_MEASUREMENT_ID

# Bake env into build (Vite reads prefixed vars at build time)
RUN set -ex && cd client && \
    echo "VITE_LLM_PROVIDER=${VITE_LLM_PROVIDER}" >> .env && \
    echo "VITE_OPENAI_API_KEY=${VITE_OPENAI_API_KEY}" >> .env && \
    echo "VITE_OPENAI_MODEL=${VITE_OPENAI_MODEL}" >> .env && \
    echo "VITE_DASHSCOPE_API_KEY=${VITE_DASHSCOPE_API_KEY}" >> .env && \
    echo "VITE_DASHSCOPE_MODEL=${VITE_DASHSCOPE_MODEL}" >> .env && \
    echo "VITE_AMAP_KEY=${VITE_AMAP_KEY}" >> .env && \
    echo "VITE_AMAP_SECURITY_JS_CODE=${VITE_AMAP_SECURITY_JS_CODE}" >> .env && \
    echo "VITE_AMAP_REST_KEY=${VITE_AMAP_REST_KEY}" >> .env && \
    echo "VITE_ASR_PROVIDER=${VITE_ASR_PROVIDER}" >> .env && \
    echo "VITE_XFYUN_APP_ID=${VITE_XFYUN_APP_ID}" >> .env && \
    echo "VITE_XFYUN_API_KEY=${VITE_XFYUN_API_KEY}" >> .env && \
    echo "VITE_XFYUN_API_SECRET=${VITE_XFYUN_API_SECRET}" >> .env && \
    echo "VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY}" >> .env && \
    echo "VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN}" >> .env && \
    echo "VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID}" >> .env && \
    echo "VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID}" >> .env && \
    echo "VITE_FIREBASE_MEASUREMENT_ID=${VITE_FIREBASE_MEASUREMENT_ID}" >> .env && \
    npx vite build

# --- Runtime stage: serve built static with Nginx ---
FROM nginx:1.25-alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]