FROM node:20.10.0-alpine3.18

COPY . ./app

WORKDIR /app

RUN mkdir -p /data/logs /data/cert /data/jwt
RUN chmod +x ./run_app.sh
RUN npm install

# EXPOSE LISTEN PORT
EXPOSE 7890

# ENTRY POINT
ENTRYPOINT ["/bin/sh", "run_app.sh"]
