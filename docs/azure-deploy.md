# Azure Deployment (Durable VM Topology)

## Target architecture
- Compute: single Linux VM
  - `web` (Next.js)
  - `worker` (queue processor)
  - `python-tts` (Kokoro service)
- Durable data:
  - Azure PostgreSQL Flexible Server
  - Azure Blob Storage

This is cost-first while preserving durability on VM loss.

## Infrastructure as code
- Template: `/Users/vishalchowdhary/Documents/Podcast/infra/main.bicep`
- azd project file: `/Users/vishalchowdhary/Documents/Podcast/azure.yaml`

Provision:
```bash
azd env new listenlater-prod
azd up
azd env refresh
```

Optional what-if review:
```bash
az deployment group what-if \
  --resource-group <rg> \
  --template-file infra/main.bicep \
  --parameters @infra/main.parameters.json
```

## VM runtime bootstrap
On VM (root):
```bash
sudo /Users/vishalchowdhary/Documents/Podcast/scripts/azure/bootstrap-vm.sh
```

Render env file:
```bash
sudo DATABASE_URL="postgresql://..." \
  APP_URL="https://<domain>" \
  STORAGE_BACKEND="azure_blob" \
  AZURE_STORAGE_CONTAINER="listenlater" \
  AZURE_STORAGE_CONNECTION_STRING="..." \
  PYTHON_TTS_URL="http://127.0.0.1:8010" \
  /Users/vishalchowdhary/Documents/Podcast/scripts/azure/render-env.sh
```

## Deploy application runtime
From local machine:
```bash
TARGET_HOST=<vm-ip> /Users/vishalchowdhary/Documents/Podcast/scripts/azure/push-to-vm.sh
```

On VM (root):
```bash
sudo /Users/vishalchowdhary/Documents/Podcast/scripts/azure/deploy-vm-runtime.sh
```

Service units installed:
- `listenlater-python-tts.service`
- `listenlater-web.service`
- `listenlater-worker.service`

## Post-deploy validation
1. Check services:
- `systemctl status listenlater-python-tts listenlater-web listenlater-worker`

2. Check app health:
- `curl -sf https://<domain>/api/health`

3. Run podcast contract gate against live feed URL:
- `./scripts/verify_podcast_contract.sh "https://<domain>/rss/<token>.xml"`

4. Run durability drill scripts:
- `npm run ops:pre-drill-snapshot`
- execute VM reprovision/failure simulation
- `npm run ops:verify-restore`
