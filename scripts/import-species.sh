#!/usr/bin/env bash
set -euo pipefail

# Import species.csv into MongoDB and prepare fields for autocomplete
# Usage: scripts/import-species.sh [path-to-csv]

CSV_PATH=${1:-species.csv}
CONTAINER=${MONGO_CONTAINER:-molt-log-mongo}
DB_NAME=${DB_NAME:-molt-log}
MONGO_PORT=${MONGO_PORT:-13777}

if [ ! -f "$CSV_PATH" ]; then
  echo "CSV file not found: $CSV_PATH" >&2
  exit 1
fi

echo "Copying CSV into container $CONTAINER..."
docker cp "$CSV_PATH" "$CONTAINER:/tmp/species.csv"

echo "Dropping existing collection (if any)..."
docker exec "$CONTAINER" bash -lc "mongosh --port $MONGO_PORT --quiet $DB_NAME --eval 'db.species.drop()'" || true

echo "Importing CSV into MongoDB..."
docker exec "$CONTAINER" bash -lc "mongoimport --port $MONGO_PORT --db $DB_NAME --collection species --type csv --headerline --file /tmp/species.csv"

echo "Deriving fields and creating indexes..."
docker cp scripts/species_post_import.js "$CONTAINER:/tmp/species_post_import.js"
docker exec "$CONTAINER" bash -lc "mongosh --port $MONGO_PORT --quiet $DB_NAME --file /tmp/species_post_import.js"

echo "Done. Sample count:"
docker exec "$CONTAINER" bash -lc "mongosh --port $MONGO_PORT --quiet $DB_NAME --eval 'db.species.countDocuments()'"
