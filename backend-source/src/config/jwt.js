import jwt from "jsonwebtoken";
import { env } from "./env.js";

const JWT_ALGORITHM = "HS256";

export function getJwtSignOptions(options = {}) {
  return {
    algorithm: JWT_ALGORITHM,
    expiresIn: options.expiresIn || env.jwt.expiresIn
  };
}

export function getJwtVerifyOptions() {
  return {
    algorithms: [JWT_ALGORITHM]
  };
}

export function signAccessToken(payload, options = {}) {
  return jwt.sign(payload, env.jwt.secret, getJwtSignOptions(options));
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.secret, getJwtVerifyOptions());
}
