import type { AegisAssignment, AegisLicense, AegisSnapshotMetadata, AegisUser } from "./data-model";

/** Standard contract every future Aegis connector should implement. */
export interface AegisConnector {
  readonly key: string;
  readonly displayName: string;
  discover(): Promise<{ users: boolean; licenses: boolean; assignments: boolean; usage: boolean }>;
  sync(): Promise<{
    users: AegisUser[];
    licenses: AegisLicense[];
    assignments: AegisAssignment[];
    snapshot: AegisSnapshotMetadata;
  }>;
  health(): Promise<{ ok: boolean; message?: string; lastSuccessfulSyncAt?: string }>;
}
