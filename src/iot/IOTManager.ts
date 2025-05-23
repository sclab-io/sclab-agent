import mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import type { IOT, IOTClient } from '../types';
import { logger } from '../util/logger';
import { DBManager } from '../db/DBManager';
import { App } from '../app';

export class IOTManager {
  static clientMap: Map<string, IOTClient> = new Map();
  static timerMap: Map<string, NodeJS.Timeout> = new Map();

  static getClientKey(iot: IOT): string {
    return `${iot.broker.host}${iot.broker.clientId}${iot.broker.id}`;
  }

  static async run(iot: IOT) {
    const key = IOTManager.getClientKey(iot);
    if (!IOTManager.clientMap.has(key)) {
      logger.error('key not found');
      return;
    }
    const client = IOTManager.clientMap.get(key)!;
    if (!client.client.connected) {
      const timer = setTimeout(IOTManager.run, iot.interval * 1000, iot);
      IOTManager.timerMap.set(iot.topic, timer);
      return;
    }

    const result = await DBManager.runSQL(iot.name, iot.SQL);
    if (client.client.connected) {
      let sendData: string;
      if (Array.isArray(result)) {
        if (result.length === 0) {
          // 데이터가 없는경우 데이터 전송을 하지 않고 다음 다시 쿼리를 날릴 수 있게 함.
          const timer = setTimeout(IOTManager.run, iot.interval * 1000, iot);
          IOTManager.timerMap.set(iot.topic, timer);
          return;
        } else if (result.length === 1) {
          sendData = JSON.stringify({ t: new Date().getTime(), ...result[0] });
        } else {
          sendData = JSON.stringify({ t: new Date().getTime(), ...result });
        }
      } else {
        sendData = JSON.stringify({ t: new Date().getTime(), ...result });
      }

      client.client.publish(iot.topic, sendData);
      const timer = setTimeout(IOTManager.run, iot.interval * 1000, iot);
      IOTManager.timerMap.set(iot.topic, timer);
    }
  }

  static async add(iot: IOT): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const key = IOTManager.getClientKey(iot);
        let client: MqttClient;
        if (IOTManager.clientMap.has(key)) {
          const iotClient = IOTManager.clientMap.get(key)!;
          iotClient.count++;
          client = iotClient.client;
          IOTManager.run(iot);
          resolve();
        } else {
          client = mqtt.connect(iot.broker.host, {
            clientId: iot.broker.clientId,
            rejectUnauthorized: false,
            username: iot.broker.id,
            password: iot.broker.password,
            keepalive: 60,
            reconnectPeriod: 10 * 1000,
            connectTimeout: 30 * 1000,
            clean: true,
          });
          IOTManager.clientMap.set(key, {
            count: 1,
            client,
          });
          client.on('connect', () => {
            logger.info(`MQTT Server connected : ${iot.topic}`);
            IOTManager.run(iot);
            resolve();
          });

          client.on('close', () => {
            logger.info(`MQTT Service close : ${iot.topic}`);
          });

          client.on('disconnect', () => {
            logger.info(`MQTT Service disconnect : ${iot.topic}`);
          });

          client.on('offline', () => {
            logger.info(`MQTT Service offline : ${iot.topic}`);
          });

          client.on('error', err => {
            logger.error(iot.topic, err);
            IOTManager.remove(iot.topic);
            reject(err);
          });
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  static async remove(topic: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        // timer 중지
        clearTimeout(IOTManager.timerMap.get(topic));
        IOTManager.timerMap.delete(topic);

        // client 관리
        const iot = await App.agentConfig.getIOT(topic);
        const key = IOTManager.getClientKey(iot);
        if (!IOTManager.clientMap.has(key)) {
          resolve();
          return;
        }

        const iotClient = IOTManager.clientMap.get(key)!;
        if (iotClient.count <= 1) {
          iotClient.client.end(() => {
            IOTManager.clientMap.delete(key);
            resolve();
          });
        } else {
          iotClient.count--;
          resolve();
        }
      } catch (e) {
        reject(e);
      }
    });
  }
}
