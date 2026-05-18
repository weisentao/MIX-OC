export const STORAGE_METADATA_TABLE_NAME = "storage_files";

export const STORAGE_METADATA_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS storage_files (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    storage_uid VARCHAR(64) NOT NULL,
    kind ENUM('image', 'video', 'chat_text', 'attachment') NOT NULL,
    scope_type VARCHAR(32) NOT NULL DEFAULT '',
    scope_uid VARCHAR(128) NOT NULL DEFAULT '',
    conversation_uid VARCHAR(128) NOT NULL DEFAULT '',
    message_uid VARCHAR(128) NOT NULL DEFAULT '',
    original_name VARCHAR(255) NOT NULL DEFAULT '',
    safe_original_name VARCHAR(255) NOT NULL DEFAULT '',
    mime_type VARCHAR(128) NOT NULL,
    size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
    checksum_sha256 CHAR(64) NOT NULL,
    relative_path VARCHAR(512) NOT NULL,
    metadata_json LONGTEXT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    uploaded_by VARCHAR(64) NOT NULL DEFAULT '',
    uploaded_by_name VARCHAR(128) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_storage_files_storage_uid (storage_uid),
    UNIQUE KEY uniq_storage_files_relative_path (relative_path),
    KEY idx_storage_files_kind_status_created (kind, status, created_at),
    KEY idx_storage_files_scope (scope_type, scope_uid, kind, status),
    KEY idx_storage_files_conversation (conversation_uid, message_uid),
    KEY idx_storage_files_uploaded_by (uploaded_by)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export async function ensureStorageMetadataTable(pool) {
  await pool.execute(STORAGE_METADATA_TABLE_SQL);
}
