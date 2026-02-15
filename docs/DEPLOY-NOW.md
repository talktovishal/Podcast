# Quick Deployment Guide

## Immediate Deployment (If You Have Credentials)

If you already have your Azure VM set up and SSH access, deploy immediately:

### From Your Local Machine

```bash
# Replace <your-vm-ip-or-fqdn> with your actual VM address
TARGET_HOST="<your-vm-ip-or-fqdn>" npm run azure:deploy:changes
```

**Example:**
```bash
TARGET_HOST="20.123.45.67" npm run azure:deploy:changes
# or
TARGET_HOST="articlepod.eastus.cloudapp.azure.com" npm run azure:deploy:changes
```

### With Custom SSH Key or User

```bash
TARGET_HOST="<vm-host>" \
TARGET_USER="azureuser" \
TARGET_SSH_KEY="~/.ssh/articlepod_azure" \
./scripts/azure/deploy-changes.sh
```

### What This Does

1. ⬆️ Syncs your local code to VM (`/home/azureuser/articlepod`)
2. 🔄 Promotes code to runtime directory (`/opt/articlepod`)
3. 📦 Installs dependencies and builds applications
4. 🔧 Sets up Python TTS service
5. 🔄 Restarts all services (web, worker, python-tts)
6. ✅ Runs health check

### Expected Output

```
[deploy-changes] syncing code to azureuser@<VM_HOST>:/home/azureuser/articlepod
sending incremental file list
...
[deploy-changes] promoting staged code + deploying runtime on VM
[promote-runtime] promoting /home/azureuser/articlepod to /opt/articlepod
[deploy-vm-runtime] installing dependencies
[deploy-vm-runtime] building applications
[deploy-vm-runtime] restarting services
● articlepod-python-tts.service - loaded active running
● articlepod-web.service - loaded active running
● articlepod-worker.service - loaded active running
[deploy-changes] verifying health at https://<VM_HOST>/api/health
{"status":"ok"}
[deploy-changes] done
```

## Automated Deployment via GitHub Actions

For continuous deployment, set up GitHub Actions:

### One-Time Setup

1. **Add GitHub Secrets** (Settings → Secrets and Variables → Actions):
   - `AZURE_VM_HOST`: Your VM IP or FQDN
   - `AZURE_SSH_KEY`: Content of `~/.ssh/articlepod_azure`

2. **Deploy Options:**

   **A. Manual Deploy:**
   - Go to Actions tab → "Deploy to Azure" → Run workflow
   
   **B. Auto Deploy on Push:**
   - Commit with `[deploy]` in message: `git commit -m "Fix bug [deploy]"`
   - Push to main branch

See `docs/azure-ci-cd.md` for complete setup instructions.

## Troubleshooting Quick Fixes

### "SSH key not found"
```bash
# Check if key exists
ls -la ~/.ssh/articlepod_azure

# If missing, copy from your backup or Azure portal
```

### "Missing target host"
```bash
# Set the environment variable
export TARGET_HOST="your-vm-ip"
npm run azure:deploy:changes
```

### "Health check failed"
```bash
# Deploy without health check
./scripts/azure/deploy-changes.sh --host <vm-host> --skip-healthcheck

# Then SSH to VM and check services manually
ssh -i ~/.ssh/articlepod_azure azureuser@<vm-ip>
sudo systemctl status articlepod-web articlepod-worker articlepod-python-tts
```

### "Permission denied (publickey)"
```bash
# Check key permissions
chmod 600 ~/.ssh/articlepod_azure

# Verify you can SSH manually
ssh -i ~/.ssh/articlepod_azure azureuser@<vm-ip>
```

## Getting VM Details

If you forgot your VM details:

```bash
# List your Azure VMs
az vm list --output table

# Get specific VM details
az vm show --resource-group <your-rg> --name <vm-name>

# Get public IP
az vm list-ip-addresses --resource-group <your-rg> --name <vm-name> --output table
```

## Complete Documentation

- 📖 **Initial setup**: `docs/azure-deploy.md`
- 🚀 **CI/CD setup**: `docs/azure-ci-cd.md`
- 🏗️ **Infrastructure**: `infra/README.md`
- 📜 **Scripts**: `scripts/azure/README.md`
