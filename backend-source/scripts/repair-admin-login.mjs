#!/usr/bin/env node

import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { FIXED_ADMIN_PASSWORD } from "../src/db/mysql.js";
import { hashPassword } from "../src/utils/password.js";

dotenv.config();

function mysqlConfig() {
  return {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "xjg",
    connectTimeout: Number(process.env.MYSQL_CONNECT_TIMEOUT || 5000)
  };
}

async function ensureAdminLogin(conn) {
  const passwordHash = await hashPassword(FIXED_ADMIN_PASSWORD);
  const [result] = await conn.execute(
    `INSERT INTO users (
      user_uid, username, password_hash, name, role, status, phone, email,
      department, department_en, job, mbti, mood, signature, profile_note,
      character_label, avatar_image, character_image, signature_image
    ) VALUES ('u-admin', 'admin', ?, 'admin', 'admin', 'active', '', '',
      '项目管理部', 'PROJECT MANAGEMENT', '超级管理员', 'ENTP',
      '', '', '固定超级管理员账号', '超级管理员', '', '', '')
    ON DUPLICATE KEY UPDATE
      user_uid = 'u-admin',
      password_hash = VALUES(password_hash),
      name = 'admin',
      role = 'admin',
      status = 'active',
      phone = '',
      email = '',
      department = VALUES(department),
      department_en = VALUES(department_en),
      job = VALUES(job),
      profile_note = VALUES(profile_note),
      character_label = VALUES(character_label)`,
    [passwordHash]
  );

  await conn.execute(
    `INSERT INTO user_roles (user_uid, role_key, scope_type, scope_uid)
     VALUES ('u-admin', 'admin', 'global', '')
     ON DUPLICATE KEY UPDATE role_key = 'admin'`
  );

  const [rows] = await conn.execute(
    "SELECT user_uid, username, role, status FROM users WHERE username = ? LIMIT 1",
    ["admin"]
  );

  return {
    changedRows: Number(result.changedRows || 0),
    affectedRows: Number(result.affectedRows || 0),
    admin: rows[0] || null
  };
}

async function main() {
  const conn = await mysql.createConnection(mysqlConfig());
  try {
    const result = await ensureAdminLogin(conn);
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, message: error.message, code: error.code || "" }, null, 2));
  process.exitCode = 1;
});
