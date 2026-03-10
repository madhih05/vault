# Vault Backend API

Secure file vault backend built with Express, MongoDB, JWT auth, and Google Drive storage.

## Current Stack

- Node.js (CommonJS)
- Express 5
- MongoDB + Mongoose
- JWT auth (`jsonwebtoken`)
- Google Drive API (`googleapis`)
- Multer upload middleware
- express-validator
- express-rate-limit

## Project Layout

```text
src/
  server.js                 # App bootstrap and startup
  routes/                   # HTTP route definitions
  controllers/              # Route handlers
  middleware/               # Auth, request logging, upload, validation
  models/                   # Mongoose schemas
  config/                   # DB and Google Drive setup
  helpers/                  # Auth helpers
tests/
  auth.test.js              # Auth route hardening tests
  run-functional-tests.js   # End-to-end API checks against a running server
generate-keys.js            # Generates missing recovery keys for existing users
```

## Environment Variables

Create `backend/.env`:

```env
PORT=3000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REFRESH_TOKEN=your_google_refresh_token
DRIVE_FOLDER_ID=your_google_drive_folder_id

LOG_LEVEL=info
NODE_ENV=development
```

## Run

```bash
npm install
npm start
```

Server starts on `http://localhost:PORT` and mounts API routes under `/api`.

## Scripts

- `npm start`: start API server
- `npm test`: run Jest tests
- `npm run test:functional`: run functional checks against a running backend (`BASE_URL` optional)
- `node generate-keys.js`: backfill hashed recovery keys for users without one

## Auth Model

Protected endpoints accept token in either location:

- Header: `x-auth-token: <jwt>`
- Query param: `?token=<jwt>`

JWT payload contains:

- `id`
- `username`

JWT expiry is `2h`.

Auth failures return:

- `401 { "error": "Access denied. No token provided." }`
- `401 { "error": "Invalid or expired token." }`

## Validation and Limits

Validation errors use this shape:

```json
{
  "error": "Validation failed.",
  "details": [
    { "field": "fieldName", "message": "reason" }
  ]
}
```

Rate limits:

- `POST /api/login`: `5` attempts per `15` minutes per IP
- `POST /api/reset-with-key`: `3` attempts per `1` hour per IP

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/healthcheck` | No | Basic liveness check |
| `POST` | `/api/login` | No | Login and issue JWT |
| `POST` | `/api/change-password` | Yes | Change password with current password |
| `POST` | `/api/reset-with-key` | No | Reset password with username + recovery key |
| `POST` | `/api/upload` | Yes | Upload file (+ optional thumbnail) |
| `GET` | `/api/files` | Yes | List files with pagination and filters |
| `GET` | `/api/files/:id/view` | Yes | Stream file inline or as attachment |
| `GET` | `/api/files/:id/thumbnail` | Yes | Stream uploaded custom thumbnail |
| `DELETE` | `/api/files/:id` | Yes | Delete file and metadata |

Note: `POST /api/register` exists in controller code but is currently disabled in `src/routes/auth.js`.

## Endpoint Notes

### `GET /healthcheck`

- Response: `200 { "status": "ok", "message": "Server is awake!" }`

### `POST /api/login`

Request body:

```json
{
  "username": "string",
  "password": "string"
}
```

Success response:

```json
{
  "token": "jwt_token",
  "user": {
    "id": "mongodb_object_id",
    "username": "your_username"
  }
}
```

Common errors: `400`, `429`, `500`.

### `POST /api/change-password`

Request body:

```json
{
  "currentPassword": "string (min 8 chars)",
  "newPassword": "string (min 8 chars)"
}
```

Success response:

```json
{
  "success": true,
  "message": "Password updated successfully."
}
```

Common errors: `400`, `401`, `404`, `500`.

### `POST /api/reset-with-key`

Request body:

```json
{
  "username": "alphanumeric",
  "recoveryKey": "XXXX-XXXX-XXXX-XXXX",
  "newPassword": "string (min 8 chars)"
}
```

Success response:

```json
{
  "success": true,
  "message": "Password updated successfully."
}
```

Common errors: `400`, `429`, `500`.

### `POST /api/upload`

Content type: `multipart/form-data`

Form fields:

- `vaultFile` (required)
- `vaultThumbnail` (optional custom thumbnail)

Behavior:

- Files are first stored in OS temp directory.
- File is uploaded to Google Drive.
- Metadata is stored in MongoDB.
- Temp files are cleaned up in `finally`.
- Unknown file types are accepted and stored.
- Max upload size: `50MB`.

Success response includes `fileData` with fields like:

- `_id`, `originalName`, `driveFileId`, `mimeType`, `uploadDate`
- `thumbnailDriveFileId`, `thumbnailMimeType`, `thumbnailWebViewLink` (if thumbnail uploaded)

### `GET /api/files`

Query params (optional):

- `page` (default `1`)
- `limit` (default `20`, max `100`)
- `fileName` (case-insensitive partial match)
- `fileType`

`fileType` behavior:

- `media`: includes image/video, excludes HEIC/HEIF
- `documents`: includes HEIC/HEIF and non media/audio types
- other token (for example `pdf`, `.docx`, `application/json`): matches MIME type or extension

Sort order: `uploadDate` desc, then `_id` desc.

Response includes:

- `files`: array
- `pagination`: `page`, `limit`, `total`, `totalPages`, `hasNextPage`, `hasPrevPage`

### `GET /api/files/:id/view`

Streams binary content from Drive.

Query params:

- `download=1` or `download=true`: forces attachment download

Disposition behavior:

- `inline` for known preview-safe MIME types
- `attachment` for everything else

Content type fallback is `application/octet-stream`.

### `GET /api/files/:id/thumbnail`

Streams uploaded custom thumbnail from Drive.

Errors:

- `404` when the file has no uploaded custom thumbnail
- `500` on fetch/stream errors

### `DELETE /api/files/:id`

Deletes:

- main file from Google Drive
- custom thumbnail from Google Drive (best-effort)
- file record from MongoDB

Success response:

```json
{
  "success": true,
  "message": "File permanently deleted from Vault."
}
```

## Current Behavior and Constraints

- Registration route is disabled.
- File records are not user-scoped (global list across all users).
- CORS is enabled with default settings.
- Request logger logs method, path, status code, and duration.
