# Azure CI/CD Deployment

This document explains how to run Azure deployments from GitHub Actions without auto-deploying every successful `main` push.

## Overview

The legacy workflow (`.github/workflows/deploy-azure.yml`) deploys to an
already-provisioned environment-mode VM. The separate
`deploy-azure-keyvault.yml` workflow supports routine deployment only after
the controlled Key Vault bootstrap and consumer migration are complete.

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

6. **`AZURE_SSH_KNOWN_HOSTS`**
   - Independently verified OpenSSH known-hosts entries for the exact `AZURE_VM_HOST`.
   - Verify the VM and its host keys through the owning Azure account or another
     trusted console. Do not accept a network scan as proof of identity.
   - Missing, changed, or unmatched pins block deployment. Do not bypass this gate.

#### Optional Secret:

7. **`AZURE_VM_USER`** (optional)
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

The production job runs only for `main` in `talktovishal/Podcast`. Its SSH probe,
deployment commands, SCP uploads, and rsync transport share strict host checking
against the saved pins. They ignore local SSH configuration, global host files,
DNS host-key trust, and agent identities/forwarding. Host keys cannot be updated
automatically. Temporary runner credentials are removed in an always-run step.

For local deployment, pass `--ssh-known-hosts /absolute/path/to/known_hosts`,
or set `TARGET_KNOWN_HOSTS_FILE` for either deployment helper. Literal paths with
spaces and apostrophes are supported; OpenSSH expansion/control characters are
not. An explicitly empty path fails rather than falling back. Omitting this
setting preserves legacy local SSH configuration behavior, not a verified trust
guarantee. Explicit Key Vault mode always requires saved pins, including local
invocations. It cannot bootstrap or activate an unmigrated VM.

Recommended daily flow:

1. Create a short-lived branch
2. Run `pnpm preflight` locally
3. Commit locally
4. Push only when you explicitly want remote CI or a PR
5. Open a PR and wait for `CI`
6. Merge only after `validate-quick` is green
7. Use `full-ci` or manual dispatch when you want parity before merge
8. Let `Nightly Full CI` catch deep build/export/observability/parity regressions on `main`

### VM extraction diagnostics

**Probe URL Extraction (VM)** is a separate, manual legacy-only diagnostic.
It requires original-repository `main`, independently saved host pins, and the
legacy configuration guard before transferring or executing probe code. It
shares production deployment concurrency, uses job-owned temporary SSH files,
and removes its unique temporary remote script on exit. `fail_on_error=false`
can tolerate an extraction failure, not failed SSH or missing structured output.
It is not a vault diagnostic or an alternative access path around migration
gates. After vault cutover, keep it blocked until separately integrated.

Only supply public article URLs. Inputs, response headers, extraction metadata,
logs, and artifacts are retained and may be visible after repository
publication. Do not submit private feeds, credential-bearing URLs, or private
customer material. Historical runs/artifacts need a separate exposure review;
hardening the current workflow does not sanitize old records.

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
known_hosts entry. If keys are valid but the target has no matching entry, a
bounded `ssh-keyscan` compares advertised public keys in memory with the already
saved pins and reports only boolean results. Revoked and certificate-authority
entries are not usable direct-host pins. This comparison does not authenticate
the endpoint or repair the configuration. No scanned key is accepted, written
to a pin file, or substituted into an SSH connection. Hosts, fingerprints, key
material, and raw SSH output are never printed.

The workflow first runs offline launcher/preflight tests and Bicep compilation
in a job with no production environment or secret inputs. Select
`validation_only` to run that job without attempting SSH. A successful
validation-only run does not establish VM access or credential invalidation;
the production inventory job is explicitly skipped.
A separate secret-free build job checks Azure Table and Prisma-backed Azure
profiles, including enabled Azure Table mirroring. Inventory requires both
validation jobs to succeed.

### Key Vault foundation (not activated)

`infra/secrets.bicep`, `scripts/azure/keyvault-exec.py`, and the opt-in
`scripts/azure/runtime-exec.sh` router are staged migration components. Updated VM
unit templates retain the application entrypoints behind that router. With no
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

VM units explicitly pass their protected environment-file path to the router.
In vault mode, the file supplies public settings and the manifest reference;
inherited application settings or manifest overrides cannot replace them.
The overflow router explicitly applies `WORKER_ROLE=overflow` and
`WORKER_OVERFLOW_ENABLED=1` after loading, preserving that service's role even
when the shared file configures the primary worker. Other systemd overrides are
not implicitly imported. Prisma readiness and the worker's TTS health probe use
public-only `ExecStartPre` commands. Application processes receive their pinned
service maps. Vault shells do not load profiles; legacy login-shell execution
remains supported.

`render-env.sh` accepts the same opt-in setting to generate public configuration:
it clears every registered application secret before rendering, writes no
credential or derived signing-key values, and includes the manifest path.
Secret-bearing keys already in the legacy template remain present but empty.
The default legacy output retains explicit secrets and existing derivation
behavior. When a vault-mode Azure OpenAI endpoint is supplied, select
`DIGEST_SUMMARY_PROVIDER` explicitly rather than relying on API-key presence.
Manifest paths must be absolute and contain only letters, digits, `_`, `.`, `/`,
or `-`.

**Protected public configuration:** The launcher accepts `--env-file` with an
absolute path to reviewed vault-mode output from the renderer. It parses literal,
unquoted `KEY=value` lines, never shell code or interpolation. The file must
declare the Azure runtime profile, selected metadata backend, required public
endpoints/container, vault source, an absolute VM manifest path, and exactly
`ARTICLEPOD_BOOTSTRAP_ADMIN_ON_STARTUP=0`. Omission, `false`, or any other value
is rejected because the current application permits startup account bootstrap
unless this flag is exactly `0`. Empty
registered secret slots are removed; nonempty secrets, duplicate or unknown names,
control-character injection, quoted/escaped values, and endpoint userinfo,
queries, or fragments are rejected. Additional live settings must be reviewed
and explicitly supported, not silently discarded during migration.

Before writing vault-mode output, the renderer checks its complete candidate in
memory with `--check-public-env-stdin`. Invalid candidates leave existing output
unchanged and are not echoed or written to temporary files. This validation-only
mode reads at most 64 KiB plus one overflow-detection byte and makes no identity
or vault requests. It does not bypass the protected-file checks for execution.
Legacy rendering is unchanged.

Both public configuration and manifests require bounded regular files,
root ownership, and no group/world write permission on Linux. Final symlinks
are refused; nonblocking opens reject FIFOs without waiting for a writer. Keep
their parent directories protected and grant the service account only the read
access it needs. "Public" means non-credential configuration, not approval to
publish actual production settings or operational metadata.

These standalone execution forms are prerequisites, not a deployment cutover:

```text
python3 scripts/azure/keyvault-exec.py --env-file /etc/articlepod/articlepod.env --public-only -- <build-command>
python3 scripts/azure/keyvault-exec.py --env-file /etc/articlepod/articlepod.env --service ops -- <operational-command>
```

The public-only form does not read the manifest or contact IMDS/Key Vault. The
operations form uses the manifest selected by the protected file and resolves
all pinned secrets for the selected map before executing. An explicit
`--manifest` cannot be combined with `--env-file`. Both forms inherit only
allowlisted host settings such as `PATH` and `HOME`; the file supplies application
settings. Inherited application/deployment credentials and interpreter controls
such as `NODE_OPTIONS`, `PYTHONPATH`, and `NEXT_PHASE` do not reach the child.
Command arguments are passed literally, without a shell added by the launcher.

The loader is not a sandbox: the chosen command can still read files or perform
its own authentication. A build must also exclude secret-bearing `.env` files
and credential-loading shell profiles. File-based execution does not import
arbitrary systemd overrides. The VM and remote integrations below use explicit
public-only and service scopes. Other consumers and operational entrypoints
still require inventory and migration before activation.

**Secret-free builds:** During Next.js's own `phase-production-build`, web
configuration does not require runtime signing secrets, and Azure Table primary
and mirror stores defer client/table initialization until an actual operation.
Their selected backends and mirror-enabled state are unchanged. An accidental
build-time data operation still fails without credentials; it does not fall
back to Prisma or disable mirroring. Build instrumentation does not bootstrap
accounts or start keepalive timers.

Outside that framework build phase, the existing signing-secret validation
and eager Azure credential checks remain in force. Normal core/worker store
construction is unchanged unless deferral is explicitly requested. No schema,
table names, entity keys, account hashes, feed tokens, or media URLs change.

With declared dependencies installed, use a checkout without local `.env` files:

```text
python scripts/azure/verify-secret-free-build.py --metadata-backend azure_table
python scripts/azure/verify-secret-free-build.py --metadata-backend prisma
```

This verifier allowlists inherited host variables, generates the correct Prisma
client, performs a real production build without service credentials, and loads
a compiled route in fresh processes to verify that missing runtime signing
secrets still fail. It invalidates only the generated Prisma cache marker so
later normal commands cannot reuse a client for the wrong profile. It uses
isolated loopback/public test settings: its `.next` output is verification
material, not a production release artifact. It does not fetch vault secrets,
connect to a database, or replace the still-pending deployment cutover.

**VM-side deployment integration:** `deploy-vm-runtime.sh` accepts explicit
`ARTICLEPOD_SECRET_SOURCE=keyvault` with `DEPLOY_DEMO_SEED_MODE=never` for an
already-configured VM. The supplied public environment file must pass the
protected loader. Before mutating deployment steps, it resolves all references
for `ops`, `web`, `worker`, and `python-tts`, plus `worker-overflow` when enabled.
This verifies configured references, not the completeness of the live consumer
inventory or end-to-end provider functionality.
Node, Corepack, and Python must already be available on the runtime user's
non-login `PATH`; the preflight checks this without loading shell profiles.

Dependency installation, Prisma generation, web/worker builds, Python setup,
and Python asset probes run with public settings only. Database bootstrap and
TTS preview precompute use the pinned `ops` map. Commands use argument arrays,
not `eval`, and vault-mode command shells do not load login profiles. Any
credential-resolution failure aborts without a plaintext fallback. Preview
failure is also fatal in this mode rather than a successful deployment warning.

Key Vault deployments refuse local `.env` files in both runtime and staging
trees, including `.env.azure`, before running commands; they do not delete
those files to proceed.
Retire them through the controlled migration after reviewing their contents.
The public file is not replaced with a legacy fallback. Azure/Prisma operations
require a vault-supplied PostgreSQL URL; the parent shell does not read a database
secret to create SQLite files. Runtime paths reject relative/root-directory
targets, and existing data-file ownership is not recursively rewritten.
`check-vault-deployment.py` requires separate canonical application/staging
trees, protected configuration outside them, and explicit storage/log paths.
It rejects data overlapping staging or containing application/configuration
trees. Data within the application is allowed only under excluded `.runtime`.
These read-only checks resolve symlinks but are not a filesystem sandbox or
protection against concurrent privileged filesystem changes.

Demo/account seeding is always disabled in this mode, even for a forced full
dependency rebuild. Use the separately controlled account-rotation operation,
not seeding. VM maintenance retains retired runtime trees when current legacy
configuration cannot be established, including vault-mode or absent configuration.
Legacy environment-mode command behavior remains supported.

**Routine remote vault deployment:** After initial migration, select
`ARTICLEPOD_SECRET_SOURCE=keyvault` when invoking `deploy-changes.sh`. It requires
explicit saved host pins, the existing protected VM configuration, matching
runtime unit templates and installed unit routing, non-login runtime tools,
and successful resolution of all selected service references before sync.
The canonical health URL comes from the VM file; a conflicting supplied URL
fails. Environment rendering/upload, ingress reconfiguration, and account
seeding are refused. Insufficient disk space fails without deleting caches,
logs, or retired trees.

Promotion uses rsync ownership changes only for included transferred files;
excluded `.runtime` data and protected configuration remain untouched. Vault
unit installation updates runtime services and file-configured TTS memory
settings, but leaves maintenance units/timers, journald configuration, and
legacy compatibility files alone. It does not start a maintenance timer as an
incidental cleanup path. An enabled or active VM overflow worker is preserved
when no policy is supplied. Explicit enable starts it; explicit disable stops
it. Unknown existing state requires an explicit operator decision.

The manual **Deploy to Azure (Key Vault)** workflow shares the legacy workflow's
production environment, original-repository/main guard, and concurrency group.
It has no application-secret expressions, render step, seed step, ingress
change, or health-check bypass. It uses `ARTICLEPOD_DEPLOY_SSH_KEY` and
`ARTICLEPOD_DEPLOY_KNOWN_HOSTS`, plus `AZURE_VM_HOST` and optional `AZURE_VM_USER`.
Create those new transport credentials during controlled cutover. After proving
the new path, revoke the retired SSH identity and remove obsolete legacy secret
copies, including repository/environment duplicates. Retiring the old credential
names is necessary to prevent historical legacy workflow reruns from obtaining
the new deployment key. A branch-only environment restriction does not by itself
prevent rerunning an old main-branch workflow.

Both workflows use job-owned temporary SSH files with private permissions and
always-run cleanup. A public health check is not proof of login, processing,
private RSS/media continuity, or provider revocation.

**Do not activate vault mode yet.** The initial version-preserving secret-delivery
bootstrap, live consumer migration, and credential rotation remain incomplete.
Routine deployment requires that work; it does not perform it. Legacy paths
retain `assert-legacy-deploy.py` before sync/upload so they cannot overwrite
vault-managed configuration with old GitHub secret values. Do not bypass this
guard. VM unit support does not cover Azure Container Apps overflow; confirm the
live topology and migrate that separate consumer before cutover.

The launcher obtains a system-assigned managed-identity token directly from
Azure IMDS, fetches exact secret versions over HTTPS, and replaces itself with
the original service command only after all lookups succeed. Proxy environment
settings and HTTP redirects are disabled for both identity and vault requests.
Retries are bounded; denied, absent, disabled, expired, and not-yet-valid secrets
block startup with fixed diagnostic codes. Response bodies and tokens are never
logged. Known inherited application secrets are removed before the selected
service's values are injected. The existing `--manifest` form keeps its prior
non-secret inheritance; `--env-file` uses the narrower host-settings allowlist.
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

### Targeted account rotation contract

`apps/web/scripts/rotate-provisioned-accounts.ts` is an inactive administrative
operation, separate from application deployment
and demo seeding. Its supported store is the verified Azure Table primary, with
explicit account/table-prefix and user ID/email/role bindings. It must read all
targets before any write, use bcrypt cost 12, condition password updates and
session deletions on ETags, and report partial failure without restoring old
passwords. Missing tables, unsupported backends, OAuth-only accounts, or target
mismatches must fail rather than create or repair data.

Persisted impact is limited to selected users' `passwordHash`/`updatedAt` fields
and deletion of those users' browser-session rows. Merge updates preserve unknown
user fields. No schema migration, table creation, account creation, billing
change, or feed/digest/share/extension-token mutation is authorized by this tool.
Existing and new application code remain compatible with the same bcrypt and
session schema. Extension credentials and any confirmed-exposed private links
require their own narrowly scoped review; browser-session deletion is not a
claim that every authentication mechanism has been revoked.

Apply requires a verified maintenance window with all relevant credential/session
writers quiesced, including in-flight login requests, startup bootstrap, seeders,
and other active deployments/consumers. An operator flag is an attestation, not
a distributed lock. Without that barrier, an already validated old-password
request can mint a session after deletion. ETags and final empty-session checks
detect some races but cannot replace the barrier. Keep writers stopped on any
partial failure, inspect redacted status, and finish forward; never restore a
retired hash. Resume and continuity checks are part of the live rollout, which
has not occurred.

The CLI accepts `check`, or `apply --writers-quiesced`, and a bounded JSON
request on stdin. It accepts no password arguments and writes no credential
files. Replacement values must come from a pinned `ops` map via the protected
launcher, using `ADMIN_PASSWORD`, `DEMO_PASSWORD`, or `WEBSTORE_REVIEWER_PASSWORD`.
Use independently generated, unique, cryptographically random values of 32 to
72 UTF-8 bytes. Each target must include its reviewed historical password
candidates; successful comparison proves rejection of those candidates, not
completeness of an unreviewed inventory. No identifiers, hashes, session tokens,
replacement passwords, or provider response details appear in CLI output.

Schematic input only, not a production request:

```json
{
  "storageAccount": "verifiedaccount",
  "tablePrefix": "articlepod",
  "targets": [{
    "userId": "verified-user-id",
    "email": "verified-user@example.invalid",
    "role": "ADMIN",
    "replacementSecret": "ADMIN_PASSWORD",
    "retiredPasswords": ["supply reviewed candidates privately through stdin"]
  }]
}
```

Run the reviewed standalone operation with compatible declared dependencies
under `keyvault-exec.py --env-file ... --service ops -- ...`, not by deploying
unrelated application code. The protected file must explicitly select the same
canonical table prefix, Azure Table primary, and disabled startup bootstrap.
The connection string must resolve to the approved public-cloud storage account.
Missing tables, noncanonical prefixes, SAS-only configuration, other clouds, and
non-cost-12 hashes are deliberately unsupported until separately reviewed.

`check` performs reads and bcrypt comparisons without writes. `apply` validates
all targets first, merges only the password hash/timestamp, and conditionally
deletes the selected browser sessions. Both SDK updates and deletes use exact
ETags with SDK retries disabled. A repeated operation can recognize the already
replaced password and finish session cleanup forward. A failure explicitly
reports whether mutations may have occurred. Keep the maintenance barrier in
place until final verification and the wider live continuity gates pass.

Offline checks, with no Azure login or production secrets:

```text
python -m unittest discover -s scripts/azure/tests -p test_keyvault_exec.py
python -m unittest discover -s scripts/azure/tests -p test_public_environment.py
python -m unittest discover -s scripts/azure/tests -p test_runtime_secret_routing.py
python -m unittest discover -s scripts/azure/tests -p test_vm_deployment_routing.py
python -m unittest discover -s scripts/azure/tests -p test_remote_vault_deployment.py
corepack pnpm --filter @articlepod/web exec tsx --test tests/account-rotation.test.ts
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
