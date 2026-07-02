# MedLib Security Notes

## Backup First

Before editing users, mapping, or server config, back up `assets/data`, `assets/pdf-map.json`, `server-data`, and `scripts`. Keep `BooksDB` on a separate external backup. Do not delete or move large PDF files during metadata repair.

## Admin Password

Default admin credentials are not allowed for production. Set a strong password in `.env`:

```text
NODE_ENV=production
MEDLIB_ADMIN_PASSWORD=change-this-long-random-password
```

On next successful login, legacy password hashes are migrated to bcrypt when `bcryptjs` is installed.

## Frontend Secrets

Passwords, password hashes, tokens, and `.env` values must not be stored in frontend JavaScript. Static GitHub Pages mode is catalog-only and cannot securely create private users by itself.

## HTTPS

Use HTTPS for public or LAN deployments where credentials are entered. For internet exposure, put MedLib behind a reverse proxy such as IIS, Nginx, Caddy, or another TLS-terminating proxy.

## Private Files

The Node server blocks direct static access to:

- `.env`
- `server-data`
- `BooksDB`
- `.git`, `.github`, `.deploy`, `.vscode`
- `assets/data/library.source.json`
- `assets/pdf-map.json`
- `*.db`, `*.sqlite`, `*.sqlite3`

PDF files should only be served by `/api/books/:id/pdf` after login and subscription checks.

## Public Internet Checklist

- Set `NODE_ENV=production`
- Set `MEDLIB_ADMIN_PASSWORD`
- Use HTTPS
- Keep `.env` out of Git and public folders
- Keep `BooksDB` outside static hosting
- Run `npm run audit:pdf` after catalog changes
- Back up `server-data/users.json`

## First Admin Password Reset

1. Stop the server.
2. Edit `.env` and set `MEDLIB_ADMIN_PASSWORD` to a new strong password.
3. Start the server with `npm start`.
4. Login as the configured admin email.
5. Keep the `.env` file private.

If `server-data/users.json` contains an old legacy admin hash, the server preserves the file and migrates hashes when the matching password is used.
