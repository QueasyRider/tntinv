# Installation and customer handoff

Use this checklist for every business. Never clone an existing customer's production database or environment variables.

## 1. Prepare the customer's copy

1. Create a repository from the clean distribution template.
2. Keep the repository private unless you intentionally license it for public use.
3. Create a new Vercel project from that repository.
4. Create a new Neon/Postgres database for this business only.

Do not copy `.env.local`, `.vercel`, `.data`, `.next`, `node_modules`, database exports, OAuth tokens, or saved provider credentials from another installation.

## 2. Generate unique secrets

On Windows PowerShell, run:

```powershell
.\scripts\generate-secrets.ps1
```

Save both generated values in a password manager. The encryption key cannot be recovered from the application. Losing it makes saved Etsy and Square credentials unreadable.

## 3. Configure Vercel

Add these Environment Variables to the Production environment:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | The customer's Postgres connection string |
| `APP_ENCRYPTION_KEY` | Generated 32-byte base64 key |
| `PUBLIC_APP_URL` | Final HTTPS domain, with no trailing slash |
| `ADMIN_USERNAME` | Initial administrator username |
| `ADMIN_PASSWORD` | Unique password with at least 12 characters |
| `SESSION_SECRET` | A generated value with at least 32 characters |

Use a separate database and separate secret values for Preview deployments. A preview should never connect to the production database.

After adding or changing an environment variable, redeploy the application.

## 4. Connect the domain and callbacks

Attach the final domain in Vercel and confirm HTTPS is active. Register these exact callback URLs in the customer's existing developer apps:

```text
https://CUSTOMER-DOMAIN/api/oauth/etsy/callback
https://CUSTOMER-DOMAIN/api/oauth/square/callback
```

Redirect URLs must match exactly, including the protocol, hostname, path, and absence of an extra trailing slash.

## 5. Complete the in-app setup

1. Sign in with the initial administrator credentials.
2. Open **Setup Guide**.
3. Resolve every blocking item in **System Check**.
4. In **Settings**, enter the company name and final public URL.
5. Save and connect the customer's Etsy and Square apps.
6. Run both connection tests.
7. Optionally replace the initial administrator login in Settings.
8. Finish the Setup Guide.

## 6. Acceptance test

Before a full import:

1. Import Etsy inventory.
2. Select one low-risk listing.
3. Review its SKU, variants, images, category, tax setting, and quantity.
4. Mark it ready.
5. Export it to Square.
6. Confirm the item, variations, images, tax, category, and inventory in Square.

Only proceed with the full catalog after this test passes.

## 7. Customer handoff

Give the business owner:

- The production URL
- Their administrator username and password
- Ownership or access to the Vercel project
- Ownership or access to the database project
- A secure copy of `APP_ENCRYPTION_KEY` and `SESSION_SECRET`
- Links to [BACKUP.md](BACKUP.md), [SECURITY.md](SECURITY.md), and [UPGRADING.md](UPGRADING.md)

Record the installed application version shown in the footer and System Check screen.

