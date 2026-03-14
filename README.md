# FitTrack Pro Local + Native Setup

Dieses Projekt kann in zwei Modi laufen:

- Browser lokal: Vite + React gegen Node/Express + SQLite
- Android lokal: Vite + React in Capacitor mit on-device Datenhaltung

## 1) Installation

```bash
npm install
```

## 2) Environment

Lege `.env.local` an oder kopiere aus `.env.example`.

Minimal fuer Browser + lokales Backend:

```bash
VITE_USE_LOCAL_BACKEND=true
VITE_LOCAL_API_URL=http://127.0.0.1:8787
VITE_LOCAL_API_URL_ANDROID=http://10.0.2.2:8787
VITE_NATIVE_DATA_MODE=ondevice
LOCAL_API_PORT=8787

LOCAL_LLM_PROVIDER=ollama
LOCAL_LLM_MODEL=llama3.1:8b
LOCAL_LLM_OLLAMA_URL=http://127.0.0.1:11434
```

Wichtige Android-Variablen:

- `VITE_NATIVE_DATA_MODE=ondevice`
  Speichert `UserProfile`, `Food`, `FoodLog`, `SearchHistory` und `appLogs` direkt in der App.
- `VITE_NATIVE_DATA_MODE=host-backend`
  Erzwingt auf Android den alten Dev-Modus gegen den Node-Server des Host-Rechners.
- `VITE_NATIVE_INTEGRATIONS_API_URL`
  Optionaler Endpoint fuer AI Upload / AI Invoke in nativen Builds. Wenn nicht gesetzt, faellt Android fuer diese Calls auf `VITE_LOCAL_API_URL_ANDROID` zurueck.

## 3) Browser lokal starten

Terminal 1:

```bash
npm run dev:backend
```

Terminal 2:

```bash
npm run dev
```

## 4) Native Setup (Capacitor)

Einmalig:

```bash
npm run cap:add:android
npm run cap:add:ios
```

Web-Aenderungen ins Native-Projekt kopieren:

```bash
npm run dev:native:prepare
```

Alternative mit nativen Dependency-Updates:

```bash
npm run cap:sync:android
npm run cap:sync:ios
```

Native Projekte oeffnen:

```bash
npm run cap:open:android
npm run cap:open:ios
```

## 5) Android on-device Datenebene

Mit `VITE_NATIVE_DATA_MODE=ondevice` laeuft Android fuer die Kernfunktionen ohne Host-Backend:

- Profil anlegen und bearbeiten
- Lebensmittel lokal speichern
- Mahlzeiten loggen
- Suchverlauf speichern
- App-Navigation loggen

Das bedeutet:

- Browser-Entwicklung kann weiterhin den Node-Server benutzen.
- Android Emulator und spaetere APK-Builds koennen den Haupt-Tracking-Flow offline nutzen.
- Suche, Barcode-Lookup und Foto-AI duerfen weiter online abhaengig sein.
- Fuer Android-Emulatoren mit DNS-Problemen nutzt die Online-Suche optional den lokalen Backend-Proxy unter `VITE_LOCAL_API_URL_ANDROID` (`/api/search/open-food-facts`). Dafuer muss `npm run dev:backend` auf dem Host laufen.

## 6) Lokale AI konfigurieren

### Option A: Ollama

```bash
ollama pull llama3.1:8b
```

Dann:

```bash
LOCAL_LLM_PROVIDER=ollama
```

### Option B: OpenAI-kompatibler lokaler Server

```bash
LOCAL_LLM_PROVIDER=openai
LOCAL_LLM_OPENAI_URL=http://127.0.0.1:1234/v1
LOCAL_LLM_OPENAI_KEY=not-needed
LOCAL_LLM_MODEL=local-model
```

Hinweis:

- Diese lokalen AI-Variablen gelten fuer den Node-Server.
- Fuer installierbare Android-APKs sollte AI Upload / Invoke auf einen erreichbaren Hosted-Service zeigen, z. B. ueber `VITE_NATIVE_INTEGRATIONS_API_URL`.

## 6b) Cloudflare Worker + Gemini 2.5 Flash

Fuer Android ohne eigenen Host-Rechner kann die AI ueber einen Cloudflare Worker laufen.

Im Repo liegt dafuer ein Worker unter [cloudflare-worker/src/index.js](c:/Users/schmi/Documents/Mealtracker%20mit%20Codex/strict-fittrack-pro-app/cloudflare-worker/src/index.js) mit dem Modell `gemini-2.5-flash`.

Voraussetzungen:

- Cloudflare Account
- Gemini API Key
- `wrangler` CLI (`npm install -g wrangler` oder `npm exec wrangler`)

Deploy:

```bash
cd cloudflare-worker
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
```

Danach in `.env.local` der App:

```bash
VITE_NATIVE_INTEGRATIONS_API_URL=https://your-worker-name.your-subdomain.workers.dev
VITE_LOCAL_API_URL_ANDROID=https://your-worker-name.your-subdomain.workers.dev
```

Hinweise:

- Der Worker stellt `UploadFile`, `InvokeLLM` und `GET /api/search/open-food-facts` bereit.
- `UploadFile` speichert nichts dauerhaft, sondern gibt eine `data:`-URL fuer den direkten LLM-Aufruf zurueck.
- Der Gemini API Key liegt nur als Worker-Secret vor und nicht in der App.

## 7) Storage / Migration

Browser lokales Backend:

- SQLite-Datei: `backend/data/fittrack.db`
- Migration von `backend/data/db.json` nach SQLite beim ersten Start

Android on-device Modus:

- Daten liegen im App-Sandbox-Speicher der WebView
- Kein Node-Prozess auf dem Geraet notwendig

## 8) APK Ziel

Die App ist fuer einen spaeter installierbaren APK-Output vorbereitet:

- Web-Bundle landet in `dist`
- Capacitor kopiert das Bundle nach `android/app/src/main/assets/public`
- In Android Studio kann spaeter ein Debug- oder Release-APK gebaut werden

## App-Client

Das Frontend verwendet einen eigenen `appClient`.

Mapping:

- Browser local mode: Node/Express + SQLite
- Android local mode mit `VITE_NATIVE_DATA_MODE=ondevice`: on-device Datenlayer in der App

## 9) GitHub Auto-Release + In-App Update

Es gibt jetzt einen Workflow unter `.github/workflows/release-android.yml`.

Was er macht:

1. Trigger bei Git-Tag `v*` (z. B. `v1.0.3`)
2. Baut Web + Android Release APK
3. Veröffentlicht die APK als GitHub Release Asset
4. Aktualisiert `public/app-update-manifest.json` auf dem Default-Branch

Der Settings-Button `Nach Updates prüfen` liest dieses Manifest und bietet bei neuer Version den APK-Download an.

### Benötigte GitHub Secrets

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Wichtig:

- Die APK muss mit derselben Keystore-Signatur gebaut sein wie die bereits installierte App, sonst schlägt das Update fehl.
- Für automatische Updates sollte die App mit
  `VITE_UPDATE_MANIFEST_URL=https://raw.githubusercontent.com/<owner>/<repo>/<default-branch>/public/app-update-manifest.json`
  gebaut werden. Der Workflow setzt das beim Release-Build automatisch.
