# Cookie Switch

Cookie Switch is a Chrome extension that lets you store, manage, and instantly swap cookie jars for any website. It is built for teams who juggle multiple logins, need to share access safely, or want to stage/verify accounts without repeatedly signing in and out.

## Key Features

- **Multiple Sites & Accounts** – Organize cookie profiles per origin, each with named accounts and metadata.
- **One-Click Switching** – Inject the stored cookies and reload matching tabs to move between accounts immediately.
- **Auto Cookie Capture** – "Get Current Account" reads the live browser cookies (store, partition, same-site, priority, etc.) so sessions are preserved exactly.
- **Auto Update (optional)** – Mark an account as "Auto update" to keep it synchronized whenever the site mutates its cookies (e.g., refresh tokens).
- **Import/Export** – Share an individual account, an entire site, or a full workspace backup (including active auto-update mappings).
- **Backup & Restore** – Export all sites + accounts to JSON or restore from a teammate's file.
- **Site Management Tools** – Quickly add/remove origins and see which accounts exist for the current site.

## Installation

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the project directory (`cookie_switch`).
5. The "Cookie Switch" icon should now appear in the toolbar.

Whenever you update the files, revisit `chrome://extensions` and press **Reload** for Cookie Switch.

## Usage Overview

### 1. Create or Select a Website
- Open the popup, choose an existing site, or enter a URL and click **Save Site**.
- The site dropdown holds every origin you have configured.

### 2. Capture an Account
1. Navigate to the website and sign in with the account you want to store.
2. In the popup, fill the **Account name** field.
3. (Optional) Enable **Auto update** if you want this profile to track future cookie changes automatically.
4. Press **Get Current Account** – this imports the precise cookies from the active tab.
5. Click **Save Account**.

### 3. Switch Accounts
- For the chosen site, click **Switch** next to an account. Cookie Switch clears existing cookies for the domain, sets the stored set, reloads matching tabs, and records the active auto-update mapping if enabled.

### 4. Auto Update Behavior
- When an account is marked "Auto update" and has been switched or explicitly saved, Cookie Switch keeps an eye on the site's cookies.
- Whenever the browser updates a cookie for that domain (e.g., refresh token rotation), the extension snapshots the new values and rewrites the saved account automatically—no manual export required.

### 5. Import / Export
- **Account Export** – Each card has an **Export** button; importing uses the **Import Account** action above the editor.
- **Site Export** – Use the site-level buttons to export/import all accounts for a specific origin.
- **Full Backup** – The "All Sites Backup" card can back up or restore everything, including the `activeAccountMap` that ties origins to auto-update accounts.

### 6. Settings & Manual Updates
- Click the **⚙** button in the popup header to open the settings dialog.
- Use **Check for updates** to compare your local version with the latest commit on GitHub (master branch). If a newer version exists, download the ZIP and reload the unpacked extension via `chrome://extensions`.
- Chrome does not allow unpacked extensions to self-update, so manual reloads remain the safest and most transparent approach.

### 7. Deleting Data
- Removing a site drops all associated accounts and clears auto-update mappings for that origin.
- Deleting an account that was auto-update enabled also removes its active mapping.

## File Structure

- `manifest.json` – Extension metadata, permissions, icons, popup/background entry points.
- `popup.html/css/js` – The UI, styling, and client-side logic.
- `background.js` – Service worker that applies cookies, tracks active accounts, and auto-updates sessions when enabled.
- `icons/cookie-switch-*.png` – Icon set used for the toolbar and Chrome Web Store assets.
- `README.md` – This document.

## Permissions Explained

- `storage` – Persist site profiles, cookie sets, and active-account mappings.
- `cookies` – Read, set, and monitor cookies for the selected origins.
- `tabs` – Query active tabs to determine which cookie store to read and reload after switching.

## Troubleshooting

- **Switch fails / session invalid** – Re-run **Get Current Account** to capture a new cookie set, then save.
- **Auto update not triggering** – Ensure the account was switched at least once after enabling auto update so the extension knows it is the active profile.
- **Import errors** – Confirm the JSON file was exported by Cookie Switch and not altered manually.

Enjoy seamless account swapping!
