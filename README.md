# Twisted & Thrifted — Etsy to Square

A private inventory transfer workspace for importing Etsy listings into an editable working copy, reviewing the Square-ready result, and exporting Catalog items, variations, images, and inventory counts to Square.

Etsy data is read-only. Product edits are stored in the app's Neon Postgres database and are never written back to Etsy.

## What is included

- Encrypted server-side storage for existing Etsy and Square app credentials and OAuth tokens
- Etsy OAuth 2.0 authorization code flow with mandatory PKCE and the read-only `listings_r` and `shops_r` scopes
- Square confidential-client OAuth flow with Catalog and Inventory scopes
- Paginated Etsy listing import plus inventory, SKU, variation, and image hydration
- Immutable Etsy snapshots and separate editable working copies
- Search, status filters, selection, product editing, variant editing, and bulk tools
- Etsy-original versus Square-ready diff and validation preview
- Idempotent Square catalog export, image upload/attachment, and inventory physical counts
- Persistent Etsy listing, Square item, Square variation, SKU, sync-run, and error mappings
- Demo mode with bundled local product media for safe end-to-end testing

## Run locally

```bash
npm install
npm run dev
```

Create `.env.local` from `.env.example`, add a Neon `DATABASE_URL`, and then open `http://localhost:3000`. The app starts in Demo mode and creates its tables automatically.

Production checks:

```bash
npm run lint
npm run build
npm start
```

## Connect the developer apps you already have

1. Open **API settings**.
2. Switch the workspace to **Live**.
3. Set the public app URL. It must exactly match the base URL used for the registered callbacks.
4. Enter the existing Etsy keystring, Etsy shared secret, and Etsy shop ID. Save, then choose **Connect Etsy**.
5. Enter the existing Square application ID, application secret, environment, and location ID. Save, then choose **Connect Square**.
6. Use both connection-test buttons before importing or exporting.

Registered callback paths:

- Etsy: `/api/oauth/etsy/callback`
- Square: `/api/oauth/square/callback`

The Etsy connection requests only the read scopes `listings_r` and `shops_r`; there is no Etsy write path in this project. Square requests `MERCHANT_PROFILE_READ`, `ITEMS_READ`, `ITEMS_WRITE`, `INVENTORY_READ`, and `INVENTORY_WRITE`.

## Credential and deployment security

Credentials and tokens are AES-256-GCM encrypted before entering Postgres. In local development, a 32-byte key is generated in the ignored `.data/master.key` file. For production, set `APP_ENCRYPTION_KEY` to a stable base64-encoded 32-byte key; do not commit it.

This app is designed as a private shop-admin tool. Put it behind trusted access control before exposing the production domain to the public internet.

## Current API implementation

- Etsy Open API v3 listing and inventory endpoints
- Square API version `2026-09-16`
- Square `BatchUpsertCatalogObjects`, `CreateCatalogImage`, and `BatchChangeInventory`
- Full-object Square updates, stored Square versions, idempotency keys, and persisted ID mappings

Official references: [Etsy authentication](https://developers.etsy.com/documentation/essentials/authentication/), [Etsy API reference](https://developers.etsy.com/documentation/reference), [Square OAuth](https://developer.squareup.com/docs/oauth-api/overview), [Square Catalog](https://developer.squareup.com/docs/catalog-api/what-it-does), and [Square Inventory](https://developer.squareup.com/docs/inventory-api/how-it-works).
