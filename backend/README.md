# Vault API

Secure file vault backend built with Express, MongoDB, JWT auth, and Google Drive storage.

## Tech Stack

- Node.js + Express
- MongoDB + Mongoose
- JWT (`x-auth-token` header)
- Google Drive API (file storage)
- Multer (multipart upload handling)
- Express Validator (request validation)
- Express Rate Limit (auth hardening)

## Project Structure

```text
src/
	server.js                 # App bootstrap
	routes/                   # HTTP route definitions
	controllers/              # Request handlers
	middleware/               # Auth, validation, upload, request logging
	models/                   # MongoDB schemas
	config/                   # DB and Google Drive clients
	helpers/                  # Auth utilities
tests/
	auth.test.js              # Route hardening tests for /login
generate-keys.js            # Recovery key generator for existing users
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file with:

```env
PORT=3000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REFRESH_TOKEN=your_google_refresh_token
DRIVE_FOLDER_ID=your_google_drive_folder_id

LOG_LEVEL=info
```

### 3. Start the server

```bash
npm start
```

The server mounts routes under `/api`.

## Scripts

- `npm start`: start API server
- `npm test`: run Jest tests
- `node generate-keys.js`: generate and store hashed recovery keys for users that do not yet have one

## Authentication

Protected endpoints require:

- Header: `x-auth-token: <jwt>`

JWT payload is signed with `JWT_SECRET` and contains:

- `id`: user id
- `username`: username

JWT expiry: `2h`.

Missing or invalid token responses:

- `401 { "error": "Access denied. No token provided." }`
- `401 { "error": "Invalid or expired token." }`

## Validation and Rate Limits

- Common validation errors return:
	- `400`
	- Body:
		```json
		{
			"error": "Validation failed.",
			"details": [
				{ "field": "fieldName", "message": "reason" }
			]
		}
		```
- `POST /api/login` is rate-limited to `5` attempts per `15` minutes per IP.
- `POST /api/reset-with-key` is rate-limited to `3` attempts per `1` hour per IP.

## Endpoint Summary

| Method | Path | Auth Required | Purpose |
|---|---|---|---|
| `POST` | `/api/login` | No | Authenticate user and issue JWT |
| `POST` | `/api/change-password` | Yes | Change password using current password |
| `POST` | `/api/reset-with-key` | No | Reset password using recovery key |
| `POST` | `/api/upload` | Yes | Upload file to Google Drive and store metadata |
| `GET` | `/api/files` | Yes | List stored file metadata |
| `GET` | `/api/files/:id/view` | Yes | View inline when supported, otherwise download |
| `DELETE` | `/api/files/:id` | Yes | Delete file from Google Drive and DB |

Note: `POST /api/register` exists in controller code but is currently disabled in routes (`src/routes/auth.js`).

## Endpoint Details

### `POST /api/login`

Authenticate user and return JWT.

Request body:

```json
{
	"username": "string",
	"password": "string"
}
```

Validation expectations:

- `username` required, non-empty string
- `password` required, non-empty string

Success response:

- Status: `200`
- Body:
	```json
	{
		"token": "jwt_token",
		"user": {
			"id": "mongodb_object_id",
			"username": "your_username"
		}
	}
	```

Possible errors:

- `400 { "error": "Validation failed.", "details": [...] }`
- `400 { "error": "Invalid credentials." }`
- `429 { "error": "Too many login attempts. Try again in 15 minutes." }`
- `500 { "error": "Server error during login." }`

### `POST /api/change-password`

Change password for authenticated user.

Headers:

- `x-auth-token: <jwt>`

Request body:

```json
{
	"currentPassword": "string (min 8 chars)",
	"newPassword": "string (min 8 chars)"
}
```

Validation expectations:

- `currentPassword` required, string, min length 8
- `newPassword` required, string, min length 8

Success response:

- Status: `200`
- Body:
	```json
	{
		"success": true,
		"message": "Password updated successfully."
	}
	```

Possible errors:

- `400 { "error": "Validation failed.", "details": [...] }`
- `400 { "error": "Please provide both current and new passwords." }`
- `400 { "error": "Incorrect current password." }`
- `401 { "error": "Access denied. No token provided." }`
- `401 { "error": "Invalid or expired token." }`
- `404 { "error": "User not found." }`
- `500 { "error": "Failed to change password." }`

### `POST /api/reset-with-key`

Reset password using username + recovery key.

Request body:

```json
{
	"username": "alphanumeric string",
	"recoveryKey": "XXXX-XXXX-XXXX-XXXX",
	"newPassword": "string (min 8 chars)"
}
```

Validation expectations:

- `username` required, string, alphanumeric only (`^[a-zA-Z0-9]+$`)
- `recoveryKey` required, string, format `XXXX-XXXX-XXXX-XXXX` (`A-Z0-9` groups)
- `newPassword` required, string, min length 8

Success response:

- Status: `200`
- Body:
	```json
	{
		"success": true,
		"message": "Password updated successfully."
	}
	```

Possible errors:

- `400 { "error": "Validation failed.", "details": [...] }`
- `400 { "error": "username, recoveryKey, and newPassword are required." }`
- `400 { "error": "Invalid request or credentials." }`
- `429 { "error": "Too many password reset attempts. Try again in 1 hour." }`
- `500 { "error": "Failed to reset password." }`

### `POST /api/upload`

Upload a file to Google Drive and store metadata in MongoDB.

Headers:

- `x-auth-token: <jwt>`
- `Content-Type: multipart/form-data`

Form data:

- `vaultFile` (file) - required

Recognized MIME types/extensions (used for MIME normalization and preview/download behavior):

- `image/jpeg`
- `image/png`
- `video/mp4`
- `video/quicktime` (`.mov`)
- `video/x-msvideo`, `video/avi`, `video/msvideo` (`.avi`)
- `video/x-matroska`, `video/matroska`, `video/mkv` (`.mkv`)
- `video/webm` (`.webm`)
- `video/x-m4v` (`.m4v`)
- `video/3gpp` (`.3gp`)
- `video/3gpp2` (`.3g2`)
- `audio/mpeg`, `audio/mp3`, `audio/x-mpeg` (`.mp3`)
- `audio/flac`, `audio/x-flac` (`.flac`)
- `audio/wav`, `audio/x-wav`, `audio/vnd.wave` (`.wav`)
- `audio/mp4`, `audio/x-m4a` (`.m4a`)
- `audio/ogg` (`.ogg`)
- `audio/opus` (`.opus`)
- `audio/aac`, `audio/x-aac` (`.aac`)
- `audio/amr` (`.amr`)
- `audio/x-ms-wma` (`.wma`)
- `audio/aiff` (`.aiff`, `.aif`)
- `application/pdf`
- `application/msword` (`.doc`)
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (`.docx`)
- `application/vnd.ms-excel` (`.xls`)
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (`.xlsx`)
- `application/vnd.ms-powerpoint` (`.ppt`)
- `application/vnd.openxmlformats-officedocument.presentationml.presentation` (`.pptx`)
- `application/vnd.oasis.opendocument.text` (`.odt`)
- `application/vnd.oasis.opendocument.spreadsheet` (`.ods`)
- `application/vnd.oasis.opendocument.presentation` (`.odp`)
- `text/csv` and `application/csv` (`.csv`)
- `application/json` (`.json`)
- `text/plain` (`.txt`)
- `application/rtf` (`.rtf`)

Other/unknown file types are also accepted and stored. If the backend cannot confidently classify them, it stores a fallback MIME type (`application/octet-stream`).

Max file size: `50MB`.

Success response:

- Status: `200`
- Body:
	```json
	{
		"success": true,
		"message": "File securely uploaded and recorded in Vault.",
		"fileData": {
			"_id": "mongodb_object_id",
			"originalName": "filename.ext",
			"driveFileId": "google_drive_id",
			"thumbnailLink": "string_or_null",
			"webViewLink": "string_or_null",
			"mimeType": "image/png",
			"uploadDate": "2026-03-09T00:00:00.000Z",
			"__v": 0
		}
	}
	```

Possible errors:

- `400 { "error": "No file uploaded." }`
- `400 { "error": "File too large. Maximum allowed size is 50MB." }`
- `401 { "error": "Access denied. No token provided." }`
- `401 { "error": "Invalid or expired token." }`
- `500 { "error": "Failed to upload file to the vault." }`

### `GET /api/files`

Return all file metadata records sorted by newest upload first.

Sorting behavior:

- Primary sort: `uploadDate` descending
- Secondary sort (tie-breaker): `_id` descending

Headers:

- `x-auth-token: <jwt>`

Query params (all optional):

- `page` (integer, >= 1, default: `1`)
- `limit` (integer, 1 to 100, default: `20`)
- `fileType` (string, case-insensitive match against either `mimeType` or file extension in `originalName`; examples: `pdf`, `.docx`, `application/json`)
- `fileName` (string, case-insensitive partial match against `originalName`)

Request body: none.

Success response:

- Status: `200`
- Body:
	```json
	{
		"success": true,
		"files": [
			{
				"_id": "mongodb_object_id",
				"originalName": "filename.ext",
				"driveFileId": "google_drive_id",
				"thumbnailLink": "string_or_null",
				"webViewLink": "string_or_null",
				"mimeType": "application/pdf",
				"uploadDate": "2026-03-09T00:00:00.000Z",
				"__v": 0
			}
		],
		"pagination": {
			"page": 1,
			"limit": 20,
			"total": 42,
			"totalPages": 3,
			"hasNextPage": true,
			"hasPrevPage": false
		}
	}
	```

Example request:

- `GET /api/files?page=1&limit=10&fileType=image&fileName=invoice`

Pagination edge case:

- When no records match, `files` is empty and `pagination.totalPages` is `0`.

Possible errors:

- `400 { "error": "Validation failed.", "details": [...] }`
- `401 { "error": "Access denied. No token provided." }`
- `401 { "error": "Invalid or expired token." }`
- `500 { "error": "Could not retrieve the vault contents." }`

### `GET /api/files/:id/view`

Fetch file content from Google Drive and return it with browser-friendly disposition logic.

Headers:

- `x-auth-token: <jwt>`

Path params:

- `id`: MongoDB ObjectId of file record

Success response:

- Status: `200`
- Content type: set from stored/inferred MIME type (fallback `application/octet-stream`)
- Content disposition:
	- `inline` for preview-safe types:
		- images: `image/jpeg`, `image/png`
		- video: `video/mp4`, `video/quicktime`, `video/x-msvideo`, `video/avi`, `video/msvideo`, `video/x-matroska`, `video/matroska`, `video/mkv`, `video/webm`, `video/x-m4v`, `video/3gpp`, `video/3gpp2`
		- audio: `audio/mpeg`, `audio/mp3`, `audio/x-mpeg`, `audio/flac`, `audio/x-flac`, `audio/wav`, `audio/x-wav`, `audio/vnd.wave`, `audio/mp4`, `audio/x-m4a`, `audio/ogg`, `audio/opus`, `audio/aac`, `audio/x-aac`, `audio/amr`, `audio/x-ms-wma`, `audio/aiff`
		- document/text: `application/pdf`, `text/plain`, `text/csv`, `application/json`
	- `attachment` for all other types (including unknown types), which triggers download in most clients
- Body: binary stream (not JSON)

Possible errors:

- `400 { "error": "Invalid file ID." }`
- `401 { "error": "Access denied. No token provided." }`
- `401 { "error": "Invalid or expired token." }`
- `404 { "error": "File not found." }`
- `500 { "error": "Failed to stream the file." }`

### `DELETE /api/files/:id`

Delete file from Google Drive and remove metadata from MongoDB.

Headers:

- `x-auth-token: <jwt>`

Path params:

- `id`: MongoDB ObjectId of file record

Success response:

- Status: `200`
- Body:
	```json
	{
		"success": true,
		"message": "File permanently deleted from Vault."
	}
	```

Possible errors:

- `400 { "error": "Invalid file ID." }`
- `401 { "error": "Access denied. No token provided." }`
- `401 { "error": "Invalid or expired token." }`
- `404 { "error": "File not found." }`
- `500 { "error": "Failed to delete the file." }`

## Notes and Current Behavior

- User registration endpoint is currently commented out in routes, so new users cannot be created through API until it is re-enabled.
- File records are currently global in `GET /api/files` (not user-scoped).
- Temporary upload files are stored in OS temp directory and cleaned up after upload attempt.
- Unknown file types are accepted on upload and are served as downloadable attachments on `GET /api/files/:id/view`.
- Request logs include method, path, status code, and duration.
