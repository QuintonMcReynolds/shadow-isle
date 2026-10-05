PY ?= .venv/bin/python
DBT = cd analytics/dbt && ../../.venv/bin/dbt

.PHONY: dev bots load load-live models readout readout-live dashboard dashboard-live test lint package

dev:           ## play locally with telemetry going to data/raw/events.jsonl
	$(PY) tools/collector.py

bots:          ## 300 simulated players through the real game code (headless Chrome)
	cd tools && ../$(PY) run_bots.py 300

load:          ## local files -> DuckDB raw.events
	$(PY) analytics/load.py

load-live:     ## + real players from Supabase (needs SUPABASE_URL, SUPABASE_SERVICE_KEY)
	$(PY) analytics/load.py --supabase

models:        ## dbt: staging + marts + data tests
	$(DBT) build --profiles-dir .

readout:       ## experiment readout on bots (dry run)
	$(PY) analytics/experiment.py --bots

readout-live:  ## experiment readout on real players
	$(PY) analytics/experiment.py

dashboard:
	$(PY) analytics/dashboard.py --bots

dashboard-live:
	$(PY) analytics/dashboard.py

test:          ## Python stats tests + game tests in headless Chrome
	$(PY) -m pytest -q tests
	cd tools && ../$(PY) run_js_tests.py

lint:
	$(PY) -m ruff check analytics tools tests

package:       ## itch.io upload zip
	$(PY) tools/package.py

dry-run: bots load models readout dashboard
live: load-live models readout-live dashboard-live
