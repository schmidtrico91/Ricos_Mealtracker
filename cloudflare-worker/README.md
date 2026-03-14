# Cloudflare Worker AI Proxy

Dieser Worker stellt fuer die App folgende Endpunkte bereit:

- `POST /api/integrations/core/upload-file`
- `POST /api/integrations/core/invoke-llm`
- `GET /api/search/open-food-facts`
- `GET /api/health`

Verwendetes Modell:

- `gemini-2.5-flash`
- Suche: `Open Food Facts` mit lokalem `BLS`-Naehrwert-Fallback fuer Treffer ohne verwertbare Makros

## Voraussetzungen

- Cloudflare Account
- Gemini API Key
- `wrangler` CLI

## Einmalige Anmeldung

```bash
npx wrangler login
```

## Deploy

Aus dem Projekt-Root:

```bash
npx wrangler secret put GEMINI_API_KEY --config cloudflare-worker/wrangler.toml
npm run worker:deploy
```

Oder direkt im Ordner:

```bash
cd cloudflare-worker
npx wrangler deploy
```

## Lokales Testen

```bash
npm run worker:dev
```

## App-Anbindung

In `.env.local` der App:

```bash
VITE_NATIVE_INTEGRATIONS_API_URL=https://your-worker.workers.dev
VITE_LOCAL_API_URL_ANDROID=https://your-worker.workers.dev
```

Danach:

```bash
npm run build
npx cap sync android
```
