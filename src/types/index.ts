import type { MqttClient } from 'mqtt';

export interface SCLABRequestHeaders {
  authorization: string;
}

export interface SCLABResponseData {
  status: 'ok' | 'error';
  result: any;
  totalCount?: number;
}

export interface DB {
  name: string;
  type: string;
  oldName?: string; // for update
  options: {
    host?: string;
    port?: number | undefined;
    user?: string;
    password?: string;
    authType?: 'basic' | 'custom'; // only for trino or presto
    customAuth?: string;
    catalog?: string;
    schema?: string;
    engine?: 'trino' | 'presto';
    database?: string;
    maxPool?: number;
    minPoll?: number;
    poolInc?: number;
    allowPublicKeyRetrieval?: boolean;
    ssl?: {
      ca?: string;
      pfx?: string;
      passphrase?: string;
    };
    sshHost?: string;
    sshPort?: number;
    sshUser?: string;
    sshPassword?: string;
  };
}

export interface API {
  path: string;
  name: string;
  SQL: string;
  injectionCheck: boolean;
  desc?: string;
  oldPath?: string;
}

export interface IOT {
  topic: string;
  name: string;
  SQL: string;
  interval: number;
  broker: {
    host: string;
    clientId: string;
    id: string;
    password: string;
  };
  desc?: string;
  oldTopic?: string;
}

export interface IOTClient {
  count: number;
  client: MqttClient;
}

export interface Catalog {
  name: string;
}

export interface Schema {
  name: string;
}

export interface Table {
  name: string;
}

export interface Column {
  name: string;
  type: string;
}
