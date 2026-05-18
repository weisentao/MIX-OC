# Auth API

Base path: `/api`

## POST `/login`
- Body: `{ "username": string, "password": string }`
- 200: `{ "token": string, "user": object }`
- 400/401/403: `{ "message": string }`

## POST `/register`
- Body:
  - `username` (must match `MIX-*`)
  - `password`
  - `name`
  - `phone`
  - `email`
  - optional: `department`, `job`, `mbti`, `securityQuestion`, `securityAnswer`
- 201: `{ "token": string, "user": object }`
- 400/409: `{ "message": string }`

## GET `/me`
- Header: `Authorization: Bearer <token>`
- 200: `user object`
- 401: `{ "message": "Unauthorized" }`

## GET `/security-question`
- Query: `username`
- Current behavior:
  - if user not found: 404 `{ "message": "Account not found" }`
  - if user exists: 404 `{ "message": "Security question is not enabled. Use username + phone for password reset." }`
- Note: this endpoint is for compatibility only; current recovery flow is phone-based.

## POST `/forgot-password`
- Body: `{ "username": string, "phone": string, "newPassword": string }`
- 200: `{ "message": "Password reset successful. Please login again." }`
- 400/404: `{ "message": string }`

## POST `/change-password`
- Header: `Authorization: Bearer <token>`
- Body: `{ "oldPassword": string, "newPassword": string }`
- 200: `{ "message": "Password changed successfully" }`
- 400/401/404: `{ "message": string }`

## GET `/dev/token`
- 200: `{ "token": string }`
