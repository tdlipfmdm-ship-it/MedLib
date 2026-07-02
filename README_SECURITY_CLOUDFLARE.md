# MedLIB Cloudflare Security

## Public Açmakdaky Riskler

Cloudflare Tunnel router port açmazdan işleýär, ýöne app security şonda-da hökmany. HTTPS Cloudflare tarapynda bolsa-da, gowşak auth, default admin, public static PDF ýa-da `.env` syzmagy howp döredýär.

## Default Admin Gadagan

Production režimde default admin hash/parol ulanylmasyn. `.env` içinde güýçli parol sazlaň:

```text
NODE_ENV=production
MEDLIB_ADMIN_PASSWORD=change-this-long-random-password
```

## Frontend Admin Hash Gadagan

Frontend JS içinde admin password ýa-da hash saklanmaly däl. Login/register backend API arkaly işleýär. Static GitHub Pages režimi katalog üçin niýetlenen, private user store üçin däl.

## Password Hashing

`bcryptjs` ulanylýar. Existing legacy hashes login wagtynda bcrypt hash-e migrasiýa edilýär, eger dependency install edilen bolsa.

## Rate Limiting

Rate limiting public deployment üçin hökmany:

- Global API limit: `RATE_LIMIT_MAX`
- Login/register limit: `AUTH_RATE_LIMIT_MAX`
- Admin endpoint limit: `ADMIN_RATE_LIMIT_MAX`

## Cloudflare Access

Admin panel üçin Cloudflare Zero Trust Access maslahat berilýär:

- Diňe admin email/domain rugsat alsyn.
- Admin UI we admin API endpointler aýratyn policy bilen goralsyn.
- Public katalogy hem diňe rugsatly ulanyjylara açmak mümkin.

## BooksDB

`BooksDB` göni public static berilmeli däl. PDF diňe şu endpoint arkaly berilmeli:

```text
/api/books/:id/pdf
```

Endpoint login we subscription barlagyndan soň stream edýär.

## Private Files

Static route arkaly şu faýllar berilmeli däl:

- `.env`
- `*.db`
- `*.sqlite`
- `*.sqlite3`
- `*.map`
- `package-lock.json`
- source config/data faýllary
- `server-data`
- `BooksDB`

## Logs

Loglarda parol, token, cookie ýa-da `.env` mazmuny ýazylmaly däl.

## Backup Strategiýasy

Metadata backup:

```powershell
Compress-Archive -Path .\assets\data,.\assets\pdf-map.json,.\server-data,.\scripts -DestinationPath .\medlib-config-backup.zip -Force
```

`BooksDB` uly PDF fondy aýratyn diskde ýa-da offline backup-da saklansyn. Mapping repair PDF faýllary pozmaly ýa-da göçürmeli däl.

## .env

`.env` GitHub-a ýa-da public deploy içine düşmeli däl. `.env.example` diňe nusga bolup galmaly.
