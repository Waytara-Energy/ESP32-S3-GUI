# ESP32-S3 GUI: the WayTara unit setup page

The page that customers, installers and WayTara staff open on a phone or laptop to find a monitoring unit (the WayTara gateway board) and work with it over Bluetooth, according to who they are: look at its status and live readings, change its Wi-Fi, and, for staff, read its logs and register map, set it up, change its push interval and its key.

This repository is the web page only. The other parts live in their own repositories:

| Part | Where |
|---|---|
| Board firmware (`waytara-gateway-fw`) | `Waytara-Energy/ESP32-S3`, folder `waytara-gateway-fw` |
| Backend (the hub, `https://hub.waytaraenergy.com`) | `Waytara-Energy/waytara-backend` |
| Dashboard, admin app, database migrations | the main WayTara repository |

Vite + React + TypeScript, no UI library. It talks to two things: Supabase (sign-in, the devices the person may see, the activity log) and the WayTara backend (a Bluetooth grant, a claim ticket, decoding of live readings, the push interval and key change). The unit itself is reached over Web Bluetooth with the encrypted protocol of the firmware
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

## The radar (what is shown until a unit is connected)

Until a unit has let the person in, the page shows only a radar and nothing else (no menu). It starts by itself, units appear on it as they are heard (nearer the middle the stronger the signal), and the person picks the unit **on the radar**, not in the browser's list. The menu and pages appear after the unit has accepted the person. A unit that gives the person no access (not set up and its setup window closed, set up for a device they cannot see, or a refused grant) keeps them on the radar with a plain message.

What a browser allows, and what it does not:

- A page can never skip the browser's own device window for a unit the browser has not been allowed to use before. That is the browser's security rule, not ours. So the **first time** a unit is used on a browser, press **Add a unit** once and confirm it in the browser's window (it lists only that unit when the unit's name is known). After that the unit is remembered by the browser, appears on the radar by itself (`getDevices` + `watchAdvertisements`) and connects with **no browser window**.
- A browser with the experimental scan (Chrome flag `chrome://flags/#enable-experimental-web-platform-features`, then restart Chrome) also lists every WayTara unit in range on the radar, new ones included; picking a new one still needs the browser's single confirmation.
- A browser with neither shows an empty radar and the **Add a unit** button. Safari and iPhones cannot use Web Bluetooth at all.

A device can also be opened without Bluetooth from the radar's footer (the pages that only use the server: Device name, Push interval, Key, Activity log). **Device name** changes the device's name in the database (`rename_device`: the owner, assigned staff and admins; logged).

## How a person gets into a unit

1. The person picks a unit **on the radar**; the page connects and agrees an encrypted link with the unit.
2. The page asks the database which device the unit belongs to (`my_unit_by_hardware`; a unit that is unknown and one at somebody else's site look the same).
3. It asks the WayTara server for a **grant** for this person and this very connection (`POST /v1/equipment/:id/ble-grant`, two minutes, bound to the unit's key for this connection) and presents it to the unit (`auth`). The unit checks it by itself with its own key and says which **level** it gives: 1 view, 2 view and Wi-Fi (customer), 3 service (assigned employee or installer), 4 administrator. A unit whose setup window is open (BOOT held 3 seconds) gives level 4 to anyone next to it; that is how a new unit is set up.
4. The menu opens the pages that level allows; the others show a lock and say why. The unit enforces the level itself, the page only follows it.

| Page | Needs | What it does |
|---|---|---|
| Units | – | The connected unit, back to the radar, remembered units (names and ids only, in this browser), open a device without Bluetooth |
| Device name | signed in, can see the site | Rename the device |
| Overview | view | Unit and connection summary; restart (service) |
| Status | view | The unit's own status, refreshed every 5 s |
| Network | view; Wi-Fi to change | Saved networks, scan, join, forget (logged, never with the password) |
| Live readings | view | Raw registers from the unit, decoded by the WayTara server (a customer sees only what the customer view shows) |
| Register map | service | What the unit reads and may change |
| Setup | administrator or setup window | Choose the device, check the connection, link the unit |
| Push interval | staff | How often the averaged figures are written (hub API, logged) |
| Key | staff | Change the unit's key without cutting it off (hub API) |
| Live logs | service | The unit's own log as it happens |
| Activity log | signed in | Who did what to the device (database, same access rules as the dashboard) |

The look follows the dashboard (Poppins, the same colours, light and dark, the logo in `public/`), a sidebar on a laptop and a drawer on a phone, and a footer with the unit's firmware version and the copyright line.

`/?demo&role=customer|employee|admin` on the dev server shows every page against a fake unit at that role's level.

Known limits: the unit lets go of a quiet phone after 5 minutes (the page pings every minute while it is open); a unit that is already set up for another device is replaced after a warning; iPhones are not supported (Apple does not offer Web Bluetooth).
