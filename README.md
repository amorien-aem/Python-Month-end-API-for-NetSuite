# Python Month-end API for NetSuite

This repository contains a small Vite + Vue frontend and a set of Python scripts used for a month-end close checklist. It also includes a tiny Express API to run the Python orchestrator from the web UI.

## Setup (Python)

1. Create a virtual environment and activate it:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

2. Install Python dependencies:

```bash
pip install -r requirements.txt
```

Note: Some scripts import other packages you may need; if you see import errors, install the missing package into the venv.

## Run (development)

1. Start the Express API server (this will run the orchestrator in HEADLESS mode):

```bash
npm run server
```

2. In another terminal, start the frontend dev server:

```bash
npm run dev
```

3. Open the app (usually at http://localhost:5173). Click "Execute month end program" to trigger the server run. The frontend proxies `/api` to the Express server in dev.

## Headless / Server notes

- The Python orchestration script (`00Execute month end program00.py`) runs the child scripts with the `HEADLESS=1` environment variable so GUI code paths are skipped on servers. Each GUI script (1..8) checks `HEADLESS` and exits early with a short message.
- If you want the scripts to perform meaningful server-side work instead of exiting, we should modify each script to implement a headless workflow (e.g., generate the reports, export to CSV, or run checks). I can implement that if you tell me what the headless behavior should be for each step.
- If you cannot change the scripts but still need GUI to run on the server, consider running under Xvfb (virtual framebuffer):

```bash
sudo apt-get install xvfb
xvfb-run -s "-screen 0 1024x768x24" python3 "00Execute month end program00.py"
```

## Troubleshooting

- If the API returns a Tkinter/Tcl error about $DISPLAY, ensure HEADLESS=1 is set or use Xvfb as above.
- If a Python import is missing, activate the venv and install the required package.

## Overview

This project contains:
- A Vite + Vue frontend at `src/` that lists scripts and triggers execution.
- Multiple Python scripts (1..8) used for month-end checks.
- A small Express server in `server/index.js` that provides APIs to run the scripts, stream output, view scripts, list output files and logs.

## Setup

1. Create and activate a Python virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

2. Install Python deps:

```bash
pip install -r requirements.txt
```

3. Install Node deps and run the frontend (in another terminal):

```bash
npm install
npm run dev
```

4. Start the API server:

```bash
npm run server
```

## Key API endpoints

- `GET /api/scripts` — returns the list of available script filenames.
- `GET /view-script?name=FILENAME` — serves a highlighted HTML view of a script.
- `GET /api/script?name=FILENAME` — returns raw file contents.
- `POST /api/execute` — runs the orchestrator synchronously and returns combined output.
- `GET /api/stream-execute?files=a,b,c` — streams execution output via Server-Sent Events (SSE). Use `files` to run specific scripts sequentially.
- `GET /api/output` — lists files in `output/` (JSON).
- `GET /api/output/file?name=FILENAME` — downloads a file from `output/`.
- `GET /api/logs` — returns run history stored in `output/logs.json`.

If `API_KEY` is set in the server env, the server requires requests to include `x-api-key` header or `?api_key=` query param.

## Frontend features

- Script list with checkboxes and "Open" links to view files.
- Settings: store API key in localStorage for authenticated endpoints.
- Execute button (requires all checkboxes checked) streams execution output live and writes JSON + CSV to `output/`.
- Logs section shows run history and links to output CSV/JSON files.

## Headless outputs

When running under `HEADLESS=1` (set by the server), each script writes:
- `output/<script>.json` — a JSON summary with items.
- `output/<script>.csv` — CSV checklist (columns: item, completed).

## Security notes

- The `API_KEY` middleware is a simple guard. For production, use HTTPS and a stronger auth solution.
- `output/` contains generated files; secure or move them when deploying.

## Troubleshooting

- If you see a Tkinter error (no $DISPLAY), ensure you run via the server (it sets `HEADLESS=1`) or run under Xvfb.
- If some imports are missing, activate the venv and `pip install` the missing modules.

