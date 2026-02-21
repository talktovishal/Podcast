# Azure CI/CD Deployment

This document explains how to set up automated deployments to Azure using GitHub Actions.

## Overview

The repository includes a GitHub Actions workflow (`.github/workflows/deploy-azure.yml`) that automates deployment to an already-provisioned Azure VM.

## Prerequisites

1. Azure infrastructure must already be provisioned (see `docs/azure-deploy.md`)
2. You must have:
   - VM IP address or FQDN
   - SSH private key for VM access (typically `~/.ssh/articlepod_azure`)
   - SSH host key entry for your VM (`known_hosts` format)

## GitHub Secrets Configuration

Configure the following secrets in your GitHub **environment** (recommended) or repository:

### Recommended secure path (production environment)

1. Go to **Settings > Environments > New environment**
2. Create environment: **`production`**
3. Configure protection rules:
   - Restrict deployments to branch `main`
   - Require reviewer approval for deploys
4. Add secrets under **Environment secrets**

#### Required Secrets:

1. **`AZURE_VM_HOST`**
   - Description: Your Azure VM's public IP address or FQDN
   - Example: `20.123.45.67` or `articlepod.eastus.cloudapp.azure.com`

2. **`AZURE_SSH_KEY`**
   - Description: SSH private key content (entire key file)
   - How to get it:
     ```bash
     cat ~/.ssh/articlepod_azure
     ```
   - Copy the entire output including `-----BEGIN OPENSSH PRIVATE KEY-----` and `-----END OPENSSH PRIVATE KEY-----`

3. **`AZURE_SSH_KNOWN_HOSTS`**
   - Description: Pinned SSH host key entry (known_hosts line)
   - How to generate:
     ```bash
     ssh-keyscan -H <your-vm-host>
     ```
   - Example:
     ```text
     articlepod.eastus.cloudapp.azure.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI...
     ```
   - Add the full output line as the secret value.

#### Optional Secret:

4. **`AZURE_VM_USER`** (optional)
   - Description: SSH username
   - Default: `azureuser`
   - Only set if you're using a different username

## Deployment Triggers

### Automatic Deployment

The workflow deploys automatically when:
- You push to `main` branch
- The commit message contains `[deploy]`
- Changes are not documentation-only

Example:
```bash
git commit -m "Add new feature [deploy]"
git push origin main
```

### Manual Deployment

You can trigger deployment manually from GitHub:

1. Go to **Actions** tab in your repository
2. Select **Deploy to Azure** workflow
3. Click **Run workflow**
4. Select branch `main`
5. Optionally check "Skip health check" if needed
6. Click **Run workflow** button

## Deployment Process

The workflow performs:

1. ✅ Checks out your code
2. ✅ Installs Node.js dependencies
3. ✅ Validates `main` branch + required deploy settings
4. ✅ Sets up SSH credentials with pinned host key verification
5. ✅ Syncs code to VM staging directory (`/home/azureuser/articlepod`)
6. ✅ Promotes code to runtime directory (`/opt/articlepod`)
7. ✅ Builds applications (web, worker)
8. ✅ Sets up Python TTS dependencies
9. ✅ Restarts systemd services
10. ✅ Runs health check (unless skipped)

## Monitoring Deployments

### View Deployment Status

- Check the **Actions** tab in GitHub
- Each deployment creates a workflow run with detailed logs
- Successful deployments show ✅ in commit history
- Failed deployments show ❌ with error details

### Deployment Summary

After each deployment, check the workflow summary for:
- Deployment status
- VM host deployed to
- Commit SHA
- Branch name

## Troubleshooting

### Common Issues

#### "AZURE_SSH_KEY secret is not configured"
- **Solution**: Add the `AZURE_SSH_KEY` secret to the `production` environment secrets

#### "AZURE_VM_HOST secret is not configured"
- **Solution**: Add the `AZURE_VM_HOST` secret to the `production` environment secrets

#### "AZURE_SSH_KNOWN_HOSTS secret is not configured"
- **Solution**: Generate and add it:
  ```bash
  ssh-keyscan -H <your-vm-host>
  ```

#### "Deploy workflow must run from main branch"
- **Solution**: Run the workflow for `main` only.

#### SSH connection failures
- **Solution**: 
  - Verify VM is running: `az vm get-instance-view`
  - Check firewall allows SSH from GitHub IPs
  - Verify SSH key matches the one used during VM setup
  - Re-generate and update `AZURE_SSH_KNOWN_HOSTS` if VM host key changed

#### Health check failures
- **Solution**:
  - Check service status: `sudo systemctl status articlepod-web`
  - Review logs: `sudo journalctl -u articlepod-web -n 100`
  - Try manual deployment with `--skip-healthcheck` first
  - Fix issues on VM, then redeploy

#### Build failures
- **Solution**:
  - Check Node.js version on VM matches development
  - Verify disk space: `df -h`
  - Check for dependency issues in workflow logs

## Manual Deployment (Local)

If you prefer to deploy from your local machine:

```bash
TARGET_HOST="<your-vm-ip-or-fqdn>" npm run azure:deploy:changes
```

Or with all options:
```bash
TARGET_HOST="<vm-ip>" \
TARGET_USER="azureuser" \
TARGET_SSH_KEY="~/.ssh/articlepod_azure" \
./scripts/azure/deploy-changes.sh
```

## Security Notes

- SSH private keys are stored as GitHub secrets (encrypted at rest)
- SSH host verification uses pinned `known_hosts` data (no trust-on-first-use during deploy)
- Keys are only accessible during workflow execution
- Never commit SSH keys to the repository
- Rotate keys periodically for security
- Use restrictive SSH key permissions on VM (600)

## Deployment Workflow Customization

### Deploy on Every Push (Not Recommended for Production)

To deploy on every push to main without requiring `[deploy]` tag:

Edit `.github/workflows/deploy-azure.yml`:
```yaml
if: github.event_name == 'workflow_dispatch' || github.event_name == 'push'
```

### Add Deployment Approval

For production environments, consider adding a manual approval step:

1. Use GitHub Environments
2. Configure required reviewers
3. Add environment to workflow:
   ```yaml
   jobs:
     deploy:
       environment: production
   ```

## Next Steps

After setting up CI/CD:

1. Test with a manual workflow dispatch
2. Verify deployment completes successfully
3. Check application health endpoint
4. Make a code change with `[deploy]` tag
5. Verify automatic deployment works

## Related Documentation

- Initial provisioning: `docs/azure-deploy.md`
- Infrastructure templates: `infra/README.md`
- Deployment scripts: `scripts/azure/README.md`
