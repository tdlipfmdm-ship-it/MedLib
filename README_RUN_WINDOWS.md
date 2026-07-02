# MedLib Windows Runbook

## System Requirements

- Windows 10/11 or Windows Server
- Node.js LTS 18+
- PowerShell 5+
- Existing `BooksDB` folder kept in place

## Backup Command

Before changing configuration or running repair with `--write`, create a metadata backup:

```powershell
cd /d F:\BOOKS_DB\MedLIB\html_site_export_20260416_153938
powershell -NoProfile -Command "Compress-Archive -Path .\assets\data,.\assets\pdf-map.json,.\server-data,.\scripts -DestinationPath .\medlib-config-backup.zip -Force"
```

This does not copy `BooksDB` PDFs. Keep a separate external backup for large PDF files.

## Node.js LTS Install

Install Node.js LTS from the official installer, then verify:

```powershell
node -v
npm -v
```

## Project Folder

```cmd
cd /d F:\BOOKS_DB\MedLIB\html_site_export_20260416_153938
```

## npm install

```cmd
npm install
```

## npm run check

```cmd
npm run check
```

## npm start

Copy `.env.example` to `.env`, set a strong `MEDLIB_ADMIN_PASSWORD`, then start:

```cmd
npm start
```

Open:

```text
http://localhost:3000
http://localhost:3000/api/health
```

## Recommended Windows Script

Local server mode:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Start-MedLib-Server.ps1 -Port 3000 -AdminPassword "change-this-admin-password"
```

Cloudflare Tunnel mode:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Start-MedLib-CloudflareTunnel.ps1 -Port 3000 -AdminPassword "change-this-admin-password"
```

Check fixed-port setup without opening the tunnel:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Start-MedLib-CloudflareTunnel.ps1 -Port 3000 -CheckOnly
```

Print current tunnel status. Quick Tunnel prints the current URL; token/named tunnel reports that the public hostname is managed in Cloudflare:

```powershell
npm run tunnel:status
```

This wrapper keeps both sides on the same fixed local target: `http://127.0.0.1:3000`. It starts MedLib if it is not already running, then runs `cloudflared tunnel --protocol http2 --url http://127.0.0.1:3000`. The Node server is not directly exposed to the network.

If the cloudflared log shows `Failed to dial a quic connection` or `no recent network activity`, keep HTTP/2. That means QUIC/UDP is blocked or unstable on the current network.

Keep current `trycloudflare.com` URL when restarting MedLib:

```powershell
npm run restart:keep-url
```

Use this only while the existing `cloudflared` tunnel window/process is still running. Do not stop `cloudflared`; restart only MedLib Node server.

If `cloudflared` is already running, `npm run start:cloudflare` will not open a second quick tunnel. This prevents accidentally changing the current `trycloudflare.com` URL. Use `-ForceNewTunnel` only when a new public URL is acceptable.

If the current tunnel is already stuck with `control stream encountered a failure` or QUIC timeout errors, replace it with HTTP/2 mode:

```powershell
npm run start:cloudflare -- -RestartTunnel
```

This can change a quick `trycloudflare.com` URL.

## LAN Mode

Set `.env`:

```text
HOST=0.0.0.0
PORT=3000
BOOKS_DIR=BooksDB
NODE_ENV=production
MEDLIB_ADMIN_PASSWORD=change-this-admin-password
```

## Windows Firewall Command

Run as Administrator:

```cmd
netsh advfirewall firewall add rule name="MedLIB 3000" dir=in action=allow protocol=TCP localport=3000
```

## Telefon Bilen Açmak

Find the PC IP address:

```cmd
ipconfig
```

Then open from phone on the same Wi-Fi:

```text
http://PC_IP:3000
```

## Port 3000 Busy Bolsa

```cmd
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

Or use the Windows script after confirming the PID is the old MedLIB server:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Start-MedLib-Server.ps1 -Port 3000 -KillExisting -AdminPassword "change-this-admin-password"
```

For LAN Android testing:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Start-MedLib-Server.ps1 -HostAddress 0.0.0.0 -Port 3000 -Production -AdminPassword "change-this-admin-password"
```

## PDF.js Offline Setup

`assets/reader.js` first tries local PDF.js files:

```text
assets/pdfjs/pdf.min.mjs
assets/pdfjs/pdf.worker.min.mjs
```

For offline or intranet use, place matching PDF.js v4 files in `assets/pdfjs`. CDN fallback may work on the public internet, but it should not be relied on for offline deployments.

## PDF Mapping Audit/Repair Commands

Audit only:

```cmd
npm run audit:pdf
```

Dry-run repair, no writes:

```cmd
npm run repair:pdf
```

Write only exact, unique matches:

```cmd
npm run repair:pdf -- --write
```

Reports are written to:

```text
reports/pdf-audit-report.json
reports/pdf-audit-report.md
reports/pdfpath-repair-report.json
reports/pdf-manual-review.json
```

## GitHub Pages Limitations

GitHub Pages has no `/api`, no private `BooksDB` streaming, and no server-side login. Use `.deploy/MedLib` in static mode for catalog browsing only. Full login, subscription, and PDF reader access require the Windows Node server.
