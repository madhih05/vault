# Vault

Shared file vault application with an Express/MongoDB backend and a React/Vite frontend. Files are stored in Google Drive and metadata is stored in MongoDB.

## Shared Vault Behavior

- File endpoints are authenticated.
- File records are shared across authenticated users.
- The API does not enforce per-user file ownership filtering for list/view/delete operations.

## Repository Structure

```text
backend/   # API server, auth, Google Drive integration, MongoDB models
frontend/  # React client for login, gallery, uploads, preview, and deletion
```

## Prerequisites

- Node.js 18+
- npm
- MongoDB connection string
- Google Drive API credentials and refresh token

## Quick Start

### 1. Configure backend environment

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
```

### 2. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 3. Run backend

```bash
cd backend
npm start
```

### 4. Run frontend

```bash
cd frontend
npm run dev
```

By default, frontend calls `http://localhost:3000` unless `VITE_API_BASE_URL` is set.

## Core API Endpoints

- `POST /api/login`
- `POST /api/change-password`
- `POST /api/reset-with-key`
- `POST /api/upload`
- `GET /api/files`
- `GET /api/files/:id/view`
- `GET /api/files/:id/thumbnail`
- `DELETE /api/files/:id`

## Notes

- Backend details: `backend/README.md`
- Frontend can be configured with `frontend/.env` using `VITE_API_BASE_URL`.
