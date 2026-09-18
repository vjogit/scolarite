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

.PHONY: all publier-images kit-deploiement

# ── Publication ───────────────────────────────────────────────────────────────
# Les images applicatives sont neutres vis-à-vis de l'environnement (ni
# certificat, ni URL, ni configuration dedans) : une seule publication sert la
# prod comme une répétition sur le poste. Sans IMAGES_REGISTRE, les images
# restent locales (répétition : `make start-local-keep IMAGES_MODE=pull
# IMAGES_TAG=<étiquette>`) ; avec, elles sont poussées :
#   make publier-images IMAGES_REGISTRE=ghcr.io/compte/     (docker login avant)
# L'étiquette est `git describe`, sauf IMAGES_TAG donné sur la ligne de
# commande (le IMAGES_TAG des fichiers d'environnement inclus plus haut, lui,
# ne concerne que le déploiement). Un arbre modifié est refusé — l'image
# publiée doit correspondre à un commit, c'est lui que la CI a exercé.
ifeq ($(origin IMAGES_TAG),command line)
ETIQUETTE := $(IMAGES_TAG)
else
ETIQUETTE := $(shell git describe --tags --always --dirty)
endif

publier-images:
	@case "$(ETIQUETTE)" in *-dirty) echo "❌ Arbre de travail modifié : committer avant de publier ($(ETIQUETTE))" >&2; exit 1;; esac
	IMAGES_TAG=$(ETIQUETTE) IMAGES_REGISTRE=$(IMAGES_REGISTRE) infra/run/build-scolarite.sh $(if $(IMAGES_REGISTRE),--push,)

# ── Kit de déploiement ────────────────────────────────────────────────────────
# Ce dont un hôte de prod a besoin en plus des images et de Docker : les
# makefiles, infra/ (compose, scripts, Liquibase, Terraform, thème Keycloak,
# topologies) et le gabarit config.yaml du backend, que start-scolarite.sh
# rend. Ni secrets (à déposer sur l'hôte), ni sources. Extrait de git à
# l'étiquette des images, jamais de l'arbre de travail.
kit-deploiement:
	@case "$(ETIQUETTE)" in *-dirty) echo "❌ Arbre de travail modifié : committer avant de produire le kit ($(ETIQUETTE))" >&2; exit 1;; esac
	git archive --format=tar.gz --prefix=scolarite-$(ETIQUETTE)/ -o scolarite-kit-$(ETIQUETTE).tar.gz $(ETIQUETTE) \
		makefile makefile.local makefile.prod infra back/cmd/serveur/config.yaml
	@echo "--- ✅ scolarite-kit-$(ETIQUETTE).tar.gz ---"

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
	@echo "  make importer-syllabus   — import du syllabus tiers ; simulation sans SYLLABUS_IMPORT_ARGS=\"--apply\" (docs/syllabus-import.md)"
	@echo "  make traduire-syllabus   — traduction du syllabus d'une promotion ; SYLLABUS_TRANSLATE_ARGS=\"--promotion <id> [--provider rack] [--apply]\" (docs/syllabus-traduction.md)"
	@echo ""
	@echo "Espace de travail prod :"
	@echo "  make start-prod-reset    — déploiement prod, RÉINITIALISE LA BASE (confirmation demandée)"
	@echo "  make start-prod-keep     — déploiement prod, garde la base de données"
	@echo "  make restart-prod-reset  — arrêt puis start-prod-reset (confirmation demandée)"
	@echo "  make restart-prod-keep   — arrêt puis start-prod-keep"
	@echo "  make stop-prod           — arrêt de la pile prod"
	@echo "  make clean-prod          — arrêt et suppression des conteneurs prod"
	@echo ""
	@echo "Publication et déploiement (voir docs/deployements.md, « Images ») :"
	@echo "  make publier-images      — construit backend + nginx à l'étiquette git ; pousse si IMAGES_REGISTRE=…"
	@echo "  make kit-deploiement     — archive de ce qu'un hôte de prod exécute (makefiles, infra/, gabarit config.yaml)"
	@echo "  make start-local-keep IMAGES_MODE=pull IMAGES_TAG=… — répète un déploiement depuis les images publiées"
	@echo ""
	@echo "Suite Playwright (front/e2e), dans le conteneur de référence — stack locale déjà lancée :"
	@echo "  make test-ihm            — la suite entière, captures comprises (PLAYWRIGHT_ARGS=… pour la restreindre)"
	@echo "  make test-integration    — tests Go d'intégration contre la stack locale, base scolarite_tu recréée depuis schema.sql"
	@echo "  make captures-reference  — régénère les 20 captures de référence, contre une base réduite au seed"
	@echo ""
	@echo "Configuration : $(CONFIG_FILE_LOCAL) / $(CONFIG_FILE_PROD) (versionnés)"
	@echo "Secrets       : $(SECRETS_FILE_LOCAL) / $(SECRETS_FILE_PROD)"
	@echo "                (exclus de git — partir de $(ENV_DIR)/secrets.env.example)"
	@echo ""
