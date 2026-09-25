# Upgrading safely

Database migrations are numbered and applied automatically when the new release first accesses the database. The System Check screen shows the installed and expected schema versions.

For every upgrade:

1. Read [CHANGELOG.md](CHANGELOG.md).
2. Create a database backup or restore point.
3. Confirm the encryption key is safely stored outside Vercel.
4. Deploy the release to a Preview environment connected to a non-production database.
5. Run the build, login, System Check, Etsy connection test, and Square connection test.
6. Test one import and one export.
7. Deploy or promote the validated release to Production.
8. Open **System Check** and confirm the schema version is current.

Do not roll application code back across a database migration unless the release notes explicitly say it is safe. If a release fails after a migration, restore both the previous application version and its matching database backup.

Create a Git tag for every customer-facing release, for example:

```text
v1.1.0
```

