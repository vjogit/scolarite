# Conteneur de référence de la suite Playwright (front/e2e).
#
# C'est le SEUL environnement où les captures de référence
# (captures.spec.ts-snapshots/, captures-ouvertes.spec.ts-snapshots/) se
# génèrent et se comparent — sur le poste comme en CI (arbitrage du
# 4 septembre 2026, docs/ci.md §10). L'image officielle Playwright, à la
# version exacte de @playwright/test du lockfile et ÉPINGLÉE PAR EMPREINTE :
# un tag peut être republié, une empreinte non. Ubuntu 24.04 (noble), comme
# l'exécuteur GitHub ubuntu-24.04 — mêmes polices, même Chromium, même
# antialiasing, où que la suite tourne.
#
# Monter la version : changer la ligne FROM ET la version de @playwright/test
# ensemble (le navigateur embarqué doit être celui que le paquet attend), puis
# régénérer les 20 captures dans le nouveau conteneur (make captures-reference)
# et REGARDER chaque image.
FROM mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e

# Client Docker statique : globalSetup.ts pose le seed par `docker exec psql`
# dans le conteneur PostgreSQL (setup/seed.sh, même idiome que reset-db.sh),
# à travers le socket que playwright.sh monte. Le binaire seul, sans démon ;
# version et empreinte épinglées, archive vérifiée avant extraction.
ARG DOCKER_CLI_VERSION=29.8.0
ARG DOCKER_CLI_SHA256=cc21815cf1e2efed867dc9c8b96b46ffed8ea176ffab32b0aacb54726ded8f25
RUN curl -fsSL "https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_CLI_VERSION}.tgz" -o /tmp/docker.tgz \
 && echo "${DOCKER_CLI_SHA256}  /tmp/docker.tgz" | sha256sum -c - \
 && tar -xzf /tmp/docker.tgz -C /tmp docker/docker \
 && install -m 0755 /tmp/docker/docker /usr/local/bin/docker \
 && rm -rf /tmp/docker /tmp/docker.tgz \
 && docker --version

# `zip` : import-erreurs.spec.ts construit sa fiche .xlsx fautive avec le zip
# système (aide/ficheFautive.ts — aucune dépendance npm), présent sur un poste,
# absent de l'image officielle (mesuré : « spawnSync zip ENOENT », 1 échec sur
# 43 fonctionnels au premier passage dans le conteneur).
RUN apt-get update -qq \
 && apt-get install -y -qq --no-install-recommends zip \
 && rm -rf /var/lib/apt/lists/*

# Marqueur lu par e2e/aide/conteneur.ts : hors de cette image, les deux specs
# de captures se SAUTENT (motif affiché) au lieu de comparer — ou, pire, de
# régénérer — un rendu qui n'est pas celui de référence. Posé par l'image,
# jamais par l'appelant : personne ne l'obtient par accident sur un poste.
ENV PLAYWRIGHT_CONTENEUR_REFERENCE=1
