# MedLIB Cloudflare Tunnel Deployment

## A) Maksat

MedLIB-i Cloudflare Tunnel arkaly public HTTPS bilen açmak:

```text
https://medlib.example.com
```

Routerde port forwarding gerek däl. Windows kompýuter internete göni `0.0.0.0` bilen çykmaly däl; Node server production režimde `127.0.0.1:3000` diňleýär.

## B) Arhitektura

```text
Internet
↓
Cloudflare
↓
cloudflared tunnel
↓
http://127.0.0.1:3000
↓
MedLIB Node.js server
```

## C) Zerur Zatlar

- Cloudflare account
- Cloudflare-de dolandyrylýan domen
- Windows 11 Pro
- Node.js LTS
- MedLIB lokal işläp duran bolmaly
- `cloudflared`

## D) Node Serveri Lokal Işletmek

```cmd
cd /d F:\BOOKS_DB\MedLIB\html_site_export_20260416_153938
npm install
npm run check
npm start
```

Barla:

```text
http://localhost:3000/index.html
http://localhost:3000/api/health
```

`.env` production üçin:

```text
HOST=127.0.0.1
PORT=3000
NODE_ENV=production
PUBLIC_BASE_URL=https://medlib.example.com
BEHIND_PROXY=true
TRUST_PROXY=1
SESSION_SECRET=change-this-to-long-random-secret
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
BOOKS_DIR=BooksDB
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=300
MEDLIB_ADMIN_PASSWORD=change-this-admin-password
```

## E) cloudflared Gurmak

```cmd
winget install --id Cloudflare.cloudflared -e --source winget --accept-source-agreements --accept-package-agreements --silent --disable-interactivity
```

Barla:

```cmd
cloudflared --version
```

Eger `winget` install `1602` bilen gutarsa, MSI installer cancel edilipdir. Komandany bir setirde dine bir gezek yazyn; su nadogry gornusi ulanman:

```cmd
winget install --id Cloudflare.cloudflaredwinget install --id Cloudflare.cloudflared
```

PowerShell-i administrator hokmunde acyp gaytadan synap gorun ya-da repo icindaki portable fallback skripti ulanyn:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Install-Cloudflared.ps1 -Method Portable
.\tools\cloudflared\cloudflared.exe --version
```

Portable gornus PATH-a bagly dal. Sondan son `cloudflared` yerine doly path ulanyp bilersiniz:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Start-MedLib-CloudflareTunnel.ps1 -CloudflaredPath .\tools\cloudflared\cloudflared.exe -Port 3000
```

## F) Wagtlaýyn Test Tunnel

```cmd
npm run start:cloudflare
```

Bellik:

- Bu diňe test üçin.
- Random `trycloudflare.com` URL berýär.
- Production üçin named tunnel ulanmaly.
- Default protocol is HTTP/2: `cloudflared tunnel --protocol http2 ...`. This avoids QUIC/UDP timeout problems on networks where UDP is filtered or unstable.

## F2) Fixed-Port Wrapper

Recommended command:

```cmd
npm run start:cloudflare
```

Check without opening the tunnel:

```cmd
npm run start:cloudflare -- -CheckOnly
```

Print current tunnel status and quick URL:

```cmd
npm run tunnel:status
```

The wrapper keeps both processes on one fixed local target:

```text
http://127.0.0.1:3000
```

It starts MedLIB Node server if needed, then runs Cloudflare tunnel against the same URL with HTTP/2:

```text
cloudflared tunnel --protocol http2 --url http://127.0.0.1:3000
```

If port 3000 is occupied by a non-MedLIB process, it stops and asks for `-KillExisting`.

To test QUIC intentionally:

```cmd
npm run start:cloudflare -- -Protocol quic -ForceNewTunnel
```

## F3) Keep Current TryCloudflare URL

Quick Tunnel URL stays the same only while the same `cloudflared` process keeps running. To restart MedLIB without changing the current public URL, do not stop `cloudflared`; run:

```cmd
npm run restart:keep-url
```

Use `npm run tunnel:status` to see the currently active tunnel mode. Quick Tunnel prints the current `trycloudflare.com` URL; token/named tunnel public hostnames are managed in Cloudflare Zero Trust/DNS.

If `cloudflared`, Windows, internet, or the PC is restarted, this quick tunnel URL can be lost. In that case only a named tunnel with your own domain can make the public URL permanent.

Safety rule: when an existing `cloudflared` process is detected, `npm run start:cloudflare` refuses to start another quick tunnel. This protects the current URL from accidental replacement. Use `-ForceNewTunnel` only if a new public URL is acceptable.

If the existing cloudflared process is stuck in QUIC/control-stream errors, restart the tunnel in HTTP/2 mode:

```cmd
npm run start:cloudflare -- -RestartTunnel
```

This can change a quick `trycloudflare.com` URL. Use it only when the current quick tunnel is already broken or a new URL is acceptable.

## G) Permanent Named Tunnel

```cmd
cloudflared tunnel login
cloudflared tunnel create medlib
cloudflared tunnel route dns medlib medlib.example.com
```

## H) cloudflared config.yml Mysaly

Windows config ýerleşişi:

```text
C:\Users\<USER>\.cloudflared\config.yml
```

Mysal:

```yaml
tunnel: medlib
credentials-file: C:\Users\<USER>\.cloudflared\<TUNNEL-UUID>.json

ingress:
  - hostname: medlib.example.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

## I) Tunnel-i Işletmek

```cmd
cloudflared tunnel run medlib
```

## J) Windows Service Hökmünde Işletmek

```cmd
cloudflared service install
```

Barla:

```cmd
sc query cloudflared
```

Gerek bolsa:

```cmd
net stop cloudflared
net start cloudflared
```

## K) Cloudflare Zero Trust Access

Public site hemmelere açyk bolmasyn. Cloudflare Access goýmak maslahat berilýär:

- Diňe rugsat berlen email/domain girsin.
- Admin panel üçin aýratyn Access policy goýmak maslahat berilýär.
- Mysal: `medlib.example.com/account.html` we admin API endpointleri diňe admin email üçin.
- Mysal policy: `medlib.example.com/admin*` diňe admin email üçin.

## L) DNS

- `medlib.example.com` Cloudflare tarapyndan tunnel-e baglanmaly.
- Router port forwarding gerek däl.
- Local PC public IP görkezilmeli däl.

## M) Troubleshooting

- `winget` install `1602` bilen gutarsa: installer cancel edilipdir. PowerShell-i administrator hokmunde acyn, ya-da `.\scripts\Install-Cloudflared.ps1 -Method Portable` ulanyn.
- `cloudflared` command not found bolsa:
  ```powershell
  where.exe cloudflared
  .\tools\cloudflared\cloudflared.exe --version
  ```
  MSI install edilenden son taze PowerShell penjiresini acmak gerek bolup biler.

- `localhost:3000` açylmasa: `npm start` barla.
- `/api/health` açylmasa: backend işlemeýär.
- Logda `Failed to dial a quic connection` ýa-da `no recent network activity` görünse: QUIC/UDP bloklanan ýa-da durnuksyz. Wrapper default HTTP/2 ulanýar. Manual start gerek bolsa:
  ```cmd
  cloudflared tunnel --protocol http2 --url http://127.0.0.1:3000
  ```
- `cloudflared tunnel` açylmasa:
  ```cmd
  cloudflared tunnel list
  cloudflared tunnel info medlib
  ```
- Domen açylmasa: DNS route barla.
- PDF açylmasa: PDF.js lokal faýllary we PDF streaming endpoint barla.
- Login işlemese: `COOKIE_SECURE=true`, `BEHIND_PROXY=true`, `TRUST_PROXY=1` sazlamalaryny barla.
- `502` ýa-da `1033` Cloudflare error: lokal service we tunnel statusyny barla.

## Ulgam Testleri

Local:

```text
http://localhost:3000/index.html
http://localhost:3000/api/health
http://localhost:3000/reader.html
```

Cloudflare:

```text
https://medlib.example.com/index.html
https://medlib.example.com/api/health
https://medlib.example.com/reader.html
```

## Exact Command Checklist

```cmd
cd /d F:\BOOKS_DB\MedLIB\html_site_export_20260416_153938
npm install
npm run check
npm start
```

Täze terminalda:

```cmd
winget install --id Cloudflare.cloudflared -e --source winget --accept-source-agreements --accept-package-agreements --silent --disable-interactivity
cloudflared --version
cloudflared tunnel login
cloudflared tunnel create medlib
cloudflared tunnel route dns medlib medlib.example.com
cloudflared tunnel run medlib
```

Winget install cancel edilse:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Install-Cloudflared.ps1 -Method Portable
.\tools\cloudflared\cloudflared.exe --version
powershell -ExecutionPolicy Bypass -File .\scripts\Start-MedLib-CloudflareTunnel.ps1 -CloudflaredPath .\tools\cloudflared\cloudflared.exe -Port 3000
```

Production service:

```cmd
cloudflared service install
sc query cloudflared
```
