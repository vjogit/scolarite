#!/bin/sh
set -e

exec dlv exec /usr/local/bin/scolarite-server \
    --listen=:2345 --headless --api-version=2 --accept-multiclient --continue \
    -- /opt/scolarite/conf/config.yaml
