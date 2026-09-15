export interface AwsStoredCredentials {
  roleArn: string;
  externalId: string;
}

export function buildAwsStoredCredentials(roleArn: string, externalId: string): AwsStoredCredentials {
  return { roleArn, externalId };
}
