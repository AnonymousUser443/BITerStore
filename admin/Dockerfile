FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html/admin
RUN printf 'server { listen 80; root /usr/share/nginx/html; location /admin/ { try_files $uri $uri/ /admin/index.html; } }' > /etc/nginx/conf.d/default.conf
