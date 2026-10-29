#!/usr/bin/env bash
# Build frontend/public/geo/stations.geojson from data/station_tambon.csv.
# 1) Fill station_code for every tambon (one code per station, e.g. TH1501, or a new code like ST08 for a new station).
# 2) Every station_code must also exist in the `stations` table (backend/schema.sql seed) with the same code.
# 3) Run: bash data/build-stations.sh   (the map reads /geo/stations.geojson; station names come from the DB by code)
set -euo pipefail
cd "$(dirname "$0")/.."
npx -y mapshaper data/angthong_tambon.geojson \
  -join data/station_tambon.csv keys=code,tambon_code string-fields=tambon_code,station_code \
  -dissolve station_code \
  -rename-fields code=station_code \
  -simplify 15% keep-shapes \
  -o frontend/public/geo/stations.geojson precision=0.00001
