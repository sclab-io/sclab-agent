import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { AWS_REGION, AWS_SECRET_KEY_ID, AWS_SECRET_ACCESS_KEY } from '.';

export class SecretManager {
  private static awsSecretsManagerClient: SecretsManagerClient;

  static setupAWSSecretsManagerClient() {
    SecretManager.awsSecretsManagerClient = new SecretsManagerClient({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_SECRET_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  static async getKey(id: string, key: string): Promise<string> {
    if (!SecretManager.awsSecretsManagerClient) {
      SecretManager.setupAWSSecretsManagerClient();
    }
    const command = new GetSecretValueCommand({ SecretId: id });
    try {
      const data = await SecretManager.awsSecretsManagerClient.send(command);
      const secret = JSON.parse(data.SecretString!);
      return secret[key];
    } catch (err) {
      throw err;
    }
  }
}
