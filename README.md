# Project 3 — Web Log Analyzer

An independent browser-based log analyzer. Projects 1 (Python CLI analyzer) and 2 (interactive simulator) remain separate.

## Start it from VS Code

1. Open the bundle folder in VS Code:
   `C:\Users\Rahul\Documents\Codex\2026-10-14\referenced-chatgpt-conversation-this-an`
2. Choose **Terminal → New Terminal**.
3. Paste this command and press Enter:

   ```powershell
   py -m http.server 8000 --directory project_3_web_log_analyzer
   ```

4. Open this address in your browser: <http://localhost:8000>
5. Choose a sample type and click **Load sample**, or drop/select your own `.json` or `.jsonl` file.
6. Use the search box and severity/event filters. Click the plus sign in a row to inspect all its fields. Click **Download JSON report** to save the current analysis.
7. To stop the local server, click the VS Code terminal and press **Ctrl+C**.

The browser app uses local files and JavaScript; uploaded logs are analyzed on your device and are not sent to a service.

## Included examples

The `samples/` folder contains four ready-to-load files:

- `health_check.json` — a single JSON object
- `batch_jobs.json` — a JSON array of records
- `api_gateway.jsonl` — JSONL with a malformed line and repeated errors
- `error_burst.jsonl` — repeated database errors for checking error grouping
