# ops/ — Script di deploy NAS

Cartella dedicata agli script operativi per il deploy su Synology NAS (DS220j, DSM 7.3).

## Layout

```
ops/
├── deploy-nas.sh   # Eseguito SUL NAS via SSH. Pull repo, rsync backend, restart uvicorn.
├── build-web.sh    # Eseguito IN SANDBOX. Build Expo web + rsync a NAS.
└── README.md       # Questo file.
```

## Prerequisiti

### Sul NAS

- Git Server (pacchetto Synology) installato → `git` in `/usr/bin/git`
- Python 3.9 installato → `/usr/local/bin/python3.9`
- Deploy key SSH generata in `~/.ssh/id_ed25519_github_deploy` (read-only su repo GitHub)
- Repo clonato in `/volume1/homes/Marco Zambara/timbrature-repo/`
- Runtime path `/volume1/homes/Marco Zambara/timbrature/` con `.env` + `bustapaga.db*` preservati
- Backend autostart wired via DSM Task Scheduler (chiama `start-nas.sh` al boot)

### In sandbox

- Tailscale userspace + `ts-ensure` wrapper in `~/.local/bin/ts-ensure`
- SSH config con Host `nas` → 100.84.35.30, ProxyCommand via `tailscale nc`, key `id_ed25519_claude`
- Node 20+ e `npm`/`npx` per build Expo web

## Workflow deploy

### Backend-only (più comune — modifiche server.py / server_nas.py / parser)

In sandbox:

```bash
# 1. commit + push
git add . && git commit -m "fix(nas): ..." && git push

# 2. deploy su NAS
~/.local/bin/ts-ensure ssh "Marco Zambara@nas" \
  "/volume1/homes/Marco Zambara/timbrature-repo/ops/deploy-nas.sh"
```

Output atteso: `[deploy-nas] ... deploy OK (HEAD=<sha>)`.

### Frontend (modifiche in frontend/app, frontend/src)

In sandbox:

```bash
./ops/build-web.sh
```

Questo script builda localmente con Expo e rsynca il risultato a `NAS:timbrature/frontend-web/`. Non tocca il backend.

### Entrambi

```bash
git push && \
~/.local/bin/ts-ensure ssh "Marco Zambara@nas" "/volume1/homes/Marco Zambara/timbrature-repo/ops/deploy-nas.sh" && \
./ops/build-web.sh
```

## Rollback

Se il deploy backend fallisce health check (`exit 2`), rollback manuale:

```bash
~/.local/bin/ts-ensure ssh "Marco Zambara@nas" "
  cd '/volume1/homes/Marco Zambara/timbrature-repo' && \
  git reset --hard <SHA_PRECEDENTE> && \
  ./ops/deploy-nas.sh
"
```

Lo storico SHA è in `git log` del repo GitHub.

## Note

- `.env` e `bustapaga.db*` sono esclusi dal rsync backend → stato runtime preservato across deploy.
- `__pycache__` escluso per evitare trascinamento di bytecode stale.
- `start-nas.sh` è idempotente: se healthy skip, altrimenti relancio. Noi killiamo uvicorn prima di chiamarlo per forzare pickup del nuovo codice.
- Frontend `http.server` non richiede restart: serve i file direttamente dal filesystem.
