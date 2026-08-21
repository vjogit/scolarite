.DEFAULT_GOAL := all

# ── Espaces de travail ────────────────────────────────────────────────────────
# Deux environnements cloisonnés : « local » (tests sur poste de développement)
# et « prod ». Chacun a ses fichiers d'environnement (infra/env), son espace de
# travail Terraform et son fragment de makefile.
#
# Deux fichiers par environnement, sur un critère unique : la topologie
# (versionnée, aucun secret) et les secrets (jamais versionnés). La règle de
# partage et la liste des secrets attendus sont dans infra/env/README.md et
# infra/env/secrets.env.example.
ENV_DIR=infra/env
CONFIG_FILE_LOCAL=$(ENV_DIR)/config-local.env
CONFIG_FILE_PROD=$(ENV_DIR)/config-prod.env
SECRETS_FILE_LOCAL=$(ENV_DIR)/secrets-local.env
SECRETS_FILE_PROD=$(ENV_DIR)/secrets-prod.env

# Un seul fragment est inclus à la fois. makefile.local et makefile.prod font
# tous deux « include » de leurs fichiers d'environnement puis « export » : les
# charger ensemble laisserait le dernier inclus écraser les variables
# homonymes de l'autre, et un « make start-local-reset » partirait avec les
# identifiants de production. Le fragment est donc choisi sur la cible
# demandée — toute cible prod porte « prod » dans son nom, et aucune cible
# locale ne le porte.
ifneq ($(findstring prod,$(MAKECMDGOALS)),)
include makefile.prod
else
include makefile.local
endif

.PHONY: all

all:
	@echo ""
	@echo "Développement sur poste (backend au debugger, front par npm run dev) :"
	@echo "  make start-dev           — infra seule, garde la base de données"
	@echo "  make start-dev-reset     — infra seule, réinitialise la base de données"
	@echo ""
	@echo "Espace de travail local (tests) :"
	@echo "  make start-local-reset   — déploiement local, réinitialise la base de données"
	@echo "  make start-local-keep    — déploiement local, garde la base de données"
	@echo "  make restart-local-reset — arrêt puis start-local-reset"
	@echo "  make restart-local-keep  — arrêt puis start-local-keep"
	@echo "  make stop-local          — arrêt de la pile locale"
	@echo "  make clean-local         — arrêt et suppression des conteneurs locaux"
	@echo ""
	@echo "Espace de travail prod :"
	@echo "  make start-prod-reset    — déploiement prod, RÉINITIALISE LA BASE (confirmation demandée)"
	@echo "  make start-prod-keep     — déploiement prod, garde la base de données"
	@echo "  make restart-prod-reset  — arrêt puis start-prod-reset (confirmation demandée)"
	@echo "  make restart-prod-keep   — arrêt puis start-prod-keep"
	@echo "  make stop-prod           — arrêt de la pile prod"
	@echo "  make clean-prod          — arrêt et suppression des conteneurs prod"
	@echo ""
	@echo ""
	@echo "Configuration : $(CONFIG_FILE_LOCAL) / $(CONFIG_FILE_PROD) (versionnés)"
	@echo "Secrets       : $(SECRETS_FILE_LOCAL) / $(SECRETS_FILE_PROD)"
	@echo "                (exclus de git — partir de $(ENV_DIR)/secrets.env.example)"
	@echo ""
