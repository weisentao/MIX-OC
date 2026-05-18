import mysql from "mysql2/promise";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { hashPassword } from "../utils/password.js";
import { ensureAdminHrStorageAuditSchema, ensureNotificationsSchema, ensureScheduleSchema } from "./feature-schema.js";

let mysqlReady = false;

export const mysqlPool = mysql.createPool({
  host: env.mysql.host,
  port: env.mysql.port,
  user: env.mysql.user,
  password: env.mysql.password,
  database: env.mysql.database,
  connectionLimit: env.mysql.connectionLimit,
  connectTimeout: env.mysql.connectTimeout,
  waitForConnections: true,
  namedPlaceholders: true
});

function quoteDatabaseName(database) {
  const clean = String(database || "").trim();
  if (!/^[A-Za-z0-9_$]+$/.test(clean)) {
    throw new Error(`Invalid MYSQL_DATABASE name: ${clean}`);
  }
  return `\`${clean}\``;
}

async function ensureDatabaseExists() {
  const conn = await mysql.createConnection({
    host: env.mysql.host,
    port: env.mysql.port,
    user: env.mysql.user,
    password: env.mysql.password,
    connectTimeout: env.mysql.connectTimeout
  });

  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS ${quoteDatabaseName(env.mysql.database)}
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    logger.info("MySQL database is ready.", { database: env.mysql.database });
  } finally {
    await conn.end();
  }
}

export async function pingMySQL() {
  try {
    const conn = await mysqlPool.getConnection();
    await conn.ping();
    conn.release();
    logger.info("MySQL connection ready.");
    mysqlReady = true;
    return true;
  } catch (error) {
    if (error.code === "ER_BAD_DB_ERROR") {
      try {
        await ensureDatabaseExists();
        const conn = await mysqlPool.getConnection();
        await conn.ping();
        conn.release();
        logger.info("MySQL connection ready.");
        mysqlReady = true;
        return true;
      } catch (createError) {
        mysqlReady = false;
        logger.warn("MySQL database initialization failed. Service still starts in phase 1.", {
          message: createError.message
        });
        return false;
      }
    }

    mysqlReady = false;
    logger.warn("MySQL connection check failed. Service still starts in phase 1.", {
      message: error.message
    });
    return false;
  }
}

export function isMySQLReady() {
  return mysqlReady;
}

export const FIXED_ADMIN_PASSWORD = "admin";

function departmentEnOf(department) {
  return String(department || "项目管理部").trim() || "项目管理部";
}

const LEGACY_VIRTUAL_USERNAMES = ["MIX-yanyunxue"];

export const REAL_USER_SEED_SUMMARY = {
  sourceRows: 72,
  uniqueUsers: 71,
  adminCandidates: 23,
  employees: 48,
  duplicates: 1
};

export const REAL_USER_SEED_ROWS = [
  ["MIX-zhengjianxing", "郑建兴", "视效包装二部", "阿兴", true, ""],
  ["MIX-chenlingfeng", "陈凌枫", "视效包装二部", "视效包装二部", false, ""],
  ["MIX-linxin", "林鑫", "视效包装二部", "视效包装二部", false, ""],
  ["MIX-wangjianjie", "王建杰", "视效包装二部", "视效包装二部", false, ""],
  ["MIX-weichuanhua", "魏传华", "视效包装二部", "华仔", false, ""],
  ["MIX-wuqiang", "吴强", "视效包装二部", "视效包装二部", false, ""],
  ["MIX-wuyanfeng", "吴焱锋", "视效包装二部", "视效包装二部", false, ""],
  ["MIX-yangbin", "杨彬", "视效包装二部", "视效包装二部", false, ""],
  ["MIX-yangyuxiang", "杨宇翔", "视效包装二部", "视效包装二部", false, ""],
  ["MIX-zhangbocheng", "张博成", "视效包装二部", "视效包装二部", true, ""],
  ["MIX-zhangjinzhao", "张劲钊", "视效包装二部", "视效包装二部", false, ""],
  ["MIX-zhangsiping", "张思平", "视效包装二部", "视效包装二部", false, ""],
  ["MIX-zhengqianyu", "郑前钰", "视效包装二部", "视效包装二部", false, ""],
  ["MIX-zhujiangmin", "朱江民", "视效包装二部", "视效包装二部", true, ""],
  ["MIX-xuxiao", "许晓", "视效包装一部", "视效包装一部", true, ""],
  ["MIX-chenzhaoyu", "陈昭宇", "视效包装一部", "视效包装一部", true, ""],
  ["MIX-limingmin", "李明民", "视效包装一部", "视效包装一部", false, ""],
  ["MIX-liliyou", "林立友", "视效包装一部", "视效包装一部", false, ""],
  ["MIX-wujunjie", "吴俊杰", "视效包装一部", "视效包装一部", false, ""],
  ["MIX-wuyaohong", "吴耀鸿", "视效包装一部", "视效包装一部", false, ""],
  ["MIX-xiezhixiong", "谢志雄", "视效包装一部", "视效包装一部", false, ""],
  ["MIX-xuchao", "许超", "视效包装一部", "视效包装一部", false, ""],
  ["MIX-zhuxin", "朱鑫", "视效包装一部", "视效包装一部", false, ""],
  ["MIX-yaolimin", "姚丽敏", "视效包装三部", "大姚", true, ""],
  ["MIX-jianglanyu", "江兰昱", "视效包装三部", "视效包装三部", false, ""],
  ["MIX-lianyuwei", "连雨微", "视效包装三部", "视效包装三部", false, ""],
  ["MIX-xieyisi", "谢宜思", "视效包装三部", "视效包装三部", false, ""],
  ["MIX-zhengli", "郑栎", "视效包装三部", "视效包装三部", false, ""],
  ["MIX-liujiawen", "刘佳文", "美术设计一部", "美术设计一部", true, ""],
  ["MIX-linqingyu", "林清钰", "美术设计一部", "美术设计一部", false, ""],
  ["MIX-linxiaoyu", "林晓钰", "美术设计一部", "美术设计一部", false, ""],
  ["MIX-linzheyi", "林哲毅", "美术设计一部", "林便当", false, ""],
  ["MIX-sunfeng", "孙峰", "美术设计一部", "美术设计一部", false, ""],
  ["MIX-weiyuqing", "魏玉晴", "美术设计一部", "美术设计一部", false, ""],
  ["MIX-yuanye", "袁也", "美术设计一部", "美术设计一部", true, "重复部门：美术设计一部、美术设计二部"],
  ["MIX-zhangwenbin", "张文彬", "美术设计一部", "美术设计一部", false, ""],
  ["MIX-zhangzhihong", "张志鸿", "美术设计一部", "美术设计一部", false, ""],
  ["MIX-weijiayang", "魏嘉洋", "美术设计二部", "美术设计二部", true, ""],
  ["MIX-chenxin", "陈鑫", "美术设计二部", "美术设计二部", false, ""],
  ["MIX-linyanting", "林燕婷", "美术设计二部", "美术设计二部", false, ""],
  ["MIX-linyixiang", "林逸翔", "美术设计二部", "美术设计二部", false, ""],
  ["MIX-liuxinying", "刘忻颖", "美术设计二部", "美术设计二部", false, ""],
  ["MIX-yangyiqin", "杨易琴", "美术设计二部", "美术设计二部", false, ""],
  ["MIX-zhangyufeng", "张郁枫", "美术设计二部", "美术设计二部", false, ""],
  ["MIX-zhengmanyia", "郑曼雅", "美术设计二部", "美术设计二部", false, ""],
  ["MIX-yangxuanyao", "杨轩耀", "三维动态设计部", "三维动态设计部", true, ""],
  ["MIX-chenyuanye", "陈原野", "三维动态设计部", "三维动态设计部", false, ""],
  ["MIX-dingtao", "丁涛", "三维动态设计部", "三维动态设计部", false, ""],
  ["MIX-laisunda", "赖舜达", "三维动态设计部", "三维动态设计部", false, ""],
  ["MIX-lilin", "李林", "三维动态设计部", "三维动态设计部", false, ""],
  ["MIX-linyunzhi", "林云志", "三维动态设计部", "三维动态设计部", true, ""],
  ["MIX-luzhenkang", "陆振康", "三维动态设计部", "三维动态设计部", false, ""],
  ["MIX-shenglinfeng", "盛林峰", "三维动态设计部", "三维动态设计部", false, ""],
  ["MIX-wangdongxun", "王栋勋", "三维动态设计部", "三维动态设计部", false, ""],
  ["MIX-weibowen", "魏博文", "三维动态设计部", "三维动态设计部", false, ""],
  ["MIX-wuxuanyang", "吴炫阳", "三维动态设计部", "三维动态设计部", false, ""],
  ["MIX-xiajiahe", "谢家赫", "三维动态设计部", "三维动态设计部", false, ""],
  ["MIX-xiexingyu", "谢星宇", "三维动态设计部", "三维动态设计部", false, ""],
  ["MIX-zhangyuchen", "张宇晨", "三维动态设计部", "三维动态设计部", false, ""],
  ["MIX-zhumin", "朱敏", "项目管理部", "项目管理部", true, ""],
  ["MIX-chengyihua", "程谊华", "项目管理部", "项目管理部", true, ""],
  ["MIX-chenjinglan", "陈静兰", "项目管理部", "项目管理部", true, ""],
  ["MIX-chennuo", "陈诺", "项目管理部", "项目管理部", true, ""],
  ["MIX-liangying", "梁颖", "项目管理部", "项目管理部", true, ""],
  ["MIX-tengchangqing", "滕长青", "项目管理部", "项目管理部", true, ""],
  ["MIX-xuexueting", "熊学婷", "项目管理部", "项目管理部", true, ""],
  ["MIX-yeyuchang", "叶聿畅", "项目管理部", "项目管理部", true, ""],
  ["MIX-zhangyanmei", "张燕梅", "项目管理部", "项目管理部", true, ""],
  ["MIX-zhengangqi", "郑安琪", "项目管理部", "项目管理部", true, ""],
  ["MIX-zhunaichun", "朱乃春", "项目管理部", "项目管理部", true, ""],
  ["MIX-lushihong", "鲁世洪", "项目管理部", "项目管理部", true, ""]
];

export const REAL_USER_DEFAULT_PASSWORD = "MIX801002";

function buildProfileNote(adminCandidate, duplicateNote) {
  const notes = [];
  if (adminCandidate) notes.push("权限预留：管理员候选");
  if (duplicateNote) notes.push(duplicateNote);
  return notes.join("；");
}

function toSeedUserFromRealRow(row) {
  const [username, name, department, job, adminCandidate, duplicateNote] = row;
  const finalDepartment = String(department || "项目管理部").trim() || "项目管理部";
  const finalJob = String(job || finalDepartment || "成员").trim() || "成员";
  const finalName = String(name || username || "").trim() || String(username || "").trim();
  const profileNote = buildProfileNote(Boolean(adminCandidate), String(duplicateNote || "").trim());
  return {
    username: String(username || "").trim(),
    password: REAL_USER_DEFAULT_PASSWORD,
    name: finalName,
    role: Boolean(adminCandidate) ? "manager" : "employee",
    phone: "",
    email: "",
    department: finalDepartment,
    departmentEn: finalDepartment,
    job: finalJob,
    mbti: "ENTP",
    mood: "",
    signature: "",
    profileNote,
    characterLabel: Boolean(adminCandidate) ? "管理员候选" : finalJob,
    status: "active",
    adminCandidate: Boolean(adminCandidate),
    duplicateNote: String(duplicateNote || "").trim(),
    avatar: finalName.slice(0, 1)
  };
}

const realUsers = REAL_USER_SEED_ROWS.map(toSeedUserFromRealRow);

function makeTempUserUid() {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function ensureSeedUser(seedUser, options = {}) {
  const { forcePasswordReset = false, forceRole = false, updateExisting = true } = options;
  const [rows] = await mysqlPool.execute(
    "SELECT id, user_uid FROM users WHERE username = ? LIMIT 1",
    [seedUser.username]
  );

  const nextDepartment = String(seedUser.department || "项目管理部").trim() || "项目管理部";
  const nextJob = String(seedUser.job || nextDepartment || "成员").trim() || "成员";
  const nextName = String(seedUser.name || seedUser.username || "").trim() || seedUser.username;
  const nextProfileNote = String(seedUser.profileNote || "").trim();
  const nextCharacterLabel = String(seedUser.characterLabel || nextJob).trim() || nextJob;
  const nextStatus = String(seedUser.status || "active").trim() || "active";

  if (rows.length) {
    const user = rows[0];
    if (!user.user_uid) {
      await mysqlPool.execute("UPDATE users SET user_uid = ? WHERE id = ?", [`u-${user.id}`, user.id]);
    }

    if (updateExisting) {
    if (forceRole) {
        await mysqlPool.execute(
          `UPDATE users SET
            name = ?,
            role = ?,
            status = ?,
            phone = ?,
            email = ?,
            department = ?,
            department_en = ?,
            job = ?,
            mbti = ?,
            mood = ?,
            signature = ?,
            profile_note = ?,
            character_label = ?
          WHERE id = ?`,
          [
            nextName,
            seedUser.role,
            nextStatus,
            seedUser.phone || "",
            seedUser.email || "",
            nextDepartment,
            seedUser.departmentEn || departmentEnOf(nextDepartment),
            nextJob,
            seedUser.mbti || "ENTP",
            seedUser.mood || "",
            seedUser.signature || "",
            nextProfileNote,
            nextCharacterLabel,
            user.id
          ]
        );
      } else {
        await mysqlPool.execute(
          `UPDATE users SET
            name = ?,
            role = ?,
            status = ?,
            phone = ?,
            email = ?,
            department = ?,
            department_en = ?,
            job = ?,
            mbti = ?,
            mood = ?,
            signature = ?,
            profile_note = ?,
            character_label = ?
          WHERE id = ?`,
          [
            nextName,
            seedUser.role,
            nextStatus,
            seedUser.phone || "",
            seedUser.email || "",
            nextDepartment,
            seedUser.departmentEn || departmentEnOf(nextDepartment),
            nextJob,
            seedUser.mbti || "ENTP",
            seedUser.mood || "",
            seedUser.signature || "",
            nextProfileNote,
            nextCharacterLabel,
            user.id
          ]
        );
      }
    }

    if (forcePasswordReset) {
      const passwordHash = await hashPassword(seedUser.password);
      await mysqlPool.execute("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, user.id]);
    }
    return;
  }

  const passwordHash = await hashPassword(seedUser.password);
  const tempUserUid = makeTempUserUid();
  const [result] = await mysqlPool.execute(
    `INSERT INTO users (
      user_uid, username, password_hash, name, role, status, phone, email,
      department, department_en, job, mbti, mood, signature, profile_note,
      character_label, avatar_image, character_image, signature_image
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tempUserUid,
      seedUser.username,
      passwordHash,
      nextName,
      seedUser.role,
      nextStatus,
      seedUser.phone || "",
      seedUser.email || "",
      nextDepartment,
      seedUser.departmentEn || departmentEnOf(nextDepartment),
      nextJob,
      seedUser.mbti || "ENTP",
      seedUser.mood || "",
      seedUser.signature || "",
      nextProfileNote,
      nextCharacterLabel,
      "",
      "",
      ""
    ]
  );

  const userId = result.insertId;
  await mysqlPool.execute("UPDATE users SET user_uid = ? WHERE id = ?", [`u-${userId}`, userId]);
}

async function cleanupLegacyVirtualUsers() {
  if (!LEGACY_VIRTUAL_USERNAMES.length) return;
  await mysqlPool.execute("DELETE FROM users WHERE username IN (?) AND username <> 'admin'", [LEGACY_VIRTUAL_USERNAMES]);
}

const workspaceTableStatements = [
  `
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS permissions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      permission_key VARCHAR(128) NOT NULL,
      name VARCHAR(128) NOT NULL,
      description VARCHAR(255) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_permissions_permission_key (permission_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS role_permissions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      role_key VARCHAR(64) NOT NULL,
      permission_key VARCHAR(128) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_role_permissions_role_permission (role_key, permission_key),
      KEY idx_role_permissions_role_key (role_key),
      KEY idx_role_permissions_permission_key (permission_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS project_groups (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      group_uid VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      suffix VARCHAR(32) NOT NULL DEFAULT '',
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      sort_order BIGINT NOT NULL DEFAULT 0,
      payload_json LONGTEXT NULL,
      created_by VARCHAR(64) NOT NULL DEFAULT '',
      updated_by VARCHAR(64) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_project_groups_group_uid (group_uid),
      KEY idx_project_groups_title (title),
      KEY idx_project_groups_status_sort (status, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS notifications (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      notification_uid VARCHAR(64) NOT NULL,
      recipient_user_uid VARCHAR(64) NOT NULL,
      type VARCHAR(64) NOT NULL DEFAULT 'general',
      title VARCHAR(255) NOT NULL DEFAULT '',
      content_text TEXT NULL,
      resource_type VARCHAR(64) NOT NULL DEFAULT '',
      resource_uid VARCHAR(64) NOT NULL DEFAULT '',
      project_uid VARCHAR(64) NOT NULL DEFAULT '',
      task_uid VARCHAR(64) NOT NULL DEFAULT '',
      actor_user_uid VARCHAR(64) NOT NULL DEFAULT '',
      actor_name VARCHAR(128) NOT NULL DEFAULT '',
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      read_at DATETIME NULL,
      payload_json LONGTEXT NULL,
      created_by VARCHAR(64) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_notifications_notification_uid (notification_uid),
      KEY idx_notifications_recipient_read_created (recipient_user_uid, is_read, created_at),
      KEY idx_notifications_project_uid (project_uid),
      KEY idx_notifications_task_uid (task_uid),
      KEY idx_notifications_resource (resource_type, resource_uid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS projects (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      project_uid VARCHAR(64) NOT NULL,
      legacy_project_id BIGINT NULL,
      group_uid VARCHAR(64) NOT NULL DEFAULT '',
      name VARCHAR(255) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      owner_text VARCHAR(255) NOT NULL DEFAULT '',
      start_date DATE NULL,
      end_date DATE NULL,
      archived TINYINT(1) NOT NULL DEFAULT 0,
      sort_order BIGINT NOT NULL DEFAULT 0,
      payload_json LONGTEXT NULL,
      created_by VARCHAR(64) NOT NULL DEFAULT '',
      updated_by VARCHAR(64) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_projects_project_uid (project_uid),
      KEY idx_projects_group_uid (group_uid),
      KEY idx_projects_status_sort (status, sort_order),
      KEY idx_projects_legacy_project_id (legacy_project_id),
      KEY idx_projects_name (name),
      KEY idx_projects_archived (archived)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS project_members (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      member_uid VARCHAR(64) NOT NULL,
      project_uid VARCHAR(64) NOT NULL,
      user_uid VARCHAR(64) NOT NULL DEFAULT '',
      member_name VARCHAR(64) NOT NULL DEFAULT '',
      member_role VARCHAR(32) NOT NULL DEFAULT 'readonly',
      department VARCHAR(64) NOT NULL DEFAULT '',
      department_en VARCHAR(128) NOT NULL DEFAULT '',
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      sort_order BIGINT NOT NULL DEFAULT 0,
      joined_at DATETIME NULL,
      payload_json LONGTEXT NULL,
      created_by VARCHAR(64) NOT NULL DEFAULT '',
      updated_by VARCHAR(64) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_project_members_member_uid (member_uid),
      UNIQUE KEY uniq_project_members_project_user_name (project_uid, user_uid, member_name),
      KEY idx_project_members_project_uid (project_uid),
      KEY idx_project_members_user_uid (user_uid),
      KEY idx_project_members_role (member_role)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS tasks (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      task_uid VARCHAR(64) NOT NULL,
      project_uid VARCHAR(64) NOT NULL,
      legacy_task_id BIGINT NULL,
      title VARCHAR(255) NOT NULL,
      task_type VARCHAR(64) NOT NULL DEFAULT '',
      module_key VARCHAR(32) NOT NULL DEFAULT 'project',
      owner_user_uid VARCHAR(64) NOT NULL DEFAULT '',
      owner_text VARCHAR(255) NOT NULL DEFAULT '',
      status VARCHAR(16) NOT NULL DEFAULT 'todo',
      priority VARCHAR(16) NOT NULL DEFAULT 'normal',
      start_date DATE NULL,
      end_date DATE NULL,
      archived TINYINT(1) NOT NULL DEFAULT 0,
      expanded TINYINT(1) NOT NULL DEFAULT 0,
      sort_order BIGINT NOT NULL DEFAULT 0,
      note_text TEXT NULL,
      payload_json LONGTEXT NULL,
      created_by VARCHAR(64) NOT NULL DEFAULT '',
      updated_by VARCHAR(64) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tasks_task_uid (task_uid),
      KEY idx_tasks_project_uid (project_uid),
      KEY idx_tasks_legacy_task_id (legacy_task_id),
      KEY idx_tasks_project_status (project_uid, status),
      KEY idx_tasks_module_key (module_key),
      KEY idx_tasks_owner_user_uid (owner_user_uid),
      KEY idx_tasks_archived (archived),
      KEY idx_tasks_start_end (start_date, end_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS task_comments (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      comment_uid VARCHAR(64) NOT NULL,
      task_uid VARCHAR(64) NOT NULL,
      project_uid VARCHAR(64) NOT NULL DEFAULT '',
      user_uid VARCHAR(64) NOT NULL DEFAULT '',
      user_name VARCHAR(64) NOT NULL DEFAULT '',
      user_dept VARCHAR(128) NOT NULL DEFAULT '',
      tone VARCHAR(32) NOT NULL DEFAULT '',
      content_text TEXT NOT NULL,
      commented_at DATETIME NULL,
      payload_json LONGTEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_task_comments_comment_uid (comment_uid),
      KEY idx_task_comments_task_uid (task_uid),
      KEY idx_task_comments_project_uid (project_uid),
      KEY idx_task_comments_user_uid (user_uid),
      KEY idx_task_comments_task_time (task_uid, commented_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS tags (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tag_uid VARCHAR(64) NOT NULL,
      name VARCHAR(64) NOT NULL,
      color VARCHAR(32) NOT NULL DEFAULT '',
      scope VARCHAR(32) NOT NULL DEFAULT 'workspace',
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      sort_order BIGINT NOT NULL DEFAULT 0,
      is_system TINYINT(1) NOT NULL DEFAULT 0,
      payload_json LONGTEXT NULL,
      created_by VARCHAR(64) NOT NULL DEFAULT '',
      updated_by VARCHAR(64) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tags_tag_uid (tag_uid),
      UNIQUE KEY uniq_tags_scope_name (scope, name),
      KEY idx_tags_color (color),
      KEY idx_tags_status_sort (status, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS project_tags (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      project_uid VARCHAR(64) NOT NULL,
      tag_uid VARCHAR(64) NOT NULL DEFAULT '',
      tag_name VARCHAR(64) NOT NULL DEFAULT '',
      tag_color VARCHAR(32) NOT NULL DEFAULT '',
      sort_order BIGINT NOT NULL DEFAULT 0,
      created_by VARCHAR(64) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_project_tags_project_tag (project_uid, tag_uid, tag_name),
      KEY idx_project_tags_project_uid (project_uid),
      KEY idx_project_tags_tag_uid (tag_uid),
      KEY idx_project_tags_tag_name (tag_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS templates (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      template_uid VARCHAR(64) NOT NULL,
      legacy_template_id VARCHAR(64) NOT NULL DEFAULT '',
      title VARCHAR(255) NOT NULL,
      group_key VARCHAR(64) NOT NULL DEFAULT '',
      parent_template_uid VARCHAR(64) NOT NULL DEFAULT '',
      owner_user_uid VARCHAR(64) NOT NULL DEFAULT '',
      visibility VARCHAR(16) NOT NULL DEFAULT 'private',
      is_locked TINYINT(1) NOT NULL DEFAULT 0,
      sort_order BIGINT NOT NULL DEFAULT 0,
      task_count INT NOT NULL DEFAULT 0,
      content_json LONGTEXT NULL,
      payload_json LONGTEXT NULL,
      created_by VARCHAR(64) NOT NULL DEFAULT '',
      updated_by VARCHAR(64) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_templates_template_uid (template_uid),
      KEY idx_templates_legacy_template_id (legacy_template_id),
      KEY idx_templates_group_key (group_key),
      KEY idx_templates_parent_template_uid (parent_template_uid),
      KEY idx_templates_owner_user_uid (owner_user_uid),
      KEY idx_templates_visibility_sort (visibility, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS template_shares (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      share_uid VARCHAR(64) NOT NULL,
      template_uid VARCHAR(64) NOT NULL,
      from_user_uid VARCHAR(64) NOT NULL DEFAULT '',
      to_user_uid VARCHAR(64) NOT NULL DEFAULT '',
      permission VARCHAR(16) NOT NULL DEFAULT 'read',
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      note VARCHAR(255) NOT NULL DEFAULT '',
      shared_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NULL,
      payload_json LONGTEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_template_shares_share_uid (share_uid),
      UNIQUE KEY uniq_template_shares_template_target (template_uid, to_user_uid),
      KEY idx_template_shares_template_uid (template_uid),
      KEY idx_template_shares_from_user_uid (from_user_uid),
      KEY idx_template_shares_to_user_uid (to_user_uid),
      KEY idx_template_shares_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS boards (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      board_uid VARCHAR(64) NOT NULL,
      scope_type VARCHAR(32) NOT NULL DEFAULT 'project',
      scope_uid VARCHAR(64) NOT NULL DEFAULT '',
      project_uid VARCHAR(64) NOT NULL DEFAULT '',
      title VARCHAR(255) NOT NULL,
      description_text TEXT NULL,
      owner_user_uid VARCHAR(64) NOT NULL DEFAULT '',
      is_archived TINYINT(1) NOT NULL DEFAULT 0,
      latest_version INT UNSIGNED NOT NULL DEFAULT 0,
      board_state_json LONGTEXT NULL,
      files_json LONGTEXT NULL,
      app_state_json LONGTEXT NULL,
      payload_json LONGTEXT NULL,
      created_by VARCHAR(64) NOT NULL DEFAULT '',
      updated_by VARCHAR(64) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_boards_board_uid (board_uid),
      KEY idx_boards_scope (scope_type, scope_uid),
      KEY idx_boards_project_uid (project_uid),
      KEY idx_boards_owner_user_uid (owner_user_uid),
      KEY idx_boards_archived_updated_at (is_archived, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS board_history (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      history_uid VARCHAR(64) NOT NULL,
      board_uid VARCHAR(64) NOT NULL,
      version_no INT UNSIGNED NOT NULL,
      actor_user_uid VARCHAR(64) NOT NULL DEFAULT '',
      action_type VARCHAR(32) NOT NULL DEFAULT 'save',
      change_summary VARCHAR(255) NOT NULL DEFAULT '',
      elements_json LONGTEXT NULL,
      files_json LONGTEXT NULL,
      app_state_json LONGTEXT NULL,
      payload_json LONGTEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_board_history_history_uid (history_uid),
      UNIQUE KEY uniq_board_history_board_version (board_uid, version_no),
      KEY idx_board_history_board_uid_created_at (board_uid, created_at),
      KEY idx_board_history_actor_user_uid (actor_user_uid),
      KEY idx_board_history_action_type (action_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS carousel_notices (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      notice_uid VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      content_text TEXT NOT NULL,
      notice_type VARCHAR(64) NOT NULL DEFAULT '',
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      priority INT NOT NULL DEFAULT 0,
      link_text VARCHAR(80) NOT NULL DEFAULT '',
      link_url VARCHAR(512) NOT NULL DEFAULT '',
      link_target VARCHAR(16) NOT NULL DEFAULT '_self',
      start_at DATETIME NULL,
      end_at DATETIME NULL,
      sort_order BIGINT NOT NULL DEFAULT 0,
      payload_json LONGTEXT NULL,
      created_by VARCHAR(64) NOT NULL DEFAULT '',
      updated_by VARCHAR(64) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_carousel_notices_notice_uid (notice_uid),
      KEY idx_carousel_notices_enabled_sort (enabled, sort_order),
      KEY idx_carousel_notices_active_status (enabled, status, priority, sort_order),
      KEY idx_carousel_notices_notice_type (notice_type),
      KEY idx_carousel_notices_active_window (start_at, end_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `
];

export async function ensureWorkspaceTables() {
  for (const statement of workspaceTableStatements) {
    await mysqlPool.execute(statement);
  }
  await ensureCarouselNoticeColumns();
  logger.info("Workspace tables are ready.");
}

async function addColumnIfMissing(tableName, columnName, ddl) {
  const [[row]] = await mysqlPool.execute(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
    `,
    [tableName, columnName]
  );
  if (Number(row.count || 0) === 0) {
    await mysqlPool.execute(ddl);
  }
}

async function addIndexIfMissing(tableName, indexName, ddl) {
  const [[row]] = await mysqlPool.execute(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
    `,
    [tableName, indexName]
  );
  if (Number(row.count || 0) === 0) {
    await mysqlPool.execute(ddl);
  }
}

async function ensureCarouselNoticeColumns() {
  await addColumnIfMissing("carousel_notices", "status", "ALTER TABLE carousel_notices ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'active'");
  await addColumnIfMissing("carousel_notices", "priority", "ALTER TABLE carousel_notices ADD COLUMN priority INT NOT NULL DEFAULT 0");
  await addColumnIfMissing("carousel_notices", "link_text", "ALTER TABLE carousel_notices ADD COLUMN link_text VARCHAR(80) NOT NULL DEFAULT ''");
  await addColumnIfMissing("carousel_notices", "link_url", "ALTER TABLE carousel_notices ADD COLUMN link_url VARCHAR(512) NOT NULL DEFAULT ''");
  await addColumnIfMissing("carousel_notices", "link_target", "ALTER TABLE carousel_notices ADD COLUMN link_target VARCHAR(16) NOT NULL DEFAULT '_self'");
  await addColumnIfMissing("carousel_notices", "start_at", "ALTER TABLE carousel_notices ADD COLUMN start_at DATETIME NULL");
  await addColumnIfMissing("carousel_notices", "end_at", "ALTER TABLE carousel_notices ADD COLUMN end_at DATETIME NULL");
  await mysqlPool.execute("UPDATE carousel_notices SET status = CASE WHEN enabled = 1 THEN 'active' ELSE 'disabled' END WHERE status = ''");
  await addIndexIfMissing(
    "carousel_notices",
    "idx_carousel_notices_active_status",
    "CREATE INDEX idx_carousel_notices_active_status ON carousel_notices (enabled, status, priority, sort_order)"
  );
}

export async function ensureAuthTables() {
  await mysqlPool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_uid VARCHAR(64) NOT NULL,
      username VARCHAR(64) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(64) NOT NULL,
      role VARCHAR(16) NOT NULL DEFAULT 'user',
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      phone VARCHAR(32) NOT NULL DEFAULT '',
      email VARCHAR(128) NOT NULL DEFAULT '',
      department VARCHAR(64) NOT NULL DEFAULT '项目管理',
      department_en VARCHAR(128) NOT NULL DEFAULT 'PROJECT MANAGEMENT',
      job VARCHAR(64) NOT NULL DEFAULT '项目专员',
      mbti VARCHAR(16) NOT NULL DEFAULT 'ENTP',
      mood VARCHAR(255) NOT NULL DEFAULT '',
      signature VARCHAR(255) NOT NULL DEFAULT '',
      profile_note VARCHAR(255) NOT NULL DEFAULT '',
      character_label VARCHAR(64) NOT NULL DEFAULT '',
      avatar_image LONGTEXT NULL,
      character_image LONGTEXT NULL,
      signature_image LONGTEXT NULL,
      last_login_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_users_user_uid (user_uid),
      UNIQUE KEY uniq_users_username (username),
      KEY idx_users_email (email),
      KEY idx_users_phone (phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await mysqlPool.execute("ALTER TABLE users MODIFY role VARCHAR(32) NOT NULL DEFAULT 'employee'");

  await mysqlPool.execute(`
    CREATE TABLE IF NOT EXISTS app_states (
      id VARCHAR(64) NOT NULL,
      data_json LONGTEXT NOT NULL,
      updated_by VARCHAR(64) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureWorkspaceTables();
  await ensureScheduleSchema(mysqlPool);
  await ensureAdminHrStorageAuditSchema(mysqlPool);
  await ensureNotificationsSchema(mysqlPool);

  await ensureSeedUser(
    {
      username: "admin",
      password: FIXED_ADMIN_PASSWORD,
      name: "admin",
      role: "admin",
      phone: "",
      email: "",
      department: "项目管理部",
      departmentEn: "PROJECT MANAGEMENT",
      job: "超级管理员",
      mbti: "ENTP",
      mood: "",
      signature: "",
      profileNote: "固定超级管理员账号",
      characterLabel: "超级管理员",
      status: "active"
    },
    {
      forcePasswordReset: true,
      forceRole: true,
      updateExisting: true
    }
  );

  for (const user of realUsers) {
    await ensureSeedUser(user, {
      forcePasswordReset: false,
      forceRole: false,
      updateExisting: false
    });
  }

  logger.info("Real users seeded.", REAL_USER_SEED_SUMMARY);

  logger.info("Auth tables are ready.");
  mysqlReady = true;
}

