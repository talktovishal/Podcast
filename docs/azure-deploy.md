# Azure Deployment Notes

## Resource map
- Web app container (`apps/web`).
- Worker container (`apps/worker`).
- Azure SQL Serverless for relational store.
- Azure Blob Storage for media artifacts.

## Environment setup
- Configure all variables from `docs/env.md`.
- Replace local SQLite URL with Azure SQL connection URL.
- Replace local media path with Blob adapter configuration.

## Container strategy
- Build and push separate images for web and worker.
- Run both with shared database and storage configuration.
- Keep worker horizontally scalable using job-claim transactions.
