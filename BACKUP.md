# Backup and recovery

Each business is responsible for two separate recovery assets: its database and its encryption key.

## Database

- Enable the database provider's automated backups or point-in-time restore feature.
- Take an additional backup before application upgrades or large imports.
- Keep backups in an account controlled by the business.
- Test a restore into a non-production database at least quarterly.

The database contains product working copies, import history, Square mappings, and encrypted provider credentials. Treat database exports as confidential even though provider secrets are encrypted.

## Encryption and session secrets

- Store `APP_ENCRYPTION_KEY` and `SESSION_SECRET` in a password manager or protected business recovery vault.
- Never place them in Git, email, tickets, screenshots, or customer documentation.
- Losing `APP_ENCRYPTION_KEY` makes the saved Etsy and Square credentials and tokens unreadable.
- Changing `SESSION_SECRET` signs out all browsers.

## Recovery order

1. Restore the database into a new database project.
2. Deploy the same application release that created the backup.
3. Restore the original encryption key and session secret.
4. Set `DATABASE_URL` to the restored database.
5. Redeploy and run System Check.
6. Test Etsy and Square connections before importing or exporting.

