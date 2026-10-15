# TrackLend (web)

Single-owner loan tracker. Express + Turso (libSQL). No login screen; set APP_PASSWORD to put the whole site behind a browser password prompt.

## Setup
1. Turso: create a database, then `turso db show <name> --url` and `turso db tokens create <name>`.
2. Copy your old `assets/` (logo.png, etc.), plus `manifest.json` and `icons/` into `public/`, and your `lib/` folder into the project root.
3. Import your data (desktop DB is at %APPDATA%\TrackLend\loans.db):
   `cp .env.example .env` (fill in the Turso values), then `npm install && npm run import-db -- "C:\path\to\loans.db"`
4. Push to GitHub (`.env` is git-ignored), create a Render Web Service from the repo (render.yaml is included) and set the env vars: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, APP_PASSWORD, SMTP_USER, SMTP_PASS.
