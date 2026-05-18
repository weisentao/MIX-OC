import { createHash } from "node:crypto";
import { signAccessToken } from "../config/jwt.js";
import { env } from "../config/env.js";
import { FIXED_ADMIN_PASSWORD, REAL_USER_SEED_ROWS, REAL_USER_DEFAULT_PASSWORD, isMySQLReady, mysqlPool } from "../db/mysql.js";
import { comparePassword, hashPassword } from "../utils/password.js";

function codeForStatus(status) {
  return {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT"
  }[status] || "REQUEST_FAILED";
}

function errorBody(message, code, req) {
  const body = { code, message };
  if (req?.requestId) body.requestId = req.requestId;
  return body;
}

function sendAuthError(res, req, status, message, code = codeForStatus(status)) {
  return res.status(status).json(errorBody(message, code, req));
}

function isAuthMemoryFallbackAllowed() {
  return (process.env.NODE_ENV || env.nodeEnv) !== "production";
}

function sendAuthDatabaseUnavailable(res, req) {
  return sendAuthError(res, req, 503, "认证服务暂不可用", "SERVICE_UNAVAILABLE");
}

const usersByUsername = new Map();
const usersById = new Map();
let seeded = false;

function makeTempUserUid() {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function nowText(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function stableUid(prefix, value) {
  const raw = String(value || "").trim();
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const hash = createHash("sha1").update(raw, "utf8").digest("hex").slice(0, 12);
  if (!slug) return `${prefix}-${hash}`;
  return /[^\x00-\x7F]/.test(raw) ? `${prefix}-${slug}-${hash}` : `${prefix}-${slug}`;
}

function departmentEnOf(department) {
  return String(department || "项目管理部").trim() || "项目管理部";
}

function buildProfileNote(adminCandidate, duplicateNote) {
  const notes = [];
  if (adminCandidate) notes.push("权限预留：管理员候选");
  if (duplicateNote) notes.push(duplicateNote);
  return notes.join("；");
}

function toSeedMemoryUser(row) {
  const [username, name, department, job, adminCandidate, duplicateNote] = row;
  const finalDepartment = String(department || "项目管理部").trim() || "项目管理部";
  const finalJob = String(job || finalDepartment || "成员").trim() || "成员";
  const finalName = String(name || username || "").trim() || String(username || "").trim();
  const profileNote = buildProfileNote(Boolean(adminCandidate), String(duplicateNote || "").trim());
  return {
    id: `u-${String(username || "").replace(/^MIX-/, "").toLowerCase()}`,
    username: String(username || "").trim(),
    password: REAL_USER_DEFAULT_PASSWORD,
    name: finalName,
    role: Boolean(adminCandidate) ? "manager" : "employee",
    phone: "",
    email: "",
    department: finalDepartment,
    job: finalJob,
    mbti: "ENTP",
    mood: "",
    signature: "",
    profileNote,
    characterLabel: Boolean(adminCandidate) ? "管理员候选" : finalJob,
    registeredAt: "2026-05-09 15:20:05"
  };
}

const realMemorySeedUsers = REAL_USER_SEED_ROWS.map(toSeedMemoryUser);

function normalizeMbti(value) {
  const next = String(value || "ENTP").trim().toUpperCase().slice(0, 4);
  return next || "ENTP";
}

function isValidEmail(value = "") {
  const clean = String(value || "").trim();
  if (!clean) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
}

function formatUser(row) {
  return {
    id: row.user_uid || row.id || "",
    name: row.name,
    role: row.role,
    avatar: row.avatar || String(row.name || "").slice(0, 1).toUpperCase(),
    department: row.department || "项目管理",
    departmentEn: row.department_en || row.departmentEn || "PROJECT MANAGEMENT",
    email: row.email || "",
    departmentId: row.department_uid || row.departmentId || "",
    departmentUid: row.department_uid || row.departmentUid || "",
    mbti: row.mbti || "ENTP",
    job: row.job || "项目专员",
    phone: row.phone || "",
    registeredAt: row.registered_at || row.registeredAt || "",
    mood: row.mood || "",
    signature: row.signature || "",
    profileNote: row.profile_note || row.profileNote || "",
    status: row.status || "active",
    characterLabel: row.character_label || row.characterLabel || row.job || "项目专员",
    avatarImage: row.avatar_image || row.avatarImage || "",
    characterImage: row.character_image || row.characterImage || "",
    signatureImage: row.signature_image || row.signatureImage || ""
  };
}

function signForUser(user) {
  return signAccessToken({
    sub: user.id,
    username: user.username,
    name: user.name || user.username,
    role: user.role || "user",
    department: user.department || "",
    departmentId: user.departmentId || user.department_uid || "",
    departmentUid: user.departmentUid || user.department_uid || ""
  });
}

function makeMemoryUser({
  id,
  username,
  passwordHash,
  name,
  role = "user",
  status = "active",
  phone = "",
  email = "",
  department = "项目管理",
  job = "项目专员",
  mbti = "ENTP",
  mood = "今天也要把任务说清楚",
  signature = "所有协作都从清单和评论开始。",
  profileNote = "",
  characterLabel = "",
  registeredAt = nowText()
}) {
  const finalName = String(name || username || "").trim();
  const finalJob = String(job || "项目专员").trim() || "项目专员";
  return {
    id,
    username: String(username || "").trim(),
    passwordHash,
    name: finalName,
    role,
    avatar: finalName.slice(0, 1).toUpperCase(),
    department,
    departmentEn: departmentEnOf(department),
    email: String(email || "").trim(),
    mbti: normalizeMbti(mbti),
    job: finalJob,
    phone: String(phone || "").trim(),
    registeredAt,
    mood: String(mood || "").trim(),
    signature: String(signature || "").trim(),
    profileNote: String(profileNote || finalJob).trim() || finalJob,
    status,
    characterLabel: String(characterLabel || finalJob).trim() || finalJob,
    avatarImage: "",
    characterImage: "",
    signatureImage: ""
  };
}

function addMemoryUser(user) {
  usersByUsername.set(user.username, user);
  usersById.set(user.id, user);
  return user;
}

async function ensureMemorySeedUsers() {
  if (seeded) return;

  const adminHash = await hashPassword(FIXED_ADMIN_PASSWORD);
  addMemoryUser(
    makeMemoryUser({
      id: "u-admin",
      username: "admin",
      passwordHash: adminHash,
      name: "admin",
      role: "admin",
      phone: "",
      email: "",
      department: "项目管理部",
      job: "超级管理员",
      mbti: "ENTP",
      mood: "",
      signature: "",
      profileNote: "固定超级管理员账号",
      characterLabel: "超级管理员",
      registeredAt: "2026-05-09 15:20:05"
    })
  );

  for (const seedUser of realMemorySeedUsers) {
    const passwordHash = await hashPassword(seedUser.password);
    addMemoryUser(
      makeMemoryUser({
        id: seedUser.id,
        username: seedUser.username,
        passwordHash,
        name: seedUser.name,
        role: seedUser.role,
        phone: seedUser.phone,
        email: seedUser.email,
        department: seedUser.department,
        job: seedUser.job,
        mbti: seedUser.mbti,
        mood: seedUser.mood,
        signature: seedUser.signature,
        profileNote: seedUser.profileNote,
        characterLabel: seedUser.characterLabel,
        registeredAt: seedUser.registeredAt
      })
    );
  }

  seeded = true;
}

async function loadUserByUsernameFromDb(username) {
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        u.id, u.user_uid, u.username, u.password_hash, u.name, u.role, u.status, u.phone, u.email,
        u.department, u.department_en, d.department_uid, u.job, u.mbti, u.mood, u.signature, u.profile_note,
        u.character_label, u.avatar_image, u.character_image, u.signature_image,
        DATE_FORMAT(u.created_at, '%Y-%m-%d %H:%i:%s') AS registered_at
      FROM users u
      LEFT JOIN departments d ON d.name = SUBSTRING_INDEX(u.department, ' / ', 1) AND d.status = 'active'
      WHERE u.username = ?
      LIMIT 1
    `,
    [username]
  );
  return rows[0] || null;
}

async function loadUserByUidFromDb(userUid) {
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        u.id, u.user_uid, u.username, u.password_hash, u.name, u.role, u.status, u.phone, u.email,
        u.department, u.department_en, d.department_uid, u.job, u.mbti, u.mood, u.signature, u.profile_note,
        u.character_label, u.avatar_image, u.character_image, u.signature_image,
        DATE_FORMAT(u.created_at, '%Y-%m-%d %H:%i:%s') AS registered_at
      FROM users u
      LEFT JOIN departments d ON d.name = SUBSTRING_INDEX(u.department, ' / ', 1) AND d.status = 'active'
      WHERE u.user_uid = ?
      LIMIT 1
    `,
    [userUid]
  );
  return rows[0] || null;
}

async function loginWithDb(cleanUsername, cleanPassword) {
  const user = await loadUserByUsernameFromDb(cleanUsername);
  if (!user) return { ok: false, status: 401, message: "账号或密码不正确" };
  if (user.status !== "active") return { ok: false, status: 403, message: "账号已被禁用" };

  const matched = await comparePassword(cleanPassword, user.password_hash);
  if (!matched) return { ok: false, status: 401, message: "账号或密码不正确" };

  await mysqlPool.execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);
  const safeUser = formatUser(user);
  return {
    ok: true,
    token: signAccessToken({
      sub: safeUser.id,
      username: cleanUsername,
      name: safeUser.name || cleanUsername,
      role: safeUser.role || "user",
      department: safeUser.department || "",
      departmentId: safeUser.departmentId || "",
      departmentUid: safeUser.departmentUid || ""
    }),
    user: safeUser
  };
}

async function loginWithMemory(cleanUsername, cleanPassword) {
  await ensureMemorySeedUsers();
  const user = usersByUsername.get(cleanUsername);
  if (!user) return { ok: false, status: 401, message: "账号或密码不正确" };
  if (user.status !== "active") return { ok: false, status: 403, message: "账号已被禁用" };

  const matched = await comparePassword(cleanPassword, user.passwordHash);
  if (!matched) return { ok: false, status: 401, message: "账号或密码不正确" };

  return { ok: true, token: signForUser(user), user: formatUser(user) };
}

function validateRegisterInput(input) {
  const {
    username,
    password,
    name,
    phone,
    email,
    department = "项目管理",
    job = "项目专员",
    mbti = "ENTP"
  } = input || {};

  const cleanUsername = String(username || "").trim();
  const cleanPassword = String(password || "");
  const cleanName = String(name || "").trim();
  const cleanPhone = String(phone || "").trim();
  const cleanEmail = String(email || "").trim();
  const cleanDepartment = String(department || "项目管理").trim() || "项目管理";
  const cleanJob = String(job || "项目专员").trim() || "项目专员";
  const cleanMbti = normalizeMbti(mbti);

  if (!cleanUsername || !cleanPassword || !cleanName || !cleanPhone || !cleanEmail) {
    return { ok: false, status: 400, message: "请完整填写注册信息" };
  }
  if (!/^MIX-[A-Za-z0-9_-]+$/.test(cleanUsername)) {
    return { ok: false, status: 400, message: "用户名必须以 MIX- 开头" };
  }
  if (!/^1[0-9]{10}$/.test(cleanPhone)) {
    return { ok: false, status: 400, message: "手机号格式不正确" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { ok: false, status: 400, message: "邮箱格式不正确" };
  }

  return {
    ok: true,
    value: {
      cleanUsername,
      cleanPassword,
      cleanName,
      cleanPhone,
      cleanEmail,
      cleanDepartment,
      cleanJob,
      cleanMbti
    }
  };
}

async function ensureRegistrationDepartment(executor, departmentName, departmentEn) {
  const cleanName = String(departmentName || "项目管理").trim() || "项目管理";
  const cleanNameEn = String(departmentEn || cleanName).trim() || cleanName;
  const [existingRows] = await executor.execute(
    `
      SELECT department_uid, name, name_en, status
      FROM departments
      WHERE name = ?
      LIMIT 1
    `,
    [cleanName]
  );
  if (existingRows[0]) {
    if (existingRows[0].name_en !== cleanNameEn || existingRows[0].status !== "active") {
      await executor.execute(
        "UPDATE departments SET name_en = ?, status = 'active' WHERE department_uid = ?",
        [cleanNameEn, existingRows[0].department_uid]
      );
      existingRows[0].name_en = cleanNameEn;
      existingRows[0].status = "active";
    }
    return existingRows[0];
  }

  const departmentUid = stableUid("dept", cleanName);
  const [[sortRow]] = await executor.query("SELECT COALESCE(MAX(sort_order) + 1, 0) AS sort_order FROM departments");
  await executor.execute(
    `INSERT INTO departments (department_uid, name, name_en, status, sort_order)
     VALUES (?, ?, ?, 'active', ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       name_en = VALUES(name_en),
       status = 'active'`,
    [departmentUid, cleanName, cleanNameEn, Number(sortRow?.sort_order || 0)]
  );

  return {
    department_uid: departmentUid,
    name: cleanName,
    name_en: cleanNameEn
  };
}

async function isClaimableSeedUser(user = {}) {
  if (!user?.user_uid) return false;
  if (String(user.status || "") !== "active") return false;
  if (String(user.phone || "").trim() || String(user.email || "").trim()) return false;
  if (!REAL_USER_SEED_ROWS.some(([username]) => username === user.username)) return false;
  return comparePassword(REAL_USER_DEFAULT_PASSWORD, user.password_hash);
}

async function claimSeedUserRegistration(conn, existing, value, passwordHash) {
  const existingRole = existing.role || "employee";
  const departmentEn = departmentEnOf(existing.department || value.cleanDepartment);
  const department = await ensureRegistrationDepartment(conn, existing.department || value.cleanDepartment, departmentEn);
  const nextJob = existing.job || value.cleanJob;
  const nextProfileNote = existing.profile_note || nextJob;
  const nextCharacterLabel = existing.character_label || nextJob;

  await conn.execute(
    `UPDATE users SET
      password_hash = ?,
      name = ?,
      status = 'active',
      phone = ?,
      email = ?,
      department = ?,
      department_en = ?,
      job = ?,
      mbti = ?,
      profile_note = ?,
      character_label = ?
     WHERE user_uid = ?`,
    [
      passwordHash,
      value.cleanName || existing.name || value.cleanUsername,
      value.cleanPhone,
      value.cleanEmail,
      department.name,
      department.name_en || departmentEn,
      nextJob,
      value.cleanMbti,
      nextProfileNote,
      nextCharacterLabel,
      existing.user_uid
    ]
  );
  await conn.execute(
    `INSERT INTO user_roles (user_uid, role_key, scope_type, scope_uid)
     VALUES (?, ?, 'global', '')
     ON DUPLICATE KEY UPDATE role_key = VALUES(role_key)`,
    [existing.user_uid, existingRole]
  );
  await conn.execute(
    `INSERT INTO address_book (
      contact_uid, user_uid, username, display_name, department_uid, department_name,
      job, phone, email, status, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0)
    ON DUPLICATE KEY UPDATE
      username = VALUES(username),
      display_name = VALUES(display_name),
      department_uid = VALUES(department_uid),
      department_name = VALUES(department_name),
      job = VALUES(job),
      phone = VALUES(phone),
      email = VALUES(email),
      status = 'active'`,
    [
      stableUid("contact", value.cleanUsername),
      existing.user_uid,
      value.cleanUsername,
      value.cleanName || existing.name || value.cleanUsername,
      department.department_uid,
      department.name,
      nextJob,
      value.cleanPhone,
      value.cleanEmail
    ]
  );

  const safeUser = formatUser({
    ...existing,
    name: value.cleanName || existing.name || value.cleanUsername,
    role: existingRole,
    phone: value.cleanPhone,
    email: value.cleanEmail,
    department: department.name,
    department_en: department.name_en || departmentEn,
    department_uid: department.department_uid,
    job: nextJob,
    mbti: value.cleanMbti,
    profile_note: nextProfileNote,
    character_label: nextCharacterLabel
  });
  return {
    ok: true,
    token: signAccessToken({
      sub: safeUser.id,
      username: value.cleanUsername,
      name: safeUser.name || value.cleanUsername,
      role: safeUser.role || existingRole,
      department: safeUser.department || "",
      departmentId: safeUser.departmentId || "",
      departmentUid: safeUser.departmentUid || ""
    }),
    user: safeUser
  };
}

async function registerWithDb(value) {
  const exists = await loadUserByUsernameFromDb(value.cleanUsername);

  const passwordHash = await hashPassword(value.cleanPassword);
  if (exists) {
    if (!(await isClaimableSeedUser(exists))) {
      return { ok: false, status: 409, message: "用户名已存在" };
    }
    const conn = await mysqlPool.getConnection();
    try {
      await conn.beginTransaction();
      const claimed = await claimSeedUserRegistration(conn, exists, value, passwordHash);
      await conn.commit();
      return claimed;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  const departmentEn = departmentEnOf(value.cleanDepartment);
  const profileNote = value.cleanJob;
  const characterLabel = value.cleanJob;
  const mood = "今天也要把任务说清楚";
  const signature = "所有协作都从清单和评论开始。";
  const role = "employee";
  const conn = await mysqlPool.getConnection();
  let userUid = "";

  try {
    await conn.beginTransaction();
    const department = await ensureRegistrationDepartment(conn, value.cleanDepartment, departmentEn);

    const [result] = await conn.execute(
      `
        INSERT INTO users (
          user_uid, username, password_hash, name, role, status, phone, email,
          department, department_en, job, mbti, mood, signature, profile_note,
          character_label, avatar_image, character_image, signature_image
        ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '')
      `,
      [
        makeTempUserUid(),
        value.cleanUsername,
        passwordHash,
        value.cleanName,
        role,
        value.cleanPhone,
        value.cleanEmail,
        department.name,
        department.name_en || departmentEn,
        value.cleanJob,
        value.cleanMbti,
        mood,
        signature,
        profileNote,
        characterLabel
      ]
    );

    userUid = `u-${result.insertId}`;
    await conn.execute("UPDATE users SET user_uid = ? WHERE id = ?", [userUid, result.insertId]);
    await conn.execute(
      `INSERT INTO user_roles (user_uid, role_key, scope_type, scope_uid)
       VALUES (?, ?, 'global', '')
       ON DUPLICATE KEY UPDATE role_key = VALUES(role_key)`,
      [userUid, role]
    );
    await conn.execute(
      `INSERT INTO address_book (
        contact_uid, user_uid, username, display_name, department_uid, department_name,
        job, phone, email, status, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0)
      ON DUPLICATE KEY UPDATE
        username = VALUES(username),
        display_name = VALUES(display_name),
        department_uid = VALUES(department_uid),
        department_name = VALUES(department_name),
        job = VALUES(job),
        phone = VALUES(phone),
        email = VALUES(email),
        status = 'active'`,
      [
        stableUid("contact", value.cleanUsername),
        userUid,
        value.cleanUsername,
        value.cleanName,
        department.department_uid,
        department.name,
        value.cleanJob,
        value.cleanPhone,
        value.cleanEmail
      ]
    );

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  const created = await loadUserByUidFromDb(userUid);
  const safeUser = formatUser(created);

  return {
    ok: true,
    token: signAccessToken({
      sub: safeUser.id,
      username: value.cleanUsername,
      name: safeUser.name || value.cleanUsername,
      role: safeUser.role || role,
      department: safeUser.department || "",
      departmentId: safeUser.departmentId || "",
      departmentUid: safeUser.departmentUid || ""
    }),
    user: safeUser
  };
}

async function registerWithMemory(value) {
  await ensureMemorySeedUsers();
  if (usersByUsername.has(value.cleanUsername)) {
    return { ok: false, status: 409, message: "用户名已存在" };
  }

  const passwordHash = await hashPassword(value.cleanPassword);
  const user = addMemoryUser(
    makeMemoryUser({
      id: `u-local-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      username: value.cleanUsername,
      passwordHash,
      name: value.cleanName,
      role: "user",
      phone: value.cleanPhone,
      email: value.cleanEmail,
      department: value.cleanDepartment,
      job: value.cleanJob,
      mbti: value.cleanMbti
    })
  );

  return { ok: true, token: signForUser(user), user: formatUser(user) };
}

async function meWithDb(userId) {
  const user = await loadUserByUidFromDb(String(userId));
  if (!user) return null;
  return formatUser(user);
}

async function meWithMemory(userId) {
  await ensureMemorySeedUsers();
  const user = usersById.get(String(userId));
  if (!user) return null;
  return formatUser(user);
}

async function updateMeWithDb(userId, payload = {}) {
  const user = await loadUserByUidFromDb(String(userId));
  if (!user) return { ok: false, status: 404, message: "账号不存在" };

  const updates = [];
  const params = [];
  const setField = (column, value) => {
    updates.push(`${column} = ?`);
    params.push(value);
  };

  if (payload.email !== undefined) {
    const email = String(payload.email || "").trim().slice(0, 128);
    if (!isValidEmail(email)) return { ok: false, status: 400, message: "邮箱格式不正确" };
    setField("email", email);
  }
  if (payload.phone !== undefined) setField("phone", String(payload.phone || "").trim().slice(0, 32));
  if (payload.mbti !== undefined) setField("mbti", normalizeMbti(payload.mbti));
  if (payload.mood !== undefined) setField("mood", String(payload.mood || "").trim().slice(0, 255));
  if (payload.signature !== undefined) setField("signature", String(payload.signature || "").trim().slice(0, 255));
  if (payload.avatarImage !== undefined) setField("avatar_image", String(payload.avatarImage || ""));
  if (payload.characterImage !== undefined) setField("character_image", String(payload.characterImage || ""));
  if (payload.signatureImage !== undefined) setField("signature_image", String(payload.signatureImage || ""));

  if (!updates.length) return { ok: false, status: 400, message: "没有可更新的个人资料字段" };

  params.push(user.id);
  await mysqlPool.execute(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params);

  if (payload.email !== undefined || payload.phone !== undefined) {
    await mysqlPool.execute(
      `
        UPDATE address_book
        SET email = ?, phone = ?
        WHERE user_uid = ?
      `,
      [
        payload.email !== undefined ? String(payload.email || "").trim().slice(0, 128) : String(user.email || ""),
        payload.phone !== undefined ? String(payload.phone || "").trim().slice(0, 32) : String(user.phone || ""),
        String(user.user_uid || user.id || "")
      ]
    );
  }

  const updated = await loadUserByUidFromDb(String(userId));
  return { ok: true, user: formatUser(updated) };
}

async function updateMeWithMemory(userId, payload = {}) {
  await ensureMemorySeedUsers();
  const user = usersById.get(String(userId));
  if (!user) return { ok: false, status: 404, message: "账号不存在" };

  if (payload.email !== undefined) {
    const email = String(payload.email || "").trim().slice(0, 128);
    if (!isValidEmail(email)) return { ok: false, status: 400, message: "邮箱格式不正确" };
    user.email = email;
  }
  if (payload.phone !== undefined) user.phone = String(payload.phone || "").trim().slice(0, 32);
  if (payload.mbti !== undefined) user.mbti = normalizeMbti(payload.mbti);
  if (payload.mood !== undefined) user.mood = String(payload.mood || "").trim().slice(0, 255);
  if (payload.signature !== undefined) user.signature = String(payload.signature || "").trim().slice(0, 255);
  if (payload.avatarImage !== undefined) user.avatarImage = String(payload.avatarImage || "");
  if (payload.characterImage !== undefined) user.characterImage = String(payload.characterImage || "");
  if (payload.signatureImage !== undefined) user.signatureImage = String(payload.signatureImage || "");

  return { ok: true, user: formatUser(user) };
}

export async function login(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return sendAuthError(res, req, 400, "请填写账号和密码");
  }

  const cleanUsername = String(username).trim();
  const cleanPassword = String(password);

  if (!isMySQLReady() && !isAuthMemoryFallbackAllowed()) return sendAuthDatabaseUnavailable(res, req);
  const result = isMySQLReady()
    ? await loginWithDb(cleanUsername, cleanPassword)
    : await loginWithMemory(cleanUsername, cleanPassword);

  if (!result.ok) {
    return sendAuthError(res, req, result.status, result.message);
  }
  return res.json({ token: result.token, user: result.user });
}

export async function register(req, res) {
  const check = validateRegisterInput(req.body);
  if (!check.ok) {
    return sendAuthError(res, req, check.status, check.message);
  }

  if (!isMySQLReady() && !isAuthMemoryFallbackAllowed()) return sendAuthDatabaseUnavailable(res, req);
  const result = isMySQLReady()
    ? await registerWithDb(check.value)
    : await registerWithMemory(check.value);

  if (!result.ok) {
    return sendAuthError(res, req, result.status, result.message);
  }

  return res.status(201).json({ token: result.token, user: result.user });
}

export async function me(req, res) {
  const userId = req.auth?.sub;
  if (!userId) return sendAuthError(res, req, 401, "请先登录");

  if (!isMySQLReady() && !isAuthMemoryFallbackAllowed()) return sendAuthDatabaseUnavailable(res, req);
  const user = isMySQLReady() ? await meWithDb(userId) : await meWithMemory(userId);
  if (!user) return sendAuthError(res, req, 401, "请先登录");
  return res.json(user);
}

export async function patchMe(req, res) {
  const userId = req.auth?.sub;
  if (!userId) return sendAuthError(res, req, 401, "请先登录");

  if (!isMySQLReady() && !isAuthMemoryFallbackAllowed()) return sendAuthDatabaseUnavailable(res, req);
  const result = isMySQLReady()
    ? await updateMeWithDb(userId, req.body || {})
    : await updateMeWithMemory(userId, req.body || {});

  if (!result.ok) return sendAuthError(res, req, result.status, result.message);
  return res.json(result.user);
}

export async function getSecurityQuestion(req, res) {
  const cleanUsername = String(req.query?.username || "").trim();
  if (!cleanUsername) {
    return sendAuthError(res, req, 400, "请填写账号");
  }

  if (isMySQLReady()) {
    const user = await loadUserByUsernameFromDb(cleanUsername);
    if (!user) return sendAuthError(res, req, 404, "账号不存在");
    return sendAuthError(res, req, 404, "当前未启用密保问题，请使用用户名和手机号重置密码");
  }
  if (!isAuthMemoryFallbackAllowed()) return sendAuthDatabaseUnavailable(res, req);

  await ensureMemorySeedUsers();
  const user = usersByUsername.get(cleanUsername);
  if (!user) return sendAuthError(res, req, 404, "账号不存在");
  return sendAuthError(res, req, 404, "当前未启用密保问题，请使用用户名和手机号重置密码");
}

export async function forgotPassword(req, res) {
  const { username, phone, newPassword } = req.body || {};
  const cleanUsername = String(username || "").trim();
  const cleanPhone = String(phone || "").trim();
  const cleanPassword = String(newPassword || "");

  if (!cleanUsername || !cleanPhone || !cleanPassword) {
    return sendAuthError(res, req, 400, "请填写账号、手机号和新密码");
  }
  if (cleanUsername === "admin") {
    return sendAuthError(res, req, 403, "管理员密码为固定密码，无法重置");
  }

  if (isMySQLReady()) {
    const user = await loadUserByUsernameFromDb(cleanUsername);
    if (!user) return sendAuthError(res, req, 404, "账号不存在");
    if ((user.phone || "") !== cleanPhone) return sendAuthError(res, req, 400, "手机号验证失败");

    const passwordHash = await hashPassword(cleanPassword);
    await mysqlPool.execute("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, user.id]);
    return res.json({ message: "密码已重置，请重新登录" });
  }
  if (!isAuthMemoryFallbackAllowed()) return sendAuthDatabaseUnavailable(res, req);

  await ensureMemorySeedUsers();
  const user = usersByUsername.get(cleanUsername);
  if (!user) return sendAuthError(res, req, 404, "账号不存在");
  if ((user.phone || "") !== cleanPhone) return sendAuthError(res, req, 400, "手机号验证失败");
  user.passwordHash = await hashPassword(cleanPassword);
  return res.json({ message: "密码已重置，请重新登录" });
}

export async function changePassword(req, res) {
  const userId = String(req.auth?.sub || "").trim();
  if (!userId) return sendAuthError(res, req, 401, "请先登录");

  const { oldPassword, newPassword } = req.body || {};
  const cleanOldPassword = String(oldPassword || "");
  const cleanNewPassword = String(newPassword || "");

  if (!cleanOldPassword || !cleanNewPassword) {
    return sendAuthError(res, req, 400, "请填写旧密码和新密码");
  }
  if (cleanNewPassword.length < 6) {
    return sendAuthError(res, req, 400, "新密码至少 6 位");
  }

  if (isMySQLReady()) {
    const user = await loadUserByUidFromDb(userId);
    if (!user) return sendAuthError(res, req, 404, "账号不存在");
    if (user.username === "admin") {
      return sendAuthError(res, req, 403, "管理员密码为固定密码，无法修改");
    }
    const matched = await comparePassword(cleanOldPassword, user.password_hash);
    if (!matched) return sendAuthError(res, req, 400, "旧密码不正确");
    const passwordHash = await hashPassword(cleanNewPassword);
    await mysqlPool.execute("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, user.id]);
    return res.json({ message: "密码修改成功" });
  }
  if (!isAuthMemoryFallbackAllowed()) return sendAuthDatabaseUnavailable(res, req);

  await ensureMemorySeedUsers();
  const user = usersById.get(userId);
  if (!user) return sendAuthError(res, req, 404, "账号不存在");
  if (user.username === "admin") {
    return sendAuthError(res, req, 403, "管理员密码为固定密码，无法修改");
  }
  const matched = await comparePassword(cleanOldPassword, user.passwordHash);
  if (!matched) return sendAuthError(res, req, 400, "旧密码不正确");
  user.passwordHash = await hashPassword(cleanNewPassword);
  return res.json({ message: "密码修改成功" });
}

export function isDevTokenAllowed(nodeEnv = process.env.NODE_ENV || env.nodeEnv) {
  return nodeEnv !== "production";
}

export async function issueDevToken(req, res) {
  if (!isDevTokenAllowed()) {
    return res.status(404).json(errorBody("未找到", "NOT_FOUND", req));
  }

  await ensureMemorySeedUsers();
  const admin = usersByUsername.get("admin");
  const token = admin ? signForUser(admin) : signAccessToken({ sub: "dev-user", role: "admin" });
  res.json({ token });
}
