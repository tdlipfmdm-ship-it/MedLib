# MedLib Android WebView

Android wersiya WebView shell bolup isleyar. Ol MedLIB-i telefon icinde programma yaly acar, emma backend/PDF/login Windows Node server ya-da Cloudflare Tunnel arkaly gelmeli.

## Esasy Maksat

Android APK full server mode ucin niyetlenen:

```text
Android APK
-> WebView
-> https://...trycloudflare.com/
-> Cloudflare Tunnel
-> http://127.0.0.1:3000
-> MedLIB Node server + BooksDB
```

GitHub Pages static URL indi esasy maksat dal, sebabi onda `/api`, login/register, subscription we protected PDF streaming islemeýär.

## Cloudflare Temporary Tunnel APK

Windows-da MedLIB server we tunnel islap duran bolmaly:

```powershell
cd F:\BOOKS_DB\MedLIB\html_site_export_20260416_153938
npm start
```

Basga terminal:

```powershell
npm run start:cloudflare
```

Trycloudflare URL cykandan son APK build. URL-i el bilen berip bilersiniz:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-android-apk.ps1 -StartUrl "https://CURRENT-TUNNEL.trycloudflare.com/"
```

Ya-da `.env` icinde `PUBLIC_BASE_URL` dogry bolsa, skript ony awtomat alar:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-android-apk.ps1
```

APK:

```text
downloads\MedLib-Android-WebApp.apk
```

Bellik: `trycloudflare.com` URL wagtlayyn. Tunnel taze URL berse, APK-ni taze `-StartUrl` bilen gaytadan build etmeli. Skript sahypadaky download linki ucin `downloads\MedLib-Android-WebApp.apk` faýlyny döredýär.

## LAN Debug APK

Telefon we Windows PC sol bir Wi-Fi-da bolsa:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Start-MedLib-Server.ps1 -HostAddress 0.0.0.0 -Port 3000 -Production -AdminPassword "change-this-admin-password"
```

PC IP-ni tap:

```powershell
ipconfig
```

APK build:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-android-apk.ps1 -StartUrl "http://PC_IP:3000/" -AllowCleartext
```

LAN mode ucin Windows Firewall-da port 3000 rugsat edilmeli bolup biler.

## Production Maslahat

Production Android ucin HTTPS URL ulan:

```text
https://medlib.example.com/
```

Build:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-android-apk.ps1 -StartUrl "https://medlib.example.com/"
```

HTTPS bar bolsa `-AllowCleartext` gerek dal.

## Android Project

Native project:

```text
android\MedLibWebApp
```

Start URL Gradle property bilen berilyar:

```text
MEDLIB_START_URL
```

Cleartext HTTP debug ucin:

```text
MEDLIB_CLEARTEXT=true
```

MainActivity WebView sazlamalary:

- JavaScript + DOM storage enabled
- cookies enabled
- third-party cookies disabled
- file/content access disabled
- mixed content blocked
- PDF reader canvas/touch UI WebView icinde isleyar
