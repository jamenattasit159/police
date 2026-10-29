FROM node:24-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM golang:1.27.3-alpine AS api
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -o /server .

FROM alpine:3.22
RUN adduser -D app
USER app
COPY --from=api /server /app/server
COPY --from=web /web/dist /app/dist
ENV STATIC_DIR=/app/dist ADDR=:8080
EXPOSE 8080
CMD ["/app/server"]
