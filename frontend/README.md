# Vault Mobile (React Native)

Fresh React Native frontend using Expo, replacing the previous web implementation.

## Setup

1. `cd frontend`
2. `npm install`
3. Set API base URL (must include host/port that your phone or emulator can reach):
    - `EXPO_PUBLIC_API_BASE_URL=http://<your-lan-ip>:3000`
4. `npm run start`

Notes:

- The app automatically appends `/api` if your base URL does not include it.
- Auth token is stored in AsyncStorage under `vault_jwt`.

## Mobile Features Implemented

- Login (`POST /api/login`)
- Reset password with recovery key (`POST /api/reset-with-key`)
- Change password (`POST /api/change-password`)
- Vault tabs: Gallery, Docs, Audio (`GET /api/files` with filters)
- File search by name (`fileName` query)
- Gallery pagination (`page`, `limit`)
- Super refresh / Drive sync (`POST /api/files/sync`)
- File upload (`POST /api/upload` multipart)
- Open/download file stream (`GET /api/files/:id/view`)
- Thumbnail display (`GET /api/files/:id/thumbnail`)
- Delete file (`DELETE /api/files/:id`)

## Backend Endpoint Analysis

Base URL: `<server>/api` (except `/healthcheck`)

### Public

- `GET /healthcheck`
    - Response: `{ status: "ok", message: "Server is awake!" }`
- `POST /api/login`
    - Body: `{ username, password }`
    - Success: `{ token, user: { id, username } }`
    - Rate limit: 5 attempts per 15 minutes (per IP)
- `POST /api/reset-with-key`
    - Body: `{ username, recoveryKey, newPassword }`
    - Validation: `recoveryKey` format `XXXX-XXXX-XXXX-XXXX`
    - Rate limit: 3 attempts per hour (per IP)

### Authenticated

Header: `x-auth-token: <jwt>`

- `POST /api/change-password`
    - Body: `{ currentPassword, newPassword }`
- `POST /api/upload`
    - Multipart fields:
        - `vaultFile` (required)
        - `vaultThumbnail` (optional)
    - Limit: 50MB (multer)
- `POST /api/upload/init`
    - Body: `{ fileName, mimeType, fileSize }`
    - Returns resumable `uploadUrl` and `uploadSessionId`
- `POST /api/upload/finalize`
    - Multipart fields:
        - `fileName`, `mimeType`, `size`
        - `fileId` or `uploadSessionId` (one required)
        - `vaultThumbnail` (optional)
- `POST /api/files/sync`
    - Triggers Drive index sync
- `GET /api/files`
    - Query:
        - `page` (default 1)
        - `limit` (default 20, max 100)
        - `fileType` (`media`, `documents`, `audio`, extension token, mime token)
        - `fileName` (partial, case-insensitive)
    - Success: `{ success, files, pagination }`
- `GET /api/files/:id/view`
    - Optional query: `download=1|true`
    - Streams file with inline/attachment disposition depending on type
- `GET /api/files/:id/thumbnail`
    - Streams uploaded custom thumbnail only
    - 404 when custom thumbnail does not exist
- `DELETE /api/files/:id`
    - Deletes Drive file + DB record (+ thumbnail best-effort)

## Data Model Notes (From Backend)

### File

- `_id`
- `originalName`
- `driveFileId`
- `thumbnailLink` (legacy Google thumbnail URL)
- `thumbnailDriveFileId` (custom uploaded thumbnail)
- `thumbnailMimeType`
- `thumbnailWebViewLink`
- `webViewLink`
- `mimeType`
- `sizeBytes`
- `uploadDate`

### User

- `username`
- `passwordHash`
- `recoveryKey` (stored hashed)

## Integration Constraints and Risks

- Registration route exists in controller but is disabled in routes.
- File records are not scoped by user, so authenticated users can access global vault entries.
- Thumbnail endpoint only serves custom uploaded thumbnails, not Drive-generated thumbnails.
- Direct/resumable upload flow is implemented in backend, but this mobile baseline currently uploads with multipart endpoint only.
- For physical devices, `localhost` will not reach your backend unless tunneled; use LAN IP.

## Suggested Next Steps for Mobile

1. Add native media/document preview screens instead of opening URLs externally.
2. Add direct upload flow (`/upload/init` + chunked upload + `/upload/finalize`) for files over 50MB.
3. Add thumbnail generation on device for image/video uploads.
4. Add persisted file cache and offline-aware list state.
