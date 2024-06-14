# sclab-agent

# installation
## .env
create .env file and paste this env vars
~~~bash
LOG_DIR="../../logs"
PORT=7890
NODE_ENV=development
#NODE_ENV=production
LOG_LEVEL=debug

# TOKEN
SECRET_KEY=sclab-agent-key
JWT_PRIVATE_KEY_PATH=./jwt/jwtRS256.key
JWT_PUBLIC_KEY_PATH=./jwt/jwtRS256.key.pub

# SSL
TLS_CERT=./cert/cert.pem
TLS_KEY=./cert/privkey.pem

# Agent Managed DB Path
AGENT_DB_PATH="agent.db"

# Use mybatis mapper
#USE_MYBATIS=1

# ORACLE_CLIENT_DIR
#ORACLE_CLIENT_DIR=

#MSSQL_IDLE_TIMEOUT_MS=30000
~~~

## create JWT key
~~~bash
$ mkdir jwt
$ sudo ssh-keygen -t rsa -b 4096 -m PEM -f ./jwt/jwtRS256.key
# empty passphrase - just press enter
$ sudo openssl rsa -in ./jwt/jwtRS256.key -pubout -outform PEM -out ./jwt/jwtRS256.key.pub
~~~

## create SSL key
~~~bash
$ mkdir cert
$ sudo openssl genrsa -out ./cert/privkey.pem 2048
$ sudo openssl req -new -sha256 -key ./cert/privkey.pem -out ./cert/csr.pem
$ sudo openssl x509 -req -in ./cert/csr.pem -signkey ./cert/privkey.pem -out ./cert/cert.pem
~~~

# run
~~~bash
# install packages
$ npm install

# production mode
$ npm run deploy:prod

# dev mode
$ npm run dev
~~~

# log
~~~bash
$ npx pm2 logs
~~~

# stop
~~~bash
$ npx pm2 stop 0
~~~

## connection test
~~~bash
# You have to use -k option for avoid self signed certificate problem.
# You can replace your certificate files from CA.
$ curl https://localhost:7890/ -k -H 'authorization: your key from console log'
~~~
Reponse
~~~json
{"status":"ok","result":"Authentication complete."}
~~~