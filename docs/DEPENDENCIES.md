# Dependencies - file-upload-service

Stores uploaded files (local volume, Cloudflare R2, Azure, S3 or GCS). Host port 4005 (container 3000).

This file is self-contained: it says what must be running (or configured) before this service works, gives the commands to start those dependencies, and lists who depends on it. `<infra>` below is `easydev-infra` (in this workspace: `C:\Users\kisho\WorkSpace\docker network\easydev-infra`). The full platform map lives in `learning/ai/langchain-knoledgebase-rag/docs/` (`SERVICE_DEPENDENCIES.md`, `OTHER_SERVICES_DEPENDENCIES.md`, `LOCAL_SETUP.md`, `ENVIRONMENT.md`).

**Legend:** **RUN** = must be up (compose `depends_on` or hard runtime). **CONFIG** = its address/secret must be set for this service to boot, but it need not be running. **FEATURE** = only one feature breaks when it is down. Nothing in this file was re-run when it was written; it is derived from the compose files, env examples and config code.

## 1. What this service depends on

| Dependency | Kind | Why |
|---|---|---|
| MongoDB (`MONGO_URI`) | RUN | Validated at boot. Note the name is `MONGO_URI`, not `MONGODB_URI`. |
| Storage backend | RUN | `STORAGE_TYPE=local` (volume) or R2/Azure/S3/GCS with credentials. |
| Redis (`REDIS_URL`) | OPTIONAL | Only for distributed rate limiting. |
| Any other EasyDev service | NONE | No runtime calls to IAM or the gateway; callers present a signed `X-Gateway-Hmac`. |

**Minimum to run it:** MongoDB + storage + the service itself. It needs no other EasyDev service.

## 2. Bring the dependencies up

Create the shared Docker networks once (safe to repeat):

```bash
for n in core-network product-network ai-platform-network utility-network; do
  docker network inspect $n >/dev/null 2>&1 || docker network create $n
done
```

Start in this order (Git Bash; Docker Desktop must be running). Steps marked **(optional)** are only needed for the features noted as FEATURE/CONFIG in section 1; skip them if you do not use those features.

1. **MongoDB (external - no compose file starts it)**

   ```bash
   # Use your existing MongoDB / Atlas, or a throwaway local one:
   docker run -d --name mongo --restart unless-stopped -p 27017:27017 -v mongo-data:/data/db mongo:7
   # URI for containers: mongodb://host.docker.internal:27017/easydev
   ```

2. **This service (Backend/file-upload-service)** - if it is part of one of the stacks above it is already started by that step. To run it from source while developing, keep the dependencies above up and follow this repo's README. Whole-stack shortcut from the infra repo: `bash <infra>/scripts/deploy-local.sh --stack <core|product|ai-platform|support-ai|utility>` (builds from local source, creates the networks, waits for health; `--stack` assumes the stacks it depends on are already running). Build one image at a time on a low-memory machine.

## 3. Settings that tie it to its dependencies

- MONGO_URI
- GATEWAY_INTERNAL_SECRET (32+ chars; also accepted as FILE_UPLOAD_HMAC_SECRET)
- LOCAL_SIGNED_URL_SECRET (32+ chars, when local)
- STORAGE_TYPE and the chosen backend's variables
- ALLOWED_MIME_TYPES / ALLOWED_FILE_EXTENSIONS

Full variable documentation for the RAG-related services: `ENVIRONMENT.md` in the RAG repo. Never commit real values; only `*.example` files are tracked.

## 4. Who depends on this service

- RAG API and worker (documents)
- IAM (avatars)
- gateway, payment, lead, communication, job-agent, support-ai

If you stop it, those consumers lose the feature described above.

## 5. Check it is up

```bash
curl -s -o /dev/null -w "file-upload -> %{http_code}\n" http://localhost:4005/health/live
```
