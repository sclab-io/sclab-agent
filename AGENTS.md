# Codebase Overview

This repository is a Node.js/TypeScript project providing an HTTPS API server for managing database connections, SQL queries and IoT data publishing.

## Directory Structure

```bash
src/
├── api/        - API endpoint handlers
├── app.ts      - main application setup
├── db/         - SQLite config storage & database connection manager
├── iot/        - MQTT publishing manager
├── middlewares - JWT auth, error handling
├── util/       - logging, helpers
└── types/      - shared TypeScript interfaces
```

## Environment

Key environment variables control log paths, JWT keys, TLS keys, database options and optional features such as `USE_MYBATIS` and `TUNNEL_KEEP_ALIVE_INTERVAL_MS`. Refer to the README for a full list.

## Key Components

- **Authentication** – Endpoints require a JWT token created from the private key. A token is logged on startup.
- **Database management** – `AgentConfig` stores DB/API/IOT definitions in SQLite. `DBManager` connects to multiple DB types and manages SSH tunnels.
- **IoT messaging** – `IOTManager` publishes query results to MQTT brokers on a schedule.
- **ManageHandler** – Exposes management routes for updating and querying configuration.
- **Logging** – Uses winston to output logs, creating directories automatically when `LOG_DIR` is set.

## Testing & Deployment

- Run tests with `npm run test` (Jest with ts-jest).
- Run lint with `npm run lint` (eslint).
- Install `unixODBC` and development headers so ODBC-related tests can compile
  and run. See the README for platform-specific commands.
- Deployment uses Docker or PM2; see provided configs and scripts.

## Next Steps for New Developers

- Review `DBManager` for connection and retry logic if adding DB support.
- Study `ManageHandler` and zod validations to add routes or update configs.
- Explore `IOTManager` for IoT features.
- Look at Docker/PM2 scripts for production deployment.
