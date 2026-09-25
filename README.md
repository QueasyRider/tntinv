# Etsy to Square Inventory Transfer

A private, single-business workspace for importing Etsy listings, editing local working copies, reviewing changes, and exporting Square Catalog items, variations, images, taxes, categories, and inventory.

> Each installation is designed for one business. Give every business its own deployment, database, encryption key, administrator login, and Etsy/Square connections.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FQueasyRider%2Ftntinv&env=DATABASE_URL%2CAPP_ENCRYPTION_KEY%2CPUBLIC_APP_URL%2CADMIN_USERNAME%2CADMIN_PASSWORD%2CSESSION_SECRET&envDescription=Private%20settings%20required%20for%20one%20business%20installation&project-name=etsy-square-inventory)

The deploy button works when the installer can access the GitHub repository. Make the distribution repository a GitHub template or grant the customer access before using it.

## Included

- First-run Setup Guide and non-secret System Check screen
- Custom company/site name
- Private administrator login with in-app credential rotation
- Encrypted server-side Etsy and Square credentials and OAuth tokens
- Read-only Etsy imports; the app never writes changes back to Etsy
- Etsy import change review, duplicate-SKU handling, Fix Center, and bulk editing
- Square preview and export with variations, images, categories, taxes, and inventory
- Versioned, automatically applied database migrations
- Export history limited to the latest 50 entries
- Provider disconnect and credential-rotation controls

## Install

Follow [INSTALL.md](INSTALL.md). The short version is:

1. Create a separate repository, Vercel project, and Neon/Postgres database for the business.
2. Add the six values listed in [.env.example](.env.example) to Vercel.
3. Deploy, attach the final HTTPS domain, and set both OAuth callback URLs.
4. Sign in and complete the in-app Setup Guide.
5. Test one product before transferring the full catalog.

The callback paths are:

```text
https://your-domain.example/api/oauth/etsy/callback
https://your-domain.example/api/oauth/square/callback
```

## Local development

```powershell
npm install
Copy-Item .env.example .env.local
.\scripts\generate-secrets.ps1
npm run setup:check
npm run dev
```

Copy the generated secrets into `.env.local`, add a development database URL and administrator credentials, then open `http://localhost:3000`.

## Operational documentation

- [Installation and customer handoff](INSTALL.md)
- [Upgrading safely](UPGRADING.md)
- [Backups and recovery](BACKUP.md)
- [Security model](SECURITY.md)
- [Support responsibilities](docs/SUPPORT.md)
- [Privacy notice template](docs/PRIVACY_TEMPLATE.md)
- [Acceptable-use template](docs/ACCEPTABLE_USE_TEMPLATE.md)
- [Release history](CHANGELOG.md)
- [Distribution license status](LICENSE.md)

## Important limits

This is a single-tenant application with one administrator login. It is not currently designed for several unrelated businesses to share one database or deployment. A shared service would require organization accounts, tenant IDs on every record, strict tenant authorization, account recovery, auditing, and billing controls.

`‘Etsy’ is a trademark of Etsy, Inc. This application uses Etsy's API, but is not endorsed or certified by Etsy.`
