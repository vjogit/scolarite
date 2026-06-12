.DEFAULT_GOAL := all

# --- Variables communes ---
SECRETS_FILE_LOCAL=.vscode/secrets-local.env
SECRETS_FILE_PROD=.vscode/secrets-prod.env


include makefile.local

.PHONY: all clean

all:
	@echo ""
	@echo "Usage : make start-local-reset — déploiement local, reinitialise la base de données"
	@echo "        make start-local-keep  — déploiement local, garde la base de données"
	@echo ""

# ── Nettoyage ─────────────────────────────────────────────────────────────────

clean:
#-v pour tous supprimer.
	cd $(DOCKER_DIR) && docker compose --env-file ../../$(SECRETS_FILE_LOCAL) down
