#!/usr/bin/env node

import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

const REQUIRED_TABLES = [
  "schedule_plans",
  "schedule_items",
  "schedule_dependencies",
  "schedule_snapshots",
  "schedule_templates",
  "schedule_template_shares",
  "schedule_item_comments"
];

const REQUIRED_INDEXES = [
  {
    table: "schedule_plans",
    columns: ["project_uid", "status"],
    label: "schedule_plans(project_uid, status)"
  },
  {
    table: "schedule_items",
    columns: ["plan_uid", "sort_order"],
    label: "schedule_items(plan_uid, sort_order)"
  },
  {
    table: "schedule_items",
    columns: ["task_uid"],
    label: "schedule_items(task_uid)"
  },
  {
    table: "schedule_items",
    columns: ["start_date", "end_date"],
    label: "schedule_items(start_date, end_date)"
  },
  {
    table: "schedule_snapshots",
    columns: ["plan_uid", "created_at"],
    label: "schedule_snapshots(plan_uid, created_at)"
  }
];

const env = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "xjg"
};

function fail(code, message, details = {}) {
  console.error(JSON.stringify({
    ok: false,
    code,
    message,
    ...details
  }, null, 2));
  process.exitCode = 1;
}

function maskTarget() {
  return `${env.user}@${env.host}:${env.port}/${env.database}`;
}

function normalizeIndexRows(rows) {
  const byIndex = new Map();

  for (const row of rows) {
    const key = `${row.TABLE_NAME}.${row.INDEX_NAME}`;
    const current = byIndex.get(key) || {
      table: row.TABLE_NAME,
      index: row.INDEX_NAME,
      columns: []
    };

    current.columns[Number(row.SEQ_IN_INDEX) - 1] = row.COLUMN_NAME;
    byIndex.set(key, current);
  }

  return Array.from(byIndex.values()).map((item) => ({
    ...item,
    columns: item.columns.filter(Boolean)
  }));
}

function hasIndex(indexes, table, columns) {
  return indexes.some((index) => (
    index.table === table
    && columns.every((column, indexPosition) => index.columns[indexPosition] === column)
  ));
}

async function main() {
  if (!Number.isInteger(env.port) || env.port <= 0) {
    fail("FAIL_ENV_INVALID", "MYSQL_PORT must be a positive integer.", { target: maskTarget() });
    return;
  }

  let conn;
  try {
    conn = await mysql.createConnection({
      host: env.host,
      port: env.port,
      user: env.user,
      password: env.password,
      database: env.database,
      charset: "utf8mb4",
      connectTimeout: Number(process.env.MYSQL_CONNECT_TIMEOUT || 5000)
    });
  } catch (error) {
    fail("FAIL_CONNECT", error.message, {
      mysqlCode: error.code || "",
      target: maskTarget()
    });
    return;
  }

  try {
    const [tableRows] = await conn.execute(
      `
        SELECT TABLE_NAME
        FROM information_schema.tables
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME IN (${REQUIRED_TABLES.map(() => "?").join(", ")})
      `,
      [env.database, ...REQUIRED_TABLES]
    );

    const existingTables = tableRows.map((row) => row.TABLE_NAME).sort();
    const missingTables = REQUIRED_TABLES.filter((table) => !existingTables.includes(table));

    const [indexRows] = await conn.execute(
      `
        SELECT TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX, COLUMN_NAME
        FROM information_schema.statistics
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME IN (${REQUIRED_TABLES.map(() => "?").join(", ")})
        ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
      `,
      [env.database, ...REQUIRED_TABLES]
    );

    const indexes = normalizeIndexRows(indexRows);
    const missingIndexes = REQUIRED_INDEXES
      .filter((required) => !hasIndex(indexes, required.table, required.columns))
      .map((required) => required.label);

    if (missingTables.length || missingIndexes.length) {
      fail("FAIL_SCHEDULE_SCHEMA", "Schedule schema is incomplete.", {
        target: maskTarget(),
        missingTables,
        missingIndexes
      });
      return;
    }

    console.log(JSON.stringify({
      ok: true,
      target: maskTarget(),
      tables: existingTables,
      indexes: REQUIRED_INDEXES.map((item) => item.label)
    }, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  fail("FAIL_RUNTIME", error.message, {
    mysqlCode: error.code || "",
    target: maskTarget()
  });
});
