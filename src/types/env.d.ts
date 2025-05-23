declare module 'bun' {
  interface Env {
    NODE_ENV: string;
    PORT: string;
    SECRET_KEY: string;
    JWT_PRIVATE_KEY_PATH: string;
    JWT_PUBLIC_KEY_PATH: string;
    LOG_DIR: string;
    AGENT_DB_PATH: string;
    TLS_KEY: string;
    TLS_CERT: string;
    LOG_LEVEL: string;
    USE_MYBATIS: string;
    ORACLE_CLIENT_DIR: string;
    LD_LIBRARY_PATH: string;
    MSSQL_IDLE_TIMEOUT_MS: string;
  }
}
