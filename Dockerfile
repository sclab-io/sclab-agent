FROM node:24.0.2-alpine3.21

COPY . ./app

WORKDIR /app

RUN mkdir -p /data/logs /data/cert /data/jwt
RUN chmod +x ./run_app.sh
RUN npm install

# unixODBC 및 기타 필요 패키지 설치
RUN apk update && \
    apk add --no-cache unixodbc unixodbc-dev

# EXPOSE LISTEN PORT
EXPOSE 7890

# ENTRY POINT
ENTRYPOINT ["/bin/sh", "run_app.sh"]
