**Frontend Specification (Vault App)**

## 1. Product Scope

The frontend is a React + Vite single-page app for secure vault access and file management.

Core capabilities:
1. Authenticate user with username/password.
2. Reset password using a recovery key.
3. Show protected vault dashboard after login.
4. Browse files in three tabs: Gallery, Docs, Audio.
5. Search and filter file lists.
6. Upload one or multiple files (with image compression and optional thumbnail generation).
7. Preview/open/download files through authenticated endpoints.
8. Delete files.
9. Change password from profile menu.
10. Support web and Android-native (Capacitor) runtime behavior.

Key entry points:
- `frontend/src/main.jsx:1`
- `frontend/src/App.jsx:6`
- `frontend/src/components/auth/LoginPage.jsx:1`
- `frontend/src/pages/VaultDashboard.jsx:1`

---

## 2. Frontend Architecture

### Runtime / stack
- React 19 + React Router (`frontend/package.json:1`)
- Axios for API client (`frontend/src/services/api.js:1`)
- Tailwind CSS (`frontend/src/index.css:1`, `frontend/tailwind.config.js:1`)
- Capacitor support for native platform behavior (`frontend/package.json:1`, `frontend/capacitor.config.json:1`)
- Browser image compression (`frontend/src/services/mediaCompressor.js:1`)

### Routing and access control
- Public route `/` shows login page.
- Protected route `/vault` requires token presence.
- Unknown routes redirect to `/`.
- Route guards use `isAuthenticated()` which checks session token existence.
- References:
  - `frontend/src/App.jsx:6`
  - `frontend/src/App.jsx:14`
  - `frontend/src/App.jsx:27`
  - `frontend/src/App.jsx:35`

### Token/session strategy
- Token key in session storage: `vault_jwt`.
- Token is attached to all API requests as `x-auth-token` via Axios interceptor.
- Token cleared on logout also clears secure object URL cache.
- References:
  - `frontend/src/services/api.js:4`
  - `frontend/src/services/api.js:62`
  - `frontend/src/services/api.js:66`
  - `frontend/src/services/api.js:70`
  - `frontend/src/services/api.js:79`

---

## 3. API Base and Authentication Contract

Backend mounts auth + file routes under `/api`:
- `backend/src/server.js:17`
- `backend/src/server.js:18`

Frontend base URL behavior:
- Uses `VITE_API_BASE_URL` if provided, else defaults to `https://secretvault.madhih.in`.
- Normalizes by adding `/api` if absent.
- References:
  - `frontend/src/services/api.js:7`
  - `frontend/src/services/api.js:19`
  - `frontend/src/services/api.js:23`

Backend auth middleware accepts token from header OR query param:
- `x-auth-token` header (primary for Axios API calls)
- `?token=` query param (used for media URLs)
- Reference: `backend/src/middleware/auth.js:5`

JWT lifetime: 2 hours (`backend/src/helpers/auth.js:14`).

---

## 4. Endpoint Specifications (Request, Response, Frontend Usage)

## 4.1 `POST /api/login`
Backend route: `backend/src/routes/auth.js:67`  
Frontend caller: `login()` in `frontend/src/services/api.js:89`  
UI usage: `LoginPage.handleSubmit` in `frontend/src/components/auth/LoginPage.jsx:34`

Request body:
```json
{
  "username": "string",
  "password": "string"
}
```

Primary success response:
```json
{
  "token": "jwt",
  "user": {
    "id": "mongodb_id",
    "username": "name"
  }
}
```
Backend success reference: `backend/src/controllers/authController.js:55`

Frontend response usage:
1. Reads `response.data.token`.
2. Stores token in `sessionStorage` key `vault_jwt`.
3. Navigates to `/vault`.
- `frontend/src/services/api.js:95`
- `frontend/src/services/api.js:100`
- `frontend/src/components/auth/LoginPage.jsx:44`

Error handling in UI:
- Shows `error`/`message` from backend, else generic login failure.
- `frontend/src/components/auth/LoginPage.jsx:47`

Rate limit:
- 5 attempts / 15 min per IP (`backend/src/routes/auth.js:15`).

---

## 4.2 `POST /api/change-password`
Backend route: `backend/src/routes/auth.js:88`  
Frontend caller: `changePassword()` in `frontend/src/services/api.js:104`  
UI usage: password modal in vault dashboard (`frontend/src/pages/VaultDashboard.jsx:1498`)

Request body:
```json
{
  "currentPassword": "string",
  "newPassword": "string"
}
```

Auth:
- Requires JWT via `x-auth-token`.

Success response:
```json
{
  "success": true,
  "message": "Password updated successfully."
}
```
Backend response path: authController.js (success returned in changePassword function).

Frontend response usage:
1. Does not consume payload fields for state logic.
2. On success, shows hardcoded success message and clears form.
- `frontend/src/pages/VaultDashboard.jsx:633`
- `frontend/src/pages/VaultDashboard.jsx:637`

Error handling:
- Prefers backend `error`/`message`.
- `frontend/src/pages/VaultDashboard.jsx:641`

---

## 4.3 `POST /api/reset-with-key`
Backend route: `backend/src/routes/auth.js:99`  
Frontend caller: `resetPasswordWithKey()` in `frontend/src/services/api.js:113`  
UI usage: reset modal on login screen (`frontend/src/components/auth/LoginPage.jsx:166`)

Request body:
```json
{
  "username": "alphanumeric",
  "recoveryKey": "XXXX-XXXX-XXXX-XXXX",
  "newPassword": "string"
}
```

Frontend normalization:
- `username.trim()`
- `recoveryKey.trim().toUpperCase()`
- `newPassword` as typed
- `frontend/src/components/auth/LoginPage.jsx:64`

Success response:
```json
{
  "success": true,
  "message": "Password updated successfully."
}
```

Frontend response usage:
1. Shows success message.
2. Clears reset form fields.
- `frontend/src/components/auth/LoginPage.jsx:69`
- `frontend/src/components/auth/LoginPage.jsx:70`

Rate limit:
- 3 attempts / hour per IP (`backend/src/routes/auth.js:23`).

---

## 4.4 `GET /api/files`
Backend route: `backend/src/routes/files.js:17`  
Frontend caller: `listFiles()` in `frontend/src/services/api.js:127`  
UI usage:
- `loadGalleryFiles` (`frontend/src/pages/VaultDashboard.jsx:311`)
- `loadDocFiles` (`frontend/src/pages/VaultDashboard.jsx:334`)
- `loadAudioFiles` (`frontend/src/pages/VaultDashboard.jsx:347`)

Query params used by frontend:
- `page`
- `limit`
- `fileType`
- `fileName`

Success response shape:
```json
{
  "success": true,
  "files": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 60,
    "total": 123,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```
Backend reference: `backend/src/controllers/fileController.js:357`

Frontend response usage:
1. Gallery: appends or replaces, deduplicates by `_id`, sets `hasNextPage`.
2. Docs/audio: replaces list and sorts by `uploadDate` descending.
3. `pagination.hasNextPage` drives infinite-scroll sentinel behavior.
- `frontend/src/pages/VaultDashboard.jsx:321`
- `frontend/src/pages/VaultDashboard.jsx:330`
- `frontend/src/pages/VaultDashboard.jsx:343`
- `frontend/src/pages/VaultDashboard.jsx:356`
- `frontend/src/pages/VaultDashboard.jsx:365`

---

## 4.5 `POST /api/upload` (multipart)
Backend route: `backend/src/routes/files.js:16`  
Frontend caller: `uploadVaultFile()` in `frontend/src/services/api.js:145`  
UI usage: upload queue processor (`frontend/src/pages/VaultDashboard.jsx:657`)

Multipart fields sent by frontend:
- `vaultFile` (required)
- `vaultThumbnail` (optional; generated client-side for image/video)
Backend expects both field names (`backend/src/middleware/upload.js:121`).

Size limit:
- 50 MB (`backend/src/middleware/upload.js:117`).

Frontend upload workflow:
1. For image files, run compression before upload (`compressMedia`).
2. Try upload with thumbnail first.
3. If backend returns “unexpected field” and thumbnail exists, retry with only `vaultFile`.
- `frontend/src/services/api.js:152`
- `frontend/src/services/api.js:171`
- `frontend/src/services/api.js:197`

Success response:
```json
{
  "success": true,
  "message": "File securely uploaded and recorded in Vault.",
  "fileData": { ... }
}
```
Backend reference: `backend/src/controllers/fileController.js:196`

Frontend response usage:
- Response body itself is not directly rendered.
- Queue item marked completed; then active tab is force-refreshed.
- `frontend/src/pages/VaultDashboard.jsx:726`
- `frontend/src/pages/VaultDashboard.jsx:758`

---

## 4.6 `GET /api/files/:id/view`
Backend route: `backend/src/routes/files.js:49`  
Frontend usage:
- Blob fetch for lightbox and doc download/open on web.
- Direct URL (with token query) for native open/download and audio stream source.

Call paths:
- `fetchSecureFileBlob()` (`frontend/src/services/api.js:221`)
- `buildSecureFileViewUrl()` (`frontend/src/services/api.js:34`)
- Web doc open/download: `frontend/src/pages/VaultDashboard.jsx:870`, `frontend/src/pages/VaultDashboard.jsx:902`
- Audio `<audio src=...>`: `frontend/src/pages/VaultDashboard.jsx:1243`
- Lightbox blob path: `frontend/src/pages/VaultDashboard.jsx:489`

Query params:
- `token` optional for URL-based auth.
- `download=1` for attachment behavior.
Backend logic: `backend/src/controllers/fileController.js:384`.

Frontend response usage:
- Web preview/download uses object URLs from returned blob.
- Lightbox chooses `<img>` vs `<video>` based on MIME type.
- `frontend/src/pages/VaultDashboard.jsx:937`
- `frontend/src/pages/VaultDashboard.jsx:946`

---

## 4.7 `GET /api/files/:id/thumbnail`
Backend route: `backend/src/routes/files.js:50`  
Frontend usage:
- Gallery grid thumbnail `<img src=...>` with `?token=...`.
- `frontend/src/pages/VaultDashboard.jsx:1115`

Backend returns 404 if no uploaded custom thumbnail:
- `backend/src/controllers/fileController.js:469`

Frontend fallback:
- On thumbnail load error, replace source with `/fallback-icon.svg`.
- `frontend/src/pages/VaultDashboard.jsx:1119`

---

## 4.8 `DELETE /api/files/:id`
Backend route: `backend/src/routes/files.js:51`  
Frontend caller: `deleteVaultFile()` in `frontend/src/services/api.js:216`  
UI usage: docs menu, audio list, lightbox delete button.
- `frontend/src/pages/VaultDashboard.jsx:845`
- `frontend/src/pages/VaultDashboard.jsx:1205`
- `frontend/src/pages/VaultDashboard.jsx:1232`
- `frontend/src/pages/VaultDashboard.jsx:1449`

Success response:
```json
{
  "success": true,
  "message": "File permanently deleted from Vault."
}
```
Backend reference: `backend/src/controllers/fileController.js:559`

Frontend response usage:
1. Evicts secure object URL cache for that file.
2. Removes file from all local tab arrays.
3. Closes lightbox if deleted file is currently open.
- `frontend/src/pages/VaultDashboard.jsx:851`
- `frontend/src/pages/VaultDashboard.jsx:852`
- `frontend/src/pages/VaultDashboard.jsx:857`

---

## 5. UI Specification

## 5.1 Login screen
File: `frontend/src/components/auth/LoginPage.jsx:1`

Elements:
1. Two-column card on large screens, single pane on small.
2. Username + password fields.
3. Primary submit button (“Enter Vault”).
4. Secondary button (“Reset Password”).
5. Error banner for login failure.
6. Reset modal with username, secret phrase, new password, status messages.

Behavior:
- Submit disabled while invalid/submitting (`canSubmit`).
- On success navigates to `/vault`.
- Reset modal can be opened/closed independently of login form.

---

## 5.2 Vault dashboard layout
File: `frontend/src/pages/VaultDashboard.jsx:1`

Global elements:
1. Sticky header with title, profile menu, search field.
2. Filter dropdown (gallery/docs only).
3. Error banner region.
4. Main content section per tab.
5. Floating upload action button.
6. Bottom tab navigation (Gallery / Docs / Audio).
7. Optional overlays: drag-drop target, upload progress sheet, lightbox, change-password modal.

Tabs:
- `gallery`: responsive square-grid thumbnails + infinite scroll.
- `docs`: list rows with contextual menu (View/Download/Delete).
- `audio`: list rows with embedded `<audio controls>` + delete action.

---

## 5.3 Upload progress UI
Key state:
- `uploadQueueItems`, `uploadQueueOpen`, `isUploading`.
- `frontend/src/pages/VaultDashboard.jsx:219`

Presentation:
1. Circular floating progress meter with overall %.
2. Bottom sheet listing each file, status, size, bar, and error text.
3. `Clear` disabled while active uploads.

Statuses:
- `queued`
- `uploading`
- `completed`
- `failed`

---

## 6. Detailed Workflow Specification

## 6.1 App bootstrap
1. Browser loads main.jsx, renders `App`.
2. Router evaluates token via `isAuthenticated()`.
3. User routed to `/` or `/vault`.
- `frontend/src/main.jsx:1`
- `frontend/src/App.jsx:22`

## 6.2 Search + filter + fetch cache
1. Search input updates `searchInput`.
2. Debounced 280ms into `searchQuery`.
3. `refreshActiveTab()` decides whether fetch needed based on cache metadata and TTL (60s).
4. Active filter differs by tab:
- gallery: `media`/`image`/`video`
- docs: `documents`/specific document filters
- audio: fixed `audio`
- `frontend/src/pages/VaultDashboard.jsx:294`
- `frontend/src/pages/VaultDashboard.jsx:363`
- `frontend/src/pages/VaultDashboard.jsx:386`

## 6.3 Gallery infinite scroll
1. Sentinel element observed via `IntersectionObserver`.
2. When visible and not already loading, requests next page.
3. Appends new files with dedupe by `_id`.
- `frontend/src/pages/VaultDashboard.jsx:433`
- `frontend/src/pages/VaultDashboard.jsx:324`

## 6.4 Pull-to-refresh (mobile touch)
1. Starts only at top of page and when not loading.
2. Drag distance mapped to capped visual offset.
3. Release above threshold triggers force refresh.
- `frontend/src/pages/VaultDashboard.jsx:566`
- `frontend/src/pages/VaultDashboard.jsx:598`

## 6.5 Upload processing
1. User selects or drops files.
2. Files become queued items.
3. Single upload processor loop runs until queue empty.
4. For each file:
- optional thumbnail generation
- optional image compression
- upload with progress callback
- status update
5. On any success: refresh active tab.
6. On failures: global error + per-item error.
- `frontend/src/pages/VaultDashboard.jsx:762`
- `frontend/src/pages/VaultDashboard.jsx:657`

## 6.6 File preview/open/download
- Gallery lightbox:
1. Open item by index.
2. Fetch blob/object URL (cached by fileId).
3. Render image/video.
4. Swipe left/right to navigate.
- `frontend/src/pages/VaultDashboard.jsx:489`
- `frontend/src/pages/VaultDashboard.jsx:931`

- Documents:
1. Web: fetch blob then `window.open` object URL (fallback anchor).
2. Native: open signed URL directly.
3. Download uses `download=1` only on native URL path.
- `frontend/src/pages/VaultDashboard.jsx:870`
- `frontend/src/pages/VaultDashboard.jsx:902`

- Audio:
- `<audio src={buildSecureFileViewUrl(...token...)}` for stream.
- `frontend/src/pages/VaultDashboard.jsx:1243`

## 6.7 Session and profile
- Logout clears token and secure cache, redirects to `/`.
- Change-password modal submits authenticated endpoint and displays result.
- `frontend/src/pages/VaultDashboard.jsx:539`
- `frontend/src/pages/VaultDashboard.jsx:620`

---

## 7. Data Model as Consumed by Frontend

Typical file object fields used by UI:
- `_id`
- `originalName`
- `mimeType`
- `uploadDate`
- `thumbnailDriveFileId` indirectly through thumbnail endpoint availability

Backend schema: `backend/src/models/File.js:1`.

Frontend assumptions:
1. `_id` exists for keying and endpoint paths.
2. `mimeType` may determine media type (video badge/lightbox rendering).
3. `uploadDate` parseable as date string for locale display.

---

## 8. Platform/Environment Specification

## 8.1 Environment variables
- `VITE_API_BASE_URL` optional.
- If missing, frontend defaults to production URL and appends `/api`.
- `frontend/src/services/api.js:8`

## 8.2 Native platform behavior
- Uses `Capacitor.isNativePlatform()` to choose direct URL opens instead of blob/object URL pathways for docs.
- `frontend/src/pages/VaultDashboard.jsx:872`
- `frontend/src/pages/VaultDashboard.jsx:904`

## 8.3 Styling/theme
- Tailwind utility-first UI.
- Global fonts via Google Fonts (`Manrope`, `Bitter`).
- Dark radial background and safe-area spacing helpers for mobile.
- `frontend/src/index.css:1`

---

## 9. Error Handling and Resilience

Patterns:
1. Most UI handlers prefer backend `error` then `message` then generic fallback.
2. Upload retries without thumbnail if backend rejects extra field.
3. Thumbnail `<img>` falls back to static icon on load failure.
4. Lightbox/document preview errors surfaced in-page.
5. Token absence causes route redirection and protected request failures.

Validation and auth errors from backend:
- Validation middleware standardizes 400 payload with `details`.
- `backend/src/middleware/validation.js:1`
- Auth middleware returns 401 for missing/invalid token.
- `backend/src/middleware/auth.js:8`

---

## 10. Component Inventory and Current Wiring

Actively used:
- LoginPage.jsx
- VaultDashboard.jsx

Present but currently not imported by active pages:
- GalleryView.jsx
- DocumentsView.jsx
- AudioView.jsx
- FilterDrawer.jsx
- LightboxModal.jsx
- UploadFab.jsx
- GalleryItem.jsx

These appear to be earlier modular variants; current dashboard renders its own inline UI blocks.

---

## 11. Observed Implementation Notes (Important)

1. Thumbnail token source inconsistency:
- Dashboard thumbnail URL uses `sessionStorage.getItem('token') || getToken()`.
- Stored key is `vault_jwt`, so `'token'` lookup is dead/legacy.
- Works due fallback to `getToken()`, but indicates leftover inconsistency.
- References:
  - `frontend/src/pages/VaultDashboard.jsx:260`
  - `frontend/src/services/api.js:4`

2. File ownership model:
- Backend currently treats vault as shared among authenticated users (no user-level filtering).
- `README.md:8`

3. Upload API backward compatibility:
- Frontend contains retry path for older backend that only accepted `vaultFile`.
- `frontend/src/services/api.js:206`
