# Azure CI/CD Deployment

This document explains how to run Azure deployments from GitHub Actions without auto-deploying every successful `main` push.

## Overview

The repository includes a GitHub Actions workflow (`.github/workflows/deploy-azure.yml`) that automates deployment to an already-provisioned Azure VM.

## Prerequisites

1. Azure infrastructure must already be provisioned (see `docs/azure-deploy.md`)
2. You must have:
   - VM IP address or FQDN
   - SSH private key for VM access (typically `~/.ssh/articlepod_azure`)

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

3. **`APP_URL`**
   - Description: Canonical public app URL used for RSS/media URL generation.
   - Required value (production): `https://articlepod.com`

4. **`LETSENCRYPT_EMAIL`**
   - Description: Contact email used for automated Let’s Encrypt certificate issuance.

5. **`APP_DOMAIN_ALIASES`**
   - Description: Comma-separated alias domains redirected to canonical host.
   - Recommended value: `www.articlepod.com`

#### Optional Secret:

6. **`AZURE_VM_USER`** (optional)
   - Description: SSH username
   - Default: `azureuser`
   - Only set if you're using a different username

## Deployment Triggers

### Manual Deployment

You can trigger deployment manually from GitHub:

1. Go to **Actions** tab in your repository
2. Select **Deploy to Azure** workflow
3. Click **Run workflow**
4. Select branch `main`
5. Optionally check "Skip health check" if needed
6. Optionally check "Force full runtime setup" if you changed dependencies or python-tts requirements
7. Click **Run workflow** button

CI now uses a quick pull-request workflow for everyday changes and a separate nightly full validation workflow for expensive checks. Deployment remains a separate explicit step.

Recommended daily flow:

1. Create a short-lived branch
2. Run `pnpm preflight` locally
3. Commit locally
4. Push only when you explicitly want remote CI or a PR
5. Open a PR and wait for `CI`
6. Merge only after `validate-quick` is green
7. Use `full-ci` or manual dispatch when you want parity before merge
8. Let `Nightly Full CI` catch deep build/export/observability/parity regressions on `main`

## Deployment Process

The workflow performs:

1. ✅ Checks out your code
2. ✅ Validates `main` branch + required deploy settings
3. ✅ Sets up SSH credentials for CI deploy access
4. ✅ Probes SSH connectivity before any sync/promote work begins, so stale host/key settings fail early with a clear error
5. ✅ Syncs code to VM staging directory (`/home/azureuser/articlepod`)
   - shared exclusion list now skips local `exports/`, worktrees, `.runtime`, test reports, and other non-runtime artifacts
   - remote disk guard runs before sync and auto-cleans safe junk before deciding whether there is enough headroom
6. ✅ Auto-bootstraps VM only when runtime user is missing (first-run guard)
7. ✅ Promotes code to runtime directory (`/opt/articlepod`)
8. ✅ Runs incremental runtime deploy on VM:
   - `pnpm install` only when `pnpm-lock.yaml` changed
   - python-tts setup only when requirements/assets changed
   - demo seed once by default (`auto` mode)
   - recurring maintenance timer + journald caps are installed/updated during runtime setup
9. ✅ Configures nginx ingress for canonical host + alias redirects
   - auto-tunes `server_names_hash_*` in `/etc/nginx/nginx.conf` only when nginx reports hash-size insufficiency
10. ✅ Provisions/renews Let’s Encrypt certificates (SAN cert includes canonical + aliases)
11. ✅ Restarts systemd services
12. ✅ Runs health check against canonical host (unless skipped)

## Monitoring Deployments

### View Deployment Status

- Check the **Actions** tab in GitHub
- Each deployment creates a workflow run with detailed logs
- Successful deployments show ✅ in commit history
- Failed deployments show ❌ with error details

## CI cost control

- `CI` now cancels superseded runs on the same branch or PR automatically.
- Docs-only changes short-circuit instead of installing dependencies and running app checks.
- Narrow web-only and worker-only changes run only the checks relevant to that surface.
- Quick pull-request CI avoids routine build/export/observability work.
- `Nightly Full CI` runs the expensive full-suite and parity checks once per night on `main`.
- Parity runs in PRs only for runtime-sensitive changes, manual dispatch, or PRs explicitly labelled `full-ci`.

### Deployment Summary

After each deployment, check the workflow summary for:

- Deployment status
- VM host deployed to
- Commit SHA
- Branch name

## Troubleshooting

### Read-only publication preflight

Run **Publication Preflight (Read Only)** manually from `main` before a secrets
migration. It uses the existing production SSH key and requires pinned host keys
in `AZURE_SSH_KNOWN_HOSTS`; it never disables host verification.

The check reads the running web service's environment in memory, tests managed
identity availability, and checks whether that identity can read ARM permissions.
It reports only fixed boolean status fields and HTTP status codes. It does not
print environment values, identity tokens, subscription details, or SSH output.
It does not deploy, restart, provision resources, rotate passwords, or modify
application data.

A successful inventory is not evidence that the identity can create a vault or
assign roles. Those permissions must be established separately before migration.
Missing access blocks the check; do not broaden the runtime identity's privileges
just to make this check pass.

On host-verification failure, the check distinguishes a changed host key from an
unmatched target pin where SSH supplies that diagnosis. It also uses local
`ssh-keygen` checks to report only whether the stored pin contains valid keys,
matches the configured target, or looks like a bare public key instead of a
known_hosts entry. It does not print hosts, fingerprints, key material, or raw
SSH output, perform `ssh-keyscan`, repair pins, or accept a network-provided key.

The workflow first runs offline launcher/preflight tests and Bicep compilation
in a job with no production environment or secret inputs. Select
`validation_only` to run that job without attempting SSH. A successful
validation-only run does not establish VM access or credential invalidation;
the production inventory job is explicitly skipped.

### Key Vault foundation (not activated)

`infra/secrets.bicep`, `scripts/azure/keyvault-exec.py`, and the opt-in
`scripts/azure/runtime-exec.sh` router are staged migration components. Updated VM
unit templates preserve their original commands behind that router. With no
`ARTICLEPOD_SECRET_SOURCE` setting, or with `environment`, they retain legacy
environment handling. Local development is unchanged. No production cutover or
credential rotation has occurred.

The Bicep module creates only a vault and a vault-scoped **Key Vault Secrets User**
assignment for the verified VM system-assigned identity. It enables RBAC, soft
delete, purge protection, and a default-deny firewall with explicitly supplied
IPv4 allow rules. It does not create or update a VM, database, storage account,
identity, network, or application. Independently confirm the existing VM's actual
egress and authorized administration network before supplying the allow rules.
If the deployment requires private endpoints or service-endpoint subnet rules,
resolve that topology first rather than opening the firewall to all addresses.

Vault provisioning requires separately authorized management and role-assignment
access. Secret seeding/rotation requires a separate administrator's scoped data
plane write access and an allowed network path. This template deliberately does
not grant secret-write or subscription-management rights to the runtime identity.
Review an authenticated Azure what-if before applying it; reject unexpected
resource changes. Do not apply `infra/main.bicep` to add this vault.

The router selects the launcher only for `ARTICLEPOD_SECRET_SOURCE=keyvault`;
empty/unknown settings fail rather than select a fallback. Its manifest contains
only version references. This schema illustration is intentionally incomplete
and must not be used as the production service inventory:

```json
{
  "vault_url": "https://your-vault-name.vault.azure.net",
  "services": {
    "web": {
      "MEDIA_SIGNING_KEY": "media-signing-key/00000000000000000000000000000000"
    },
    "python-tts": {
      "PYTHON_TTS_SECRET": "python-tts-secret/00000000000000000000000000000000"
    }
  }
}
```

Replace each illustrative version with a real, enabled 32-character version ID.
Supported service names are `web`, `worker`, `python-tts`, `worker-overflow`, and
`ops`. Every configured reference is mandatory for that service; there is no
`latest`, optional-secret, or environment-value fallback. The live inventory must
determine the complete map for each service and operational command. The runtime
uses `PYTHON_TTS_SECRET`; the older planned `TTS_SIDECAR_SECRET` name is not its
current configuration name.

On the VM, install a root-owned, non-group/world-writable manifest in a protected
directory such as `/etc/articlepod/keyvault-secrets.json`. Invoke
`python3 scripts/azure/keyvault-exec.py --manifest <absolute-manifest-path>
--service <service-name> -- <existing-service-command>` from the existing working
directory only after the rollout gates below pass. Command arguments must never
contain secret values.

For VM services, the router reads `ARTICLEPOD_KEYVAULT_MANIFEST` (default
`/etc/articlepod/keyvault-secrets.json`). Operators can use the same routing with
`bash scripts/azure/runtime-exec.sh ops <command>` after loading only public
settings. Keep deployment credentials out of that inherited environment.
Installing units checks that both routing files are present; it does not prove
that the live identity can read the required secrets.

`render-env.sh` accepts the same opt-in setting to generate public configuration:
it clears every registered application secret before rendering, writes no
credential or derived signing-key values, and includes the manifest path.
Secret-bearing keys already in the legacy template remain present but empty.
The default legacy output retains explicit secrets and existing derivation
behavior. When a vault-mode Azure OpenAI endpoint is supplied, select
`DIGEST_SUMMARY_PROVIDER` explicitly rather than relying on API-key presence.
Manifest paths must be absolute and contain only letters, digits, `_`, `.`, `/`,
or `-`.

**Do not activate vault mode yet.** The existing bulk deployment/build and
operational credential cutover is not complete. `assert-legacy-deploy.py` prevents
`deploy-changes.sh` from activating vault mode or overwriting an already
vault-managed environment, before sync or environment upload. Direct
`deploy-vm-runtime.sh` runs are also guarded before runtime setup. Ordinary
legacy-mode deployments remain supported. This guard must remain until a
vault-aware deployment path is implemented and validated, so a subsequent deploy
cannot restore old GitHub secret values. VM unit support alone is not support for
an Azure Container Apps overflow deployment; confirm the live topology and
configure that separate consumer before cutover.

The launcher obtains a system-assigned managed-identity token directly from
Azure IMDS, fetches exact secret versions over HTTPS, and replaces itself with
the original service command only after all lookups succeed. Proxy environment
settings and HTTP redirects are disabled for both identity and vault requests.
Retries are bounded; denied, absent, disabled, expired, and not-yet-valid secrets
block startup with fixed diagnostic codes. Response bodies and tokens are never
logged. Known inherited application secrets are removed before the selected
service's values are injected. Other non-secret settings remain inherited.
Duplicate manifest keys, unexpected environment names, writable/unowned manifests,
and mismatched returned secret versions are rejected.

Secret values remain in process memory/environment, not launcher-created files.
Core dumps are disabled before retrieval on Linux. A shared VM identity does not
isolate services from one another: any process able to use that identity can
request its permitted secrets. Service maps reduce accidental propagation; they
are not independent Azure authorization boundaries.

Activation remains blocked until trusted SSH and Azure/provider administrative
access establish the live runtime version, identity, credentials, and consumers.
Preserve the effective `MEDIA_SIGNING_KEY` unchanged before rotating any storage
connection string from which it may have been derived. Then migrate all consumers,
including maintenance and deploy-time commands, remove persistent plaintext
secret paths, verify continuity, and revoke retired credentials at their providers.
Do not use this launcher to run the broad demo seeder as a password-rotation
shortcut. It does not update password hashes, revoke sessions, alter podcast
URLs, or mutate application data.

Offline checks, with no Azure login or production secrets:

```text
python -m unittest discover -s scripts/azure/tests -p test_keyvault_exec.py
python -m unittest discover -s scripts/azure/tests -p test_runtime_secret_routing.py
bicep build infra/secrets.bicep --stdout
```

These checks are not proof of live access, credential revocation, or production
readiness. Publishing the repository remains gated on those separate results.

### Common Issues

#### "AZURE_SSH_KEY secret is not configured"

- **Solution**: Add the `AZURE_SSH_KEY` secret to the `production` environment secrets

#### "AZURE_VM_HOST secret is not configured"

- **Solution**: Add the `AZURE_VM_HOST` secret to the `production` environment secrets

#### "APP_URL must be set to https://articlepod.com"

- **Solution**: Set `APP_URL` environment secret to exactly:
  ```text
  https://articlepod.com
  ```

#### "Missing LETSENCRYPT_EMAIL while ingress automation is enabled"

- **Solution**: Add `LETSENCRYPT_EMAIL` as an environment secret.
- Ensure DNS for `articlepod.com` and `www.articlepod.com` already points to the VM before deploy.

#### "could not build server_names_hash, you should increase server_names_hash_bucket_size"

- **Current behavior**: `configure-nginx.sh` auto-applies idempotent hash-size tuning in `/etc/nginx/nginx.conf` and retries nginx validation.
- **If it still appears**:
  - Check for custom nginx snippets overriding `http` block settings.
  - Validate config directly on VM:
    ```bash
    sudo nginx -t
    ```

#### "`server_names_hash_bucket_size` directive is duplicate"

- **Current behavior**: deploy automation removes legacy `/etc/nginx/conf.d/<site>-server-names.conf` during reconfigure.
- **If it still appears**:
  - Remove stale managed file and reload:
    ```bash
    sudo rm -f /etc/nginx/conf.d/articlepod-server-names.conf
    sudo nginx -t
    sudo systemctl restart nginx
    ```
  - Re-run deployment workflow.

#### "Deploy workflow must run from main branch"

- **Solution**: Run the workflow for `main` only.

#### SSH connection failures

- **Solution**:
  - Verify VM is running: `az vm get-instance-view`
  - Refresh `AZURE_VM_HOST` to the VM's current public FQDN or IP
  - Refresh `AZURE_SSH_KEY` with the current contents of `~/.ssh/articlepod_azure`
  - Check firewall allows SSH from GitHub-hosted runners
  - The deploy workflow now runs an explicit SSH probe before sync, and `deploy-changes.sh` uses SSH connect/keepalive guards for all remote steps

#### "Missing runtime user 'articlepod'. Run bootstrap first."

- **Current behavior**: this is auto-handled in `deploy-changes.sh` by running bootstrap once.
- **If it still appears**:
  - Ensure `sudo` works non-interactively for your VM user (`azureuser`)
  - Ensure staging path contains bootstrap script (`/home/azureuser/articlepod/scripts/azure/bootstrap-vm.sh`)

#### "Failed to enable unit: ... listenlater-\*.service already exists"

- **Current behavior**: `install-systemd.sh` now removes stale legacy unit files before enabling canonical `articlepod-*` units.
- **If it still appears**:
  - SSH to VM and remove stale units manually:
    ```bash
    sudo rm -f /etc/systemd/system/listenlater-web.service /etc/systemd/system/listenlater-worker.service /etc/systemd/system/listenlater-python-tts.service
    sudo systemctl daemon-reload
    ```
  - Re-run deployment workflow.

#### "Missing env file: /etc/articlepod/articlepod.env"

- **Current behavior**: deploy auto-copies from legacy `/etc/listenlater/listenlater.env` when present.
- **If it still appears**:
  - Render canonical env on VM:
    ```bash
    sudo /opt/articlepod/scripts/azure/render-env.sh
    ```
  - Confirm file exists:
    ```bash
    ls -la /etc/articlepod/articlepod.env
    ```

#### Health check failures

- **Solution**:
  - Deploy helper already retries health checks (default: 15 attempts, 2s delay)
  - Check service status: `sudo systemctl status articlepod-web`
  - Review logs: `sudo journalctl -u articlepod-web -n 100`
  - Try manual deployment with `--skip-healthcheck` first
  - Fix issues on VM, then redeploy

#### Build failures

- **Solution**:
  - Check Node.js version on VM matches development
  - Verify disk space: `df -h`
  - Check for dependency issues in workflow logs
  - If you changed dependencies, rerun workflow with **Force full runtime setup**

#### "No space left on device" during python-tts setup

- **Current behavior**:
  - deploy preflight now refuses to continue when free space stays below the configured floor after safe cleanup
  - runtime deploy installs CPU-only torch wheels and disables pip cache to reduce disk usage
  - VM maintenance timer vacuums journald, removes staging-only artifacts, and pressure-cleans caches every 6 hours
- **If it still appears**:
  - SSH to VM and reclaim space:
    ```bash
    df -h
    sudo /opt/articlepod/scripts/azure/cleanup-vm-disk.sh
    sudo journalctl --disk-usage
    sudo systemctl status articlepod-maintenance.timer
    ```
  - Re-run deployment workflow.

#### Remote disk guard thresholds

- `deploy-changes.sh` warns below `4096 MB` free and fails below `2048 MB` by default.
- `--full-deploy` raises the defaults to `8192 MB` warn / `4096 MB` fail.
- Override when needed with:
  - `DEPLOY_WARN_FREE_MB`
  - `DEPLOY_FAIL_FREE_MB`
  - or CLI flags `--warn-free-mb` / `--fail-free-mb`

## Manual Deployment (Local)

If you prefer to deploy from your local machine:

```bash
TARGET_HOST="<your-vm-ip-or-fqdn>" \
CANONICAL_HOST="articlepod.com" \
HOST_ALIASES="www.articlepod.com" \
LETSENCRYPT_EMAIL="<email>" \
APP_URL="https://articlepod.com" \
npm run azure:deploy:changes
```

Or with all options:

```bash
TARGET_HOST="<vm-ip>" \
TARGET_USER="azureuser" \
TARGET_SSH_KEY="~/.ssh/articlepod_azure" \
CANONICAL_HOST="articlepod.com" \
HOST_ALIASES="www.articlepod.com" \
LETSENCRYPT_EMAIL="<email>" \
APP_URL="https://articlepod.com" \
./scripts/azure/deploy-changes.sh
```

Force a full runtime refresh from local:

```bash
TARGET_HOST="<vm-ip>" \
TARGET_USER="azureuser" \
TARGET_SSH_KEY="~/.ssh/articlepod_azure" \
CANONICAL_HOST="articlepod.com" \
HOST_ALIASES="www.articlepod.com" \
LETSENCRYPT_EMAIL="<email>" \
APP_URL="https://articlepod.com" \
./scripts/azure/deploy-changes.sh --full-deploy
```

## Security Notes

- SSH private keys are stored as GitHub secrets (encrypted at rest)
- Current CI workflow sets `StrictHostKeyChecking no` for non-interactive deploy reliability; if you need strict host verification, update `.github/workflows/deploy-azure.yml` accordingly.
- Keys are only accessible during workflow execution
- Never commit SSH keys to the repository
- Rotate keys periodically for security
- Use restrictive SSH key permissions on VM (600)

## Deployment Workflow Customization

### Re-enable Auto Deploys Later

If you ever want to bring automatic deploys back, you can reintroduce a `workflow_run` trigger in `.github/workflows/deploy-azure.yml` that listens for successful `CI` runs on `main`.

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
4. Run one manual deploy from `main`
5. Verify deployment completes successfully

## Related Documentation

- Initial provisioning: `docs/azure-deploy.md`
- Infrastructure templates: `infra/README.md`
- Deployment scripts: `scripts/azure/README.md`
