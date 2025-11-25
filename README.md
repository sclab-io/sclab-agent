# sclab-agent

## requirement

* node.js 20.10.0

## installation

Before running the agent, ensure that `unixODBC` is installed on your system. This library is required for ODBC database connectivity.

### .env

create .env file and paste this env vars

~~~bash
#LOG_DIR="./logs"
PORT=7890
#NODE_ENV=development
NODE_ENV=production
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
USE_MYBATIS=1

# ORACLE_CLIENT_DIR
#ORACLE_CLIENT_DIR=
# ORACLE LIBRARY PATH
LD_LIBRARY_PATH=""

#MSSQL_IDLE_TIMEOUT_MS=30000
TUNNEL_KEEP_ALIVE_INTERVAL_MS=3600000
#USE_SQL_ENV=1
#USE_AWS_SECRET_MANAGER=1
#AWS_REGION=ap-northeast-2
#AWS_SECRET_KEY_ID=
#AWS_SECRET_ACCESS_KEY=
#REMOVE_KEYWORD_INJECTION_CHECK=1
~~~

### create JWT key

~~~bash
mkdir jwt
ssh-keygen -t rsa -b 4096 -m PEM -f ./jwt/jwtRS256.key
# empty passphrase - just press enter
openssl rsa -in ./jwt/jwtRS256.key -pubout -outform PEM -out ./jwt/jwtRS256.key.pub
~~~

### create SSL key

~~~bash
mkdir cert
openssl genrsa -out ./cert/privkey.pem 2048
openssl req -new -sha256 -key ./cert/privkey.pem -out ./cert/csr.pem
openssl x509 -req -in ./cert/csr.pem -signkey ./cert/privkey.pem -out ./cert/cert.pem
~~~

### install nodejs

[nodejs](https://nodejs.org/en)

### install unixODBC

* unixODBC binaries and development libraries for module compilation
  * on Ubuntu/Debian `sudo apt-get install unixodbc unixodbc-dev`
  * on RedHat/CentOS `sudo yum install unixODBC unixODBC-devel`
  * on OSX
    * using macports.org `sudo port unixODBC`
    * using brew `brew install unixODBC`
  * on FreeBSD from ports `cd /usr/ports/databases/unixODBC; make install`
  * on IBM i `yum install unixODBC unixODBC-devel` (requires [yum](http://ibm.biz/ibmi-rpms))
* ODBC drivers for target database
* properly configured odbc.ini and odbcinst.ini.
* print config info `odbcinst -j`
* test dsn `isql -v mydsn myusername mypassword`

### Oracle Client mode

#### Thin mode (nodejs default)

* Support Oracle Database version 12.1 or later

#### Thick mode (docker-compose default)

* Support Oracle Database version 21, 19, 18, 12, and 11.2

* If you are using Docker, it runs by default in thick mode, so you don't need to install client.

#### Thick mode install

* download client

* <https://www.oracle.com/database/technologies/instant-client/downloads.html>
* unzip client
* uncomment ORACLE_CLIENT_DIR with your client path
* more detail in <https://node-oracledb.readthedocs.io/en/latest/user_guide/installation.html#install-oracle-client-to-use-thick-mode>

## run

~~~bash
# install packages
npm install

# production mode
npm run deploy:prod

# dev mode
npm run dev
~~~

## log

### pm2 log

~~~bash
# install logrotate
npx pm2 install pm2-logrotate
npx pm2 set pm2-logrotate:max_size 100M
npx pm2 set pm2-logrotate:compress true
npx pm2 set pm2-logrotate:retain 31

# Generate Startup Script
npx pm2 startup

# Freeze your process list across server restart
npx pm2 save

# pm2 log
npx pm2 log
~~~

### file log

~~~bash
tail -f ./logs/debug/${DATE}.log
tail -f ./logs/error/${DATE}.log
~~~

## stop

~~~bash
npx pm2 stop 0
~~~

## connection test

~~~bash
# You have to use -k option for avoid self signed certificate problem.
# You can replace your certificate files from CA.
curl https://localhost:7890/ -k -H 'authorization: your key from console log'
~~~

Response

~~~json
{"status":"ok","result":"Authentication complete."}
~~~

## Run docker

<https://hub.docker.com/r/sclabio/sclab-agent>
