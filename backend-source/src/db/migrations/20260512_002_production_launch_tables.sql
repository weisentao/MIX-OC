CREATE TABLE IF NOT EXISTS departments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  department_uid VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  name_en VARCHAR(128) NOT NULL DEFAULT '',
  parent_department_uid VARCHAR(64) NOT NULL DEFAULT '',
  manager_user_uid VARCHAR(64) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  sort_order BIGINT NOT NULL DEFAULT 0,
  payload_json LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_departments_department_uid (department_uid),
  UNIQUE KEY uniq_departments_name (name),
  KEY idx_departments_parent_uid (parent_department_uid),
  KEY idx_departments_status_sort (status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_key VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  is_system TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_roles_role_key (role_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  permission_key VARCHAR(128) NOT NULL,
  name VARCHAR(128) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_permissions_permission_key (permission_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_key VARCHAR(64) NOT NULL,
  permission_key VARCHAR(128) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_role_permissions_role_permission (role_key, permission_key),
  KEY idx_role_permissions_role_key (role_key),
  KEY idx_role_permissions_permission_key (permission_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_uid VARCHAR(64) NOT NULL,
  role_key VARCHAR(64) NOT NULL,
  scope_type VARCHAR(32) NOT NULL DEFAULT 'global',
  scope_uid VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_user_roles_user_role_scope (user_uid, role_key, scope_type, scope_uid),
  KEY idx_user_roles_user_uid (user_uid),
  KEY idx_user_roles_role_key (role_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comment_mentions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mention_uid VARCHAR(64) NOT NULL,
  comment_uid VARCHAR(64) NOT NULL,
  task_uid VARCHAR(64) NOT NULL DEFAULT '',
  mentioned_user_uid VARCHAR(64) NOT NULL DEFAULT '',
  mentioned_username VARCHAR(64) NOT NULL DEFAULT '',
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_comment_mentions_mention_uid (mention_uid),
  KEY idx_comment_mentions_comment_uid (comment_uid),
  KEY idx_comment_mentions_task_uid (task_uid),
  KEY idx_comment_mentions_user_read (mentioned_user_uid, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS address_book (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contact_uid VARCHAR(64) NOT NULL,
  user_uid VARCHAR(64) NOT NULL DEFAULT '',
  username VARCHAR(64) NOT NULL DEFAULT '',
  display_name VARCHAR(128) NOT NULL,
  department_uid VARCHAR(64) NOT NULL DEFAULT '',
  department_name VARCHAR(128) NOT NULL DEFAULT '',
  job VARCHAR(128) NOT NULL DEFAULT '',
  phone VARCHAR(32) NOT NULL DEFAULT '',
  email VARCHAR(128) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  sort_order BIGINT NOT NULL DEFAULT 0,
  payload_json LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_address_book_contact_uid (contact_uid),
  UNIQUE KEY uniq_address_book_user_uid (user_uid),
  KEY idx_address_book_department_uid (department_uid),
  KEY idx_address_book_username (username),
  KEY idx_address_book_status_sort (status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contacts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contact_uid VARCHAR(64) NOT NULL,
  owner_user_uid VARCHAR(64) NOT NULL DEFAULT '',
  target_user_uid VARCHAR(64) NOT NULL DEFAULT '',
  display_name VARCHAR(128) NOT NULL DEFAULT '',
  relation_type VARCHAR(32) NOT NULL DEFAULT 'coworker',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  payload_json LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_contacts_contact_uid (contact_uid),
  UNIQUE KEY uniq_contacts_owner_target (owner_user_uid, target_user_uid),
  KEY idx_contacts_owner_user_uid (owner_user_uid),
  KEY idx_contacts_target_user_uid (target_user_uid),
  KEY idx_contacts_owner_relation_status (owner_user_uid, relation_type, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shares (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  share_uid VARCHAR(64) NOT NULL,
  resource_type VARCHAR(32) NOT NULL,
  resource_uid VARCHAR(64) NOT NULL,
  from_user_uid VARCHAR(64) NOT NULL DEFAULT '',
  to_user_uid VARCHAR(64) NOT NULL DEFAULT '',
  permission VARCHAR(16) NOT NULL DEFAULT 'read',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  shared_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,
  payload_json LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_shares_share_uid (share_uid),
  KEY idx_shares_resource (resource_type, resource_uid),
  KEY idx_shares_to_user_uid (to_user_uid),
  KEY idx_shares_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS board_members (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  board_uid VARCHAR(64) NOT NULL,
  user_uid VARCHAR(64) NOT NULL,
  member_role VARCHAR(32) NOT NULL DEFAULT 'viewer',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_board_members_board_user (board_uid, user_uid),
  KEY idx_board_members_board_uid (board_uid),
  KEY idx_board_members_user_uid (user_uid),
  KEY idx_board_members_role (member_role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS board_shares (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  share_uid VARCHAR(64) NOT NULL,
  board_uid VARCHAR(64) NOT NULL,
  from_user_uid VARCHAR(64) NOT NULL DEFAULT '',
  to_user_uid VARCHAR(64) NOT NULL DEFAULT '',
  permission VARCHAR(16) NOT NULL DEFAULT 'read',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  shared_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,
  payload_json LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_board_shares_share_uid (share_uid),
  KEY idx_board_shares_board_uid (board_uid),
  KEY idx_board_shares_to_user_uid (to_user_uid),
  KEY idx_board_shares_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS board_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  snapshot_uid VARCHAR(64) NOT NULL,
  board_uid VARCHAR(64) NOT NULL,
  version_no INT UNSIGNED NOT NULL,
  actor_user_uid VARCHAR(64) NOT NULL DEFAULT '',
  snapshot_json LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_board_snapshots_snapshot_uid (snapshot_uid),
  UNIQUE KEY uniq_board_snapshots_board_version (board_uid, version_no),
  KEY idx_board_snapshots_board_uid_created_at (board_uid, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users MODIFY role VARCHAR(32) NOT NULL DEFAULT 'employee';

