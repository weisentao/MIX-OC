import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import {
  getJwtVerifyOptions,
  signAccessToken,
  verifyAccessToken
} from "../src/config/jwt.js";
import { validateRequiredEnv } from "../src/config/env.js";

function withEnv(values, callback) {
  const previous = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    if (values[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }

  try {
    return callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("JWT verification pins HS256 and rejects unsigned none algorithm tokens", () => {
  assert.deepEqual(getJwtVerifyOptions().algorithms, ["HS256"]);

  const unsignedToken = jwt.sign({ sub: "u-none", role: "admin" }, "", {
    algorithm: "none",
    expiresIn: "1h"
  });

  assert.throws(() => verifyAccessToken(unsignedToken), /jwt|signature|algorithm/i);
});

test("signed access tokens include the configured expiration", () => {
  const token = signAccessToken({ sub: "u-exp", role: "admin" }, { expiresIn: "15m" });
  const decoded = jwt.decode(token);

  assert.equal(decoded.sub, "u-exp");
  assert.equal(decoded.exp - decoded.iat, 15 * 60);
});

test("production environment rejects missing, placeholder, short JWT secret and unsafe expiration", () => {
  for (const jwtSecret of ["", "secret", "replace-with-a-long-random-secret-before-production", "short-secret"]) {
    assert.throws(
      () =>
        withEnv(
          {
            NODE_ENV: "production",
            JWT_SECRET: jwtSecret,
            JWT_EXPIRES_IN: "2h",
            CORS_ORIGIN: "https://frontend.example.com"
          },
          () => validateRequiredEnv()
        ),
      /JWT_SECRET/
    );
  }

  assert.throws(
    () =>
      withEnv(
        {
          NODE_ENV: "production",
          JWT_SECRET: "12345678901234567890123456789012",
          JWT_EXPIRES_IN: "7d",
          CORS_ORIGIN: "https://frontend.example.com"
        },
        () => validateRequiredEnv()
      ),
    /JWT_EXPIRES_IN/
  );

  assert.throws(
    () =>
      withEnv(
        {
          NODE_ENV: "production",
          JWT_SECRET: "12345678901234567890123456789012",
          JWT_EXPIRES_IN: "forever",
          CORS_ORIGIN: "https://frontend.example.com"
        },
        () => validateRequiredEnv()
      ),
    /JWT_EXPIRES_IN/
  );
});

test("production environment accepts strong JWT secret and bounded expiration", () => {
  assert.doesNotThrow(() =>
    withEnv(
      {
        NODE_ENV: "production",
        JWT_SECRET: "12345678901234567890123456789012",
        JWT_EXPIRES_IN: "2h",
        CORS_ORIGIN: "https://frontend.example.com"
      },
      () => validateRequiredEnv()
    )
  );
});
