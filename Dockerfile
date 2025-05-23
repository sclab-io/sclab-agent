FROM node:20.10.0-alpine3.18

# unixODBC 및 기타 필요 패키지 설치
RUN apk add --no-cache \
      python3 \
      build-base \
      sqlite-dev \
      linux-headers unixodbc unixodbc-dev

COPY . ./app

WORKDIR /app

RUN mkdir -p /data/logs /data/cert /data/jwt
RUN chmod +x ./run_app.sh
RUN npm install

# EXPOSE LISTEN PORT
EXPOSE 7890

# ENTRY POINT
ENTRYPOINT ["/bin/sh", "run_app.sh"]
