# Vault

A full stack shared storage vault built with Express, MongoDB, Google Drive, and React.

This repository contains:
- `backend/`: REST API for authentication, file upload, listing, streaming, thumbnail proxying, and deletion.
- `frontend/`: React dashboard for login, upload, filtering, preview, streaming, and file management.

The vault is configured as **shared storage**. File records are global and are not ownership-scoped per user.

## Architecture

- Backend: Node.js, Express 5, Mongoose, JWT auth, Multer, Google Drive API.
- Frontend: React 19, Vite, Axios, Tailwind CSS.
- Storage:
  - Binary file content: Google Drive folder (`DRIVE_FOLDER_ID`).
  - Metadata: MongoDB (`files` collection).

Flow:
1. User logs in via `POST /api/login`.
2. Frontend stores JWT in `sessionStorage`.
3. Axios sends JWT in `x-auth-token` for protected endpoints.
4. Upload sends multipart file to backend; backend writes to Drive and persists metadata in MongoDB.
5. UI lists metadata from MongoDB and loads previews/streams via backend secured routes.

## Repository Layout

```text
backend/
  src/
    config/         # MongoDB and Google Drive config
    controllers/    # Auth and file route handlers
    helpers/        # Auth + stream helpers
    middleware/     # Auth, upload, validation, logging
    models/         # User and File schemas
    routes/         # Auth and file routes
    server.js       # API bootstrap
  tests/            # Jest + functional scripts

frontend/
  src/
    components/     # Login and vault UI components
    pages/          # Vault dashboard page
    services/       # API client and auth token handling
  index.html
  vite.config.js
```

## Prerequisites

- Node.js 18+
- npm 9+
- MongoDB instance
- Google Cloud project with Drive API enabled and OAuth credentials

## Environment Variables

### Backend (`backend/.env`)

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

### Frontend (`frontend/.env`)

```env
# You can set either host-only or host+api format.
# Both are supported by the frontend URL normalizer.
VITE_API_BASE_URL=http://localhost:3000
# or
# VITE_API_BASE_URL=http://localhost:3000/api
```

## Local Development

### 1. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Start backend

```bash
cd backend
npm start
```

Server starts on `http://localhost:3000` by default and mounts API routes under `/api`.

### 3. Start frontend

```bash
cd frontend
npm run dev
```

Vite dev server runs on `http://localhost:5173` by default.

## API Overview

Base path: `/api`

Auth:
- `POST /login`
- `POST /change-password` (auth required)
- `POST /reset-with-key`

Files:
- `POST /upload` (auth required)
- `GET /files` (auth required)
- `GET /files/:id/view` (auth required)
- `GET /files/:id/thumbnail` (auth required)
- `DELETE /files/:id` (auth required)

Auth token:
- Header: `x-auth-token: <jwt>`
- Thumbnail route also supports query token (`?token=...`) for browser image tags.

## Frontend Features

- Login with route protection.
- Shared dashboard tabs: Gallery, Audio, Documents, Other.
- Drag-and-drop upload and floating upload action button.
- Filter drawer by name and type.
- Secure preview/stream through backend routes.
- Delete file from both Google Drive and MongoDB.

## Tests and Verification

Backend tests:

```bash
cd backend
npm test
```

Backend functional smoke script:

```bash
cd backend
npm run test:functional
```

Frontend production build:

```bash
cd frontend
npm run build
```

## Notes

- Registration route exists in controller code but is intentionally not mounted.
- File size upload limit is 50MB.
- Unknown file types are still accepted and stored.
- Recovery keys are generated with `backend/generate-keys.js` for users missing one.
