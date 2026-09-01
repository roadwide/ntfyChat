# AGENTS.md — ntfyChat

A single-page chat UI on top of [ntfy](https://ntfy.sh). **ntfy is not in this repo** — it runs as the official `binwiederhier/ntfy` image deployed separately. This repo is only the static frontend. Do not add backend code, a server, or a message database.

## Repository shape

- `src/main.jsx` — the entire app by design (UI, auth, SSE, history, uploads). Keep it that way.
- `src/style.css` — themes and responsive layout.
- `public/sw.js` / `public/manifest.json` — PWA.
- React 19 + Vite 8. No state library, no other runtime deps, no tests, no CI, no build-time env vars, no analytics/external fonts/CDN.

## Hard constraints (do not break)

1. **SSE must stay `fetch` + `ReadableStream`** (`src/main.jsx`, `connect()`). Never switch to `EventSource` — it cannot send the `Authorization` header.
2. **Auth on every request**, including attachment fetches. Credentials go only in the `Authorization` header (Basic or Bearer), never in URLs.
3. **Service worker must never cache the API or attachments** — `public/sw.js` explicitly bypasses `/ntfy/` and `/file/`. Messages, attachments and auth responses must stay out of Cache Storage. Register only in production builds (`import.meta.env.PROD`).
4. **Messages render as React text nodes** — no `dangerouslySetInnerHTML`. Only `http(s)://` URLs are linkified, with `rel="noopener noreferrer"`.
5. **Credentials** live in `sessionStorage` by default; `localStorage` only when the user checks "remember". Non-secret settings go in `localStorage` — never write passwords/tokens into the settings object.
6. **Base path `/ntfy-ui/` is baked into three places** and must change together: `vite.config.js` (`base`), `index.html` (manifest/icon links), `public/manifest.json` (`scope`, `start_url`, icon paths).
7. **UI is Chinese-only** (zh-CN, strings in `src/main.jsx`; date formatting via `Intl` with `zh-CN`). There is no i18n layer — don't invent one without asking.
8. **Dedup by ntfy message `id`** — history (`json?poll=1`) and the live SSE stream can overlap; `addMessages` filters by id.
9. Message lifecycle: local pending bubble (random UUID, `local: true`) → replaced by server JSON on success → failed + retry on error. Keep the optimistic flow intact when touching the composer.

## ntfy API surface used

| Purpose | Request |
| --- | --- |
| History | `GET {base}/{topic}/json?poll=1` |
| Realtime | `GET {base}/{topic}/sse` |
| Send text | `POST {base}/{topic}` — body, `Title` = device name |
| Upload file | `PUT {base}/{topic}?filename=…` — `Type` = MIME |

`poll=1` is a one-shot read of the whole topic cache. Attachment URLs live under `/file/` when ntfy's base URL is the host root.

## Routing contract (Nginx, not in this repo)

`= /ntfy` → `index.html` · `^~ /ntfy-ui/` → static assets · `^~ /ntfy/` → proxy to ntfy with prefix stripped · `^~ /file/` → proxy. Exact match beats prefix — that is how the UI and API share the path. Full example in README.md.

## Development

- Node.js 20.19+ or 22.12+ (Vite 8 requirement).
- `npm install` · `npm run dev` (localhost:5173) · `npm run build` (`dist/`) · `npm run preview`.
- In dev, the default API base `/ntfy` hits the dev server itself: point Settings at a real ntfy instance (ntfy sends `Access-Control-Allow-Origin: *` by default) or add a Vite proxy.

## Docs

- `README.md` (English) and `README.zh-CN.md` (Chinese) — when behavior changes, update both; they must stay fact-for-fact in sync.
- `AGENTS.md` — this file. Keep constraints current when the code changes.
