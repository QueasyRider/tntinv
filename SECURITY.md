# Security model

## Intended deployment

This application is a private, single-business administrative tool. One installation must not be shared by unrelated businesses. Use a separate deployment, database, encryption key, login, and provider connections for every business.

## Controls included

- Server-only Etsy and Square credentials
- AES-256-GCM encryption for saved provider configuration and OAuth tokens
- HTTP-only, secure production session cookies
- Constant-time credential comparisons and scrypt-hashed in-app administrator passwords
- Read-only Etsy scopes and no Etsy write path
- Non-secret System Check output
- Provider disconnect and credential rotation controls
- Versioned database migrations

## Operator responsibilities

- Restrict Vercel, GitHub, database, Etsy, and Square project access.
- Use unique secrets and administrator passwords for every installation.
- Keep Preview deployments away from production databases.
- Review logs without copying credentials or tokens into support tickets.
- Remove access promptly when a staff member leaves.
- Apply application and dependency updates after testing.
- Maintain backups and test recovery.

## Credential rotation

- Replace the administrator username and password in Settings.
- If the database-backed administrator password is lost, delete the single row in `admin_credentials`, then sign in with the original environment credentials and set a new login.
- Enter replacement Etsy or Square app credentials and save. Replacing app credentials clears the previous OAuth token and requires reconnection.
- Use **Disconnect and clear** to remove saved provider credentials and tokens.
- Rotate `SESSION_SECRET` in Vercel to sign out every browser.
- If `APP_ENCRYPTION_KEY` must change, reconnect providers after the old encrypted values are removed. Do not simply replace the key while encrypted credentials remain.

## Current limitations

The bundled login is one administrator account. It does not include MFA, password recovery, organization roles, per-user auditing, or multi-tenant authorization. A business that requires those controls should replace the bundled login with a managed identity provider before use.

Report suspected vulnerabilities privately to the repository owner. Do not include production secrets, OAuth tokens, customer data, or full database exports in a report.
