const $ = (id) => document.getElementById(id);
const input = $("input"), run = $("run");

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c])); }
function renderState(data) {
  $("noteCount").textContent = data.notes.length;
  $("notes").innerHTML = data.notes.length ? data.notes.map(n => `<div class="note"><span>${escapeHtml(n.text)}</span><small>${new Date(n.createdAt).toLocaleString()}</small></div>`).join("") : `<div class="muted-copy">No notes yet.</div>`;
  $("audit").innerHTML = data.audit.length ? data.audit.slice(0, 8).map(a => `<div class="audit-row"><span class="audit-icon ${a.status}">${a.status === "completed" ? "✓" : "!"}</span><div><strong>${escapeHtml(a.input)}</strong><small>${a.mode} · ${new Date(a.timestamp).toLocaleTimeString()}</small></div></div>`).join("") : `<div class="muted-copy">Actions will be logged here.</div>`;
}
function renderResult(data) {
  $("empty").hidden = true; $("output").hidden = false; $("modeLabel").textContent = data.mode === "groq" ? "Groq connected" : data.mode === "demo-fallback" ? "Demo fallback" : "Demo mode";
  $("resultState").textContent = data.blocked ? "Confirmation needed" : "Completed"; $("resultState").className = `pill ${data.blocked ? "warning" : "success"}`;
  $("summary").textContent = data.warning ? `${data.plan.summary || "Plan validated and executed."} (${data.warning})` : (data.plan.summary || "Plan validated and executed.");
  $("plan").innerHTML = data.plan.actions.map((a, i) => `<div class="action"><span class="number">0${i + 1}</span><div><strong>${escapeHtml(a.type.replaceAll("_", " "))}</strong><code>${escapeHtml(JSON.stringify(a.arguments))}</code></div><span class="action-state">${a.requiresConfirmation ? "Confirm" : "Allowed"}</span></div>`).join("");
  $("results").innerHTML = data.results.map(r => `<div class="result-row ${r.status}"><span>${r.status === "completed" ? "✓" : "!"}</span>${escapeHtml(r.message)}${r.status === "blocked" ? `<button id="confirm" class="confirm">Confirm action</button>` : ""}</div>`).join("");
  const confirm = $("confirm"); if (confirm) confirm.onclick = () => submit(true);
  renderState(data);
}
async function submit(confirmed = false) {
  const value = input.value.trim(); if (!value) { input.focus(); return; }
  run.disabled = true; run.innerHTML = "Planning… <span>please wait</span>"; $("resultState").textContent = "Working";
  try { const response = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: value, confirmed }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); renderResult(data); }
  catch (error) { $("empty").hidden = false; $("output").hidden = true; $("empty").innerHTML = `<div class="empty-icon">!</div><strong>Request failed</strong><span>${escapeHtml(error.message)}</span>`; $("resultState").textContent = "Error"; }
  finally { run.disabled = false; run.innerHTML = "Run agent <span>⌘ ↵</span>"; }
}
document.querySelectorAll("[data-example]").forEach(b => b.onclick = () => { input.value = b.dataset.example; input.focus(); });
run.onclick = () => submit(); input.addEventListener("keydown", e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(); });
fetch("/api/status").then(r => r.json()).then(data => { $("modeLabel").textContent = data.configured ? `Groq configured · ${data.model}` : "Demo mode"; }).catch(() => { $("modeLabel").textContent = "Demo mode"; });
fetch("/api/state").then(r => r.json()).then(renderState);
