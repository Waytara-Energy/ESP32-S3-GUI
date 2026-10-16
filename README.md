# ESP32-S3 GUI: the WayTara unit setup page

The page an installer opens on a phone or laptop to set up a monitoring unit (the WayTara gateway board): sign in, choose the device the unit is
wired to, connect over Bluetooth, join Wi-Fi, run the connection checks and the speed test, and finish (the unit collects its key from the
WayTara server).

This repository is the web page only. The other parts live in their own repositories:

| Part | Where |
|---|---|
| Board firmware (`waytara-gateway-fw`) | `Waytara-Energy/ESP32-S3`, folder `waytara-gateway-fw` |
| Backend (the hub, `https://hub.waytaraenergy.com`) | `Waytara-Energy/waytara-backend` |
| Dashboard, admin app, database migrations | the main WayTara repository |

Vite + React + TypeScript, no UI library. It talks to two things: Supabase (sign-in, and the list of devices the person may see) and the WayTara
backend (a single-use claim ticket). The unit itself is reached over Web Bluetooth with the encrypted protocol of the firmware
(`waytara-gateway-fw/ble_setup.cpp`); the protocol code is in `src/ble` and is tested against a fake unit.

## Run it

```
npm install
cp .env.example .env.local     # then put the Supabase anon key in it (public value, but kept out of git)
npm run dev                    # http://localhost:5174 (localhost counts as a secure page, so Bluetooth works)
npm test                       # protocol, wording and backend-client tests
npm run build                  # type check + production build into dist/
```

`/?demo` on the dev server runs the whole page against a fake unit (no radio, no sign-in); that code is not in the production build.

## Browsers

Web Bluetooth works in Chrome and Edge on Android, Windows, macOS, Linux and ChromeOS. It does **not** work in Safari or in any browser on an
iPhone or iPad; the page says so. The address must be `https` (or `localhost`).

## Deploy (Vercel)

1. Vercel: **Add New > Project**, import `Waytara-Energy/ESP32-S3-GUI`. Root Directory stays the repository root. Framework **Vite** (also set in `vercel.json`).
2. Environment variables (Production and Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GATEWAY_URL`. All three are public values (they end up in the page); none is a secret.
3. Add the page's address (origin only, `https`, no trailing slash) to `ALLOWED_ORIGINS` on the Render service, or the claim ticket call is blocked by the browser.
4. Supabase > Authentication > URL configuration: nothing to add (the page signs in with email and password and does not redirect).

`vercel.json` sets the security headers: a strict Content-Security-Policy that allows only this site, the Supabase project and the hub, and Bluetooth
for this page only. If the hub or the Supabase project ever moves, change `connect-src` there.

## What each step does

| Step | Unit command | Notes |
|---|---|---|
| Device | – | Lists inverters the person can see (the database's access rules decide). |
| Unit | read the info characteristic, key exchange | The unit advertises only while its setup window is open (new unit, or BOOT held 3 s). |
| Wi-Fi | `info`, `scan`, `wifi`, `forget` | 2.4 GHz only. The password goes to the unit over the encrypted link and is never kept by the page. |
| Checks | `checks`, `speed` | Wi-Fi, name lookup, clock, secure connection, server, live link. |
| Finish | `claim` (+ `POST /v1/equipment/{id}/claim-tickets`) | The unit then restarts. |

Known limits: the unit restarts after setup, so the Bluetooth link ends on purpose; a unit that is already set up for another device is replaced
after a warning; iPhones are not supported (Apple does not offer Web Bluetooth).
