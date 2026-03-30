# TEST_RUN — ciclo corrente

> Questo file traccia solo l'ultimo run di test completato.
> Viene sovrascritto ad ogni nuovo ciclo. La storia permanente è in `CHANGELOG.md`.

**Timestamp:** 2026-03-30
**Commit/SHA:** pending (fix autostart backend NAS post-reboot)
**Agente:** Codex

## Gate eseguiti

- Verifica reboot NAS (`uptime -s`) e processi autostart.
- Health check backend locale: `curl http://127.0.0.1:8001/openapi.json`.
- Health check reverse proxy API: `curl http://192.168.178.34:8081/openapi.json`.
- Health check frontend: `curl http://192.168.178.34:8080/`.

## Esito

- [x] PASS
- [ ] FAIL

## Risultati

- Prima del fix: frontend `200`, backend `502` dopo reboot.
- Dopo il fix su `start-nas.sh`: backend locale `200`, reverse proxy API `200`, frontend `200`.

## Note

- Nessun test `pytest` eseguito in questo ciclo: modifica limitata allo script di avvio NAS e validata con smoke test runtime su NAS.
