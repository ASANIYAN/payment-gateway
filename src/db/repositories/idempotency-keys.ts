import logger from "@/utils/logger";
import { query } from "..";
import { IdempotencyKeyRow, RecoveryPoint } from "@/types";
import { PoolClient } from "pg";

export async function createIdempotencyKey(
  key: string,
  requestPath: string,
  requestParams: Record<string, any>
): Promise<IdempotencyKeyRow> {
  const result = await query<IdempotencyKeyRow>(
    `INSERT INTO idempotency_keys (key, request_path, request_params) VALUES ($1, $2, $3) RETURNING *`,
    [key, requestPath, JSON.stringify(requestParams)]
  );
  logger.debug({ idempotencyKey: key }, "Idempotency key created");
  return result.rows[0];
}

export async function getIdempotencyKey(key: string) {
  const result = await query<IdempotencyKeyRow>(
    "SELECT * FROM idempotency_keys where key = $1",
    [key]
  );

  return result.rows[0];
}

export async function getIdempotencyKeyForUpdate(
  client: PoolClient,
  key: string
): Promise<IdempotencyKeyRow | null> {
  const result = await client.query<IdempotencyKeyRow>(
    "SELECT * FROM idempotency_keys WHERE key = $1 FOR UPDATE",
    [key]
  );

  return result.rows[0] || null;
}

export async function isIdempotencyKeyLocked(key: string): Promise<boolean> {
  const result = await query<{ locked: boolean }>(
    "SELECT (locked_at IS NOT NULL AND locked_at > NOW() - INTERVAL '5 minutes') as locked FROM idempotency_keys WHERE key = $1",
    [key]
  );

  return result.rows[0]?.locked || false;
}

export async function lockIdempotencyKey(
  client: PoolClient,
  key: string
): Promise<void> {
  await client.query(
    "UPDATE idempotency_keys SET locked_at = NOW() WHERE key = $1",
    [key]
  );

  logger.debug({ idempotencyKey: key }, "Idempotency key locked");
}

export async function unlockIdempotencyKey(client: PoolClient, key: string) {
  await client.query(
    "UPDATE idempotency_keys SET locked_at = NULL WHERE key = $1",
    [key]
  );

  logger.debug({ idempotencyKey: key }, "Idempotency key unlocked");
}

export async function updateRecoveryPoint(
  client: PoolClient,
  key: string,
  recoveryPoint: RecoveryPoint
): Promise<void> {
  await client.query(
    `UPDATE idempotency_keys SET recovery_point = $1, updated_at = NOW() WHERE key = $2`,
    [recoveryPoint, key]
  );

  logger.debug(
    { idempotencyKey: key, recoveryPoint },
    "Recovery point updated"
  );
}

export async function cacheResponse(
  client: PoolClient,
  key: string,
  statusCode: number,
  responseBody: Record<string, any>
) {
  await client.query(
    `UPDATE idempotency_keys SET response_status = $1, response_body = $2, recovery_point = 'finished', updated_at = NOW() WHERE key = $3`,
    [statusCode, JSON.stringify(responseBody), key]
  );

  logger.info(
    { idempotencyKey: key, statusCode },
    "Response cached for idempotency key"
  );
}

// Get all idempotency keys that are not finished. To be used by completer job to find requests needing recovery
export async function getStuckIdempotencyKeys(
  thresholdMs: number
): Promise<IdempotencyKeyRow[]> {
  const result = await query<IdempotencyKeyRow>(
    `SELECT * FROM idempotency_keys WHERE recovery_point != 'finished' AND updated_at < NOW() - INTERVAL '1 millisecond' * $1 ORDER BY created_at ASC LIMIT 100`,
    [thresholdMs]
  );

  return result.rows;
}

// Delete old idempotency keys. To be used by reaper job for cleanup
export async function deleteOldIdempotencyKeys(
  ageHours: number
): Promise<number> {
  const result = await query(
    `DELETE FROM idempotency_keys WHERE created_at < NOW() - INTERVAL '1 hour' * $1`,
    [ageHours]
  );

  logger.info(
    { deletedCount: result.rowCount },
    "Deleted old idempotency keys"
  );

  return result.rowCount || 0;
}
