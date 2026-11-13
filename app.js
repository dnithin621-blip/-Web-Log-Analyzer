"use strict";

const sampleLogs = {
  jsonl: { name: "api_gateway.jsonl", text: `{"timestamp":"2026-10-14T09:00:00Z","level":"INFO","event":"server_started","message":"API listening","port":8080}
{"timestamp":"2026-10-14T09:00:02Z","severity":"WARNING","event":"slow_request","message":"Request took 2.4s","path":"/reports"}
{"timestamp":"2026-10-14T09:00:03Z","level":"ERROR","event":"database_timeout","message":"connection timed out","request_id":"a1"}
not-json-at-all
{"timestamp":"2026-10-14T09:00:05Z","level":"ERROR","event":"database_timeout","message":"connection timed out","request_id":"a2"}
{"timestamp":"2026-10-14T09:00:06Z","level":"INFO","event":"request_complete","message":"Request completed","status":200}` },
  object: { name: "health_check.json", text: `{"timestamp":"2026-10-14T10:15:00Z","level":"INFO","event":"health_check","message":"All services operational","service":"inventory-api","uptime_seconds":86400,"checks":{"database":"healthy","cache":"healthy"}}` },
  array: { name: "batch_jobs.json", text: `[
  {"timestamp":"2026-10-14T11:00:00Z","level":"INFO","event":"job_started","message":"Nightly export started","job_id":"export-42"},
  {"timestamp":"2026-10-14T11:01:15Z","level":"WARNING","event":"job_slow","message":"Export is taking longer than expected","job_id":"export-42","elapsed_seconds":75},
  {"timestamp":"2026-10-14T11:02:10Z","level":"ERROR","event":"job_retry","message":"Storage temporarily unavailable","job_id":"export-42","attempt":1},
  {"timestamp":"2026-10-14T11:03:00Z","level":"INFO","event":"job_complete","message":"Nightly export completed","job_id":"export-42","rows":1842}
]` },
  errors: { name: "error_burst.jsonl", text: `{"timestamp":"2026-10-14T12:20:00Z","level":"ERROR","event":"database_timeout","message":"connection timed out","request_id":"err-01"}
{"timestamp":"2026-10-14T12:20:04Z","level":"ERROR","event":"database_timeout","message":"connection timed out","request_id":"err-02"}
{"timestamp":"2026-10-14T12:20:09Z","level":"CRITICAL","event":"database_timeout","message":"connection timed out","request_id":"err-03"}
{"timestamp":"2026-10-14T12:20:12Z","level":"WARNING","event":"retry_limit_near","message":"Database retry limit nearly reached","request_id":"err-04"}` },
};

const state = { records: [], issues: [], fileName: "", filtered: [] };
const $ = (id) => document.getElementById(id);
const severityKeys = ["severity", "level", "log_level", "loglevel"];
const eventKeys = ["event", "event_name", "type", "name"];
const messageKeys = ["message", "msg", "error", "detail", "description"];
const errorLevels = new Set(["error", "err", "fatal", "critical", "crit", "alert", "emergency"]);

function firstValue(record, keys) {
  const entries = Object.fromEntries(Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]));
  for (const key of keys) if (entries[key] !== undefined && entries[key] !== null && entries[key] !== "") return entries[key];
  return undefined;
}
function severityOf(record) { return String(firstValue(record, severityKeys) ?? "UNKNOWN").trim().toUpperCase(); }
function eventOf(record) { return String(firstValue(record, eventKeys) ?? "(unspecified)").trim(); }
function messageOf(record) {
  const value = firstValue(record, messageKeys);
  if (value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
function addRecordOrIssue(item, line, issues, records, arrayEntry = false) {
  if (item && typeof item === "object" && !Array.isArray(item)) records.push(item);
  else issues.push({ line, error: arrayEntry ? "JSON array item is not an object" : "JSONL entry is not an object" });
}
function parseLogText(text) {
  const records = [], issues = [];
  if (!text.trim()) return { records, issues };
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) records.push(parsed);
    else if (Array.isArray(parsed)) parsed.forEach((item, index) => addRecordOrIssue(item, index + 1, issues, records, true));
    else issues.push({ line: 1, error: "JSON document is not an object or array" });
    return { records, issues };
  } catch (_) {
    // Fall back to line-by-line JSONL so good lines survive malformed ones.
  }
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    try { addRecordOrIssue(JSON.parse(line), index + 1, issues, records); }
    catch (error) { issues.push({ line: index + 1, error: `malformed JSON: ${error.message.split(" at position")[0]}` }); }
  });
  return { records, issues };
}
function safeText(value) { return String(value ?? ""); }
function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = safeText(text);
  return element;
}
function addBreakdown(container, entries, emptyText) {
  container.replaceChildren();
  if (!entries.length) { container.append(makeElement("div", "break-empty", emptyText)); return; }
  const max = Math.max(...entries.map(([, count]) => count), 1);
  entries.forEach(([label, count]) => {
    const row = makeElement("div", "break-row");
    row.append(makeElement("span", "break-label", label));
    const track = makeElement("span", "bar-track");
    const fill = makeElement("span", "bar-fill");
    fill.style.width = `${Math.max(count / max * 100, 2)}%`;
    track.append(fill);
    row.append(track, makeElement("span", "break-count", count));
    container.append(row);
  });
}
function buildSummary(records, issues, minRepeats = 2) {
  const severities = new Map(), events = new Map(), errors = new Map();
  records.forEach((record) => {
    const severity = severityOf(record), event = eventOf(record);
    severities.set(severity, (severities.get(severity) || 0) + 1);
    events.set(event, (events.get(event) || 0) + 1);
    if (errorLevels.has(severity.toLowerCase())) {
      const message = (messageOf(record).trim() || event).replace(/\s+/g, " ");
      errors.set(message, (errors.get(message) || 0) + 1);
    }
  });
  const repeated = [...errors].filter(([, count]) => count >= minRepeats)
    .sort((a, b) => b[1] - a[1]).map(([message, count]) => ({ message, count }));
  return {
    total_records: records.length,
    malformed_count: issues.length,
    severity_counts: Object.fromEntries([...severities].sort(([a], [b]) => a.localeCompare(b))),
    event_counts: Object.fromEntries([...events].sort((a, b) => b[1] - a[1])),
    repeated_errors: repeated,
    issues,
  };
}
function getFilteredRecords() {
  const severity = $("severity-filter").value;
  const event = $("event-filter").value.trim().toLocaleLowerCase();
  const query = $("search-input").value.trim().toLocaleLowerCase();
  return state.records.filter((record) => {
    if (severity && severityOf(record) !== severity) return false;
    if (event && !eventOf(record).toLocaleLowerCase().includes(event)) return false;
    if (query && !JSON.stringify(record).toLocaleLowerCase().includes(query)) return false;
    return true;
  });
}
function renderRecords(records) {
  const body = $("records-body");
  body.replaceChildren();
  records.slice(0, 500).forEach((record, index) => {
    const row = document.createElement("tr");
    const level = severityOf(record), badge = makeElement("span", `severity-badge ${level.toLowerCase()}`, level);
    const severityCell = document.createElement("td"); severityCell.append(badge); row.append(severityCell);
    row.append(makeElement("td", "event-cell", eventOf(record)));
    row.append(makeElement("td", "message-cell", messageOf(record) || "—"));
    row.append(makeElement("td", "time-cell", firstValue(record, ["timestamp", "time", "@timestamp", "datetime"]) ?? "—"));
    const detailCell = document.createElement("td"), button = makeElement("button", "details-button", "＋");
    button.type = "button"; button.setAttribute("aria-label", "Show full record");
    button.addEventListener("click", () => {
      const next = row.nextElementSibling;
      if (next?.classList.contains("details-row")) { next.remove(); button.textContent = "＋"; return; }
      const detailRow = makeElement("tr", "details-row"), cell = document.createElement("td");
      cell.colSpan = 5;
      const pre = makeElement("pre", "details-json", JSON.stringify(record, null, 2));
      cell.append(pre); detailRow.append(cell); row.after(detailRow); button.textContent = "−";
    });
    detailCell.append(button); row.append(detailCell); body.append(row);
  });
  $("empty-state").hidden = records.length > 0;
  $("records-count").textContent = `${records.length.toLocaleString()} record${records.length === 1 ? "" : "s"}${records.length > 500 ? " · first 500 shown" : ""}`;
}
function renderIssues(issues) {
  const panel = $("issues-panel"), list = $("issues-list");
  list.replaceChildren();
  panel.hidden = issues.length === 0;
  $("issue-count").textContent = `${issues.length} entr${issues.length === 1 ? "y" : "ies"}`;
  issues.forEach((issue) => {
    const row = makeElement("div", "issue-row"), line = makeElement("span", "issue-line", `Line ${issue.line}`);
    row.append(line, document.createTextNode(issue.error)); list.append(row);
  });
}
function render() {
  if (!state.fileName) return;
  const records = getFilteredRecords(); state.filtered = records;
  const summary = buildSummary(records, state.issues);
  $("dashboard").hidden = false;
  $("stat-records").textContent = records.length.toLocaleString();
  $("stat-records-note").textContent = `of ${state.records.length.toLocaleString()} total records`;
  $("stat-errors").textContent = records.filter((record) => errorLevels.has(severityOf(record).toLowerCase())).length.toLocaleString();
  $("stat-repeated").textContent = summary.repeated_errors.length.toLocaleString();
  $("stat-malformed").textContent = state.issues.length.toLocaleString();
  const severities = Object.entries(summary.severity_counts);
  addBreakdown($("severity-breakdown"), severities, "No matching records.");
  const events = Object.entries(summary.event_counts).slice(0, 6);
  addBreakdown($("event-breakdown"), events, "No matching records.");
  const repeatList = $("repeated-list"); repeatList.replaceChildren();
  $("repeat-count").textContent = `${summary.repeated_errors.length} group${summary.repeated_errors.length === 1 ? "" : "s"}`;
  if (!summary.repeated_errors.length) repeatList.append(makeElement("div", "repeat-empty", "No repeated errors in the matching records."));
  summary.repeated_errors.forEach((item) => {
    const row = makeElement("div", "repeat-item");
    row.append(makeElement("span", "repeat-pill", `${item.count}×`), makeElement("span", "repeat-message", item.message));
    repeatList.append(row);
  });
  renderRecords(records); renderIssues(state.issues);
}
function setLogText(text, name) {
  const result = parseLogText(text);
  state.records = result.records; state.issues = result.issues; state.fileName = name;
  $("file-status").textContent = `${name} · ${state.records.length.toLocaleString()} records`;
  $("file-status").classList.add("loaded");
  const select = $("severity-filter");
  select.replaceChildren(new Option("All severities", ""));
  [...new Set(state.records.map(severityOf))].sort().forEach((level) => select.add(new Option(level, level)));
  $("search-input").value = ""; $("event-filter").value = ""; select.value = "";
  render();
}
function downloadReport() {
  const summary = buildSummary(state.filtered, state.issues);
  summary.file = state.fileName;
  summary.filters = { severity: $("severity-filter").value, event: $("event-filter").value, search: $("search-input").value };
  summary.records = state.filtered;
  const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob);
  link.download = `${state.fileName.replace(/\.[^.]+$/, "") || "log"}-report.json`;
  link.click(); URL.revokeObjectURL(link.href);
}
async function loadFile(file) {
  if (!file) return;
  try { setLogText(await file.text(), file.name); }
  catch (error) { $("file-status").textContent = `Could not read file: ${error.message}`; $("file-status").classList.remove("loaded"); }
}

$("choose-file").addEventListener("click", () => $("file-input").click());
$("drop-zone").addEventListener("click", (event) => { if (!event.target.closest("button")) $("file-input").click(); });
$("drop-zone").addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); $("file-input").click(); } });
$("file-input").addEventListener("change", (event) => loadFile(event.target.files[0]));
$("load-sample").addEventListener("click", () => { const sample = sampleLogs[$("sample-select").value]; setLogText(sample.text, sample.name); });
["search-input", "event-filter"].forEach((id) => $(id).addEventListener("input", render));
$("severity-filter").addEventListener("change", render);
$("clear-filters").addEventListener("click", () => { $("search-input").value = ""; $("event-filter").value = ""; $("severity-filter").value = ""; render(); });
$("download-report").addEventListener("click", downloadReport);
const dropZone = $("drop-zone");
for (const eventName of ["dragenter", "dragover"]) dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.add("dragging"); });
for (const eventName of ["dragleave", "drop"]) dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.remove("dragging"); });
dropZone.addEventListener("drop", (event) => loadFile(event.dataTransfer.files[0]));
