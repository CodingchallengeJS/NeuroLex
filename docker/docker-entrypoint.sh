#!/bin/sh
# Brings the database up to date, then hands off to the container command.
#
#   RUN_MIGRATIONS=false  skip schema migrations on boot
#   RUN_SEED=false        skip vocabulary seeding on boot
#   FORCE_SEED=true       re-run the importers even if notebooks already exist
#
# Both steps are no-ops once the database is populated, so a restart is cheap.
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "==> Applying database migrations"
  node migrate.js
fi

if [ "${RUN_SEED:-true}" = "true" ]; then
  echo "==> Seeding vocabulary"
  node seed.js
fi

echo "==> Starting application"
exec "$@"
