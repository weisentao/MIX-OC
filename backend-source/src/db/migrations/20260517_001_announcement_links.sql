SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'carousel_notices' AND COLUMN_NAME = 'status') = 0,
  'ALTER TABLE carousel_notices ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT ''active''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'carousel_notices' AND COLUMN_NAME = 'priority') = 0,
  'ALTER TABLE carousel_notices ADD COLUMN priority INT NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'carousel_notices' AND COLUMN_NAME = 'link_text') = 0,
  'ALTER TABLE carousel_notices ADD COLUMN link_text VARCHAR(80) NOT NULL DEFAULT ''''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'carousel_notices' AND COLUMN_NAME = 'link_url') = 0,
  'ALTER TABLE carousel_notices ADD COLUMN link_url VARCHAR(512) NOT NULL DEFAULT ''''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'carousel_notices' AND COLUMN_NAME = 'link_target') = 0,
  'ALTER TABLE carousel_notices ADD COLUMN link_target VARCHAR(16) NOT NULL DEFAULT ''_self''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'carousel_notices' AND COLUMN_NAME = 'start_at') = 0,
  'ALTER TABLE carousel_notices ADD COLUMN start_at DATETIME NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'carousel_notices' AND COLUMN_NAME = 'end_at') = 0,
  'ALTER TABLE carousel_notices ADD COLUMN end_at DATETIME NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE carousel_notices
SET status = CASE WHEN enabled = 1 THEN 'active' ELSE 'disabled' END
WHERE status = '';

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'carousel_notices' AND INDEX_NAME = 'idx_carousel_notices_active_status') = 0,
  'CREATE INDEX idx_carousel_notices_active_status ON carousel_notices (enabled, status, priority, sort_order)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
