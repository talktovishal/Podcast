# Azure IaC (Bicep + azd)

This folder contains reproducible infrastructure templates for the durable Azure target:
- Single Linux VM for runtime compute (`web`, `worker`, `python-tts`)
- Azure PostgreSQL Flexible Server for durable relational data
- Azure Blob Storage for durable artifacts (`uploads`, audio, diagnostics)

## Files
- `main.bicep` - primary resource deployment template
- `main.parameters.json` - example parameter file (replace placeholders before use)

## Provisioning

```bash
azd env new listenlater-prod
azd up
```

Equivalent raw ARM/Bicep validation:

```bash
az deployment group what-if \
  --resource-group <resource-group> \
  --template-file infra/main.bicep \
  --parameters @infra/main.parameters.json
```

## Notes
- Keep secrets out of parameter files in source control; prefer `azd env set` or Key Vault-backed secret inputs.
- The VM receives managed identity permissions to read/write blob objects in the storage account.
- Deployment/runbook helpers live under `scripts/azure/` and are documented in `docs/azure-deploy.md`.
