import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const fileRoot = path.join(process.env.AGENTOPS_DATA_DIR || "/tmp", "agentops-files");
const state = globalThis.__agentOpsState ??= {
  notes: [
    { id: "welcome", text: "Welcome to AgentOps. Try: create a note to review prompt engineering tomorrow.", createdAt: new Date().toISOString() }
  ],
  audit: []
};

const ACTION_TYPES = new Set([
  "create_note", "list_notes", "calculate", "get_time", "delete_note",
  "create_file", "read_file", "list_files", "delete_file", "system_info", "github_repo"
]);

function audit(entry) {
  state.audit.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), ...entry });
  state.audit = state.audit.slice(0, 30);
}

function demoPlan(input) {
  const lower = input.toLowerCase();
  const actions = [];
  const noteMatch = input.match(/(?:note|remind me to|remember)\s*[:\-]?\s*(.+?)(?:\s+(?:for|on)\s+(?:today|tomorrow|next week))?$/i);
  const fileMatch = input.match(/(?:file|document)\s+(?:named|called)\s+([\w.-]+)/i);
  const repoMatch = input.match(/(?:github|repo(?:sitory)?)\s+(?:for\s+)?([\w.-]+)\/([\w.-]+)/i);

  if ((lower.includes("delete") || lower.includes("remove")) && lower.includes("file")) {
    actions.push({ type: "delete_file", arguments: { filename: fileMatch?.[1] || "agentops-demo.txt" }, requiresConfirmation: true });
  } else if ((lower.includes("create") || lower.includes("write")) && lower.includes("file")) {
    actions.push({ type: "create_file", arguments: { filename: fileMatch?.[1] || "agentops-demo.txt", content: "Created by AgentOps from a natural-language request." }, requiresConfirmation: false });
  } else if ((lower.includes("read") || lower.includes("open")) && lower.includes("file")) {
    actions.push({ type: "read_file", arguments: { filename: fileMatch?.[1] || "agentops-demo.txt" }, requiresConfirmation: false });
  } else if (lower.includes("list") && lower.includes("file")) {
    actions.push({ type: "list_files", arguments: {}, requiresConfirmation: false });
  } else if (repoMatch || lower.includes("github")) {
    actions.push({ type: "github_repo", arguments: { owner: repoMatch?.[1] || "vercel", repo: repoMatch?.[2] || "next.js" }, requiresConfirmation: false });
  } else if (lower.includes("system") || lower.includes("uname") || lower.includes("node version") || lower.includes("runtime")) {
    actions.push({ type: "system_info", arguments: {}, requiresConfirmation: false });
  } else if (lower.includes("delete") || lower.includes("remove")) {
    const id = state.notes.find(n => lower.includes(n.id.toLowerCase()))?.id;
    actions.push({ type: "delete_note", arguments: { id: id || "welcome" }, requiresConfirmation: true });
  } else if (lower.includes("list") && lower.includes("note")) {
    actions.push({ type: "list_notes", arguments: {}, requiresConfirmation: false });
  } else if (lower.includes("time")) {
    actions.push({ type: "get_time", arguments: {}, requiresConfirmation: false });
  } else if (/\d\s*[+\-*\/%]\s*\d/.test(input)) {
    const expression = input.match(/[0-9+\-*\/%().\s]+/)[0].trim();
    actions.push({ type: "calculate", arguments: { expression }, requiresConfirmation: false });
  } else {
    actions.push({ type: "create_note", arguments: { text: noteMatch?.[1]?.trim() || input.trim() }, requiresConfirmation: false });
  }
  return { intent: "Turn a natural-language request into a safe action", summary: "Demo planner selected the safest matching action.", actions };
}

function extractJson(text) {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The model did not return JSON.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url, options, attempts = 3) {
  let response;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    response = await fetch(url, options);
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === attempts - 1) return response;
    await wait(150 * (attempt + 1));
  }
  return response;
}

async function llmPlan(input) {
  const response = await fetchWithRetry("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
      temperature: 0,
      messages: [
        { role: "system", content: `You are the planning module for a safe student AI agent. Return JSON only with keys intent, summary, actions. actions must be an array of at most 4 objects with type, arguments, requiresConfirmation. Allowed actions: create_note({text}), list_notes({}), calculate({expression}), get_time({}), delete_note({id}), create_file({filename,content}), read_file({filename}), list_files({}), delete_file({filename}), system_info({}), github_repo({owner,repo}). Use delete_note and delete_file only when explicitly requested and always set requiresConfirmation true. File names must be simple names, never paths. system_info is read-only and uses fixed allowlisted commands; never invent shell commands. github_repo only uses the public GitHub API. Never invent credentials, URLs, or tools. Keep expressions limited to arithmetic. If the request is ambiguous, choose one safe action and explain it in summary.` },
        { role: "user", content: input }
      ]
    })
  });
  if (!response.ok) throw new Error(`Groq request failed (${response.status}).`);
  const data = await response.json();
  return extractJson(data.choices?.[0]?.message?.content || "");
}

function validFilename(filename) {
  return typeof filename === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(filename);
}

function validatePlan(plan) {
  if (!plan || !Array.isArray(plan.actions) || plan.actions.length > 4) throw new Error("Invalid action plan.");
  for (const action of plan.actions) {
    if (!ACTION_TYPES.has(action.type)) throw new Error(`Blocked unsupported action: ${action.type}`);
    if (action.type === "create_note" && typeof action.arguments?.text !== "string") throw new Error("A note needs text.");
    if (action.type === "calculate" && !/^[0-9+\-*\/%().\s]+$/.test(action.arguments?.expression || "")) throw new Error("Only basic arithmetic is allowed.");
    if (["create_file", "read_file", "delete_file"].includes(action.type) && !validFilename(action.arguments?.filename)) throw new Error("File operations require a simple filename, not a path.");
    if (action.type === "create_file" && typeof action.arguments?.content !== "string") throw new Error("A file needs text content.");
    if (action.type === "github_repo" && (!/^[\w.-]{1,39}$/.test(action.arguments?.owner || "") || !/^[\w.-]{1,100}$/.test(action.arguments?.repo || ""))) throw new Error("Invalid GitHub repository.");
    if (["delete_note", "delete_file"].includes(action.type)) action.requiresConfirmation = true;
  }
  return plan;
}

function calculate(expression) {
  if (!/^[0-9+\-*\/%().\s]+$/.test(expression) || expression.length > 80) throw new Error("Unsafe expression blocked.");
  return Function(`"use strict"; return (${expression})`)();
}

async function execute(action, confirmed) {
  if (action.requiresConfirmation && !confirmed) return { status: "blocked", message: "Confirmation required before this action can change data." };
  switch (action.type) {
    case "create_note": {
      const note = { id: crypto.randomUUID().slice(0, 8), text: action.arguments.text.trim(), createdAt: new Date().toISOString() };
      state.notes.unshift(note);
      return { status: "completed", message: `Created note ${note.id}.`, data: note };
    }
    case "list_notes": return { status: "completed", message: `Found ${state.notes.length} note${state.notes.length === 1 ? "" : "s"}.`, data: state.notes };
    case "calculate": return { status: "completed", message: `${action.arguments.expression} = ${calculate(action.arguments.expression)}` };
    case "get_time": return { status: "completed", message: `Current time: ${new Date().toLocaleString()}` };
    case "delete_note": {
      const index = state.notes.findIndex(n => n.id === action.arguments.id);
      if (index < 0) return { status: "error", message: "That note does not exist." };
      const [removed] = state.notes.splice(index, 1);
      return { status: "completed", message: `Deleted note ${removed.id}.` };
    }
    case "create_file": {
      await fs.mkdir(fileRoot, { recursive: true });
      const target = path.join(fileRoot, action.arguments.filename);
      try { await fs.access(target); return { status: "error", message: `File ${action.arguments.filename} already exists.` }; } catch {}
      await fs.writeFile(target, action.arguments.content, "utf8");
      return { status: "completed", message: `Created server file ${action.arguments.filename}.` };
    }
    case "read_file": {
      const content = await fs.readFile(path.join(fileRoot, action.arguments.filename), "utf8");
      return { status: "completed", message: `Read ${action.arguments.filename}: ${content.slice(0, 500)}` };
    }
    case "list_files": {
      await fs.mkdir(fileRoot, { recursive: true });
      const files = await fs.readdir(fileRoot);
      return { status: "completed", message: files.length ? `Files: ${files.join(", ")}` : "No server files have been created yet." };
    }
    case "delete_file": {
      await fs.unlink(path.join(fileRoot, action.arguments.filename));
      return { status: "completed", message: `Deleted server file ${action.arguments.filename}.` };
    }
    case "system_info": {
      const [platform, node] = await Promise.all([
        execFileAsync("uname", ["-srm"]),
        execFileAsync(process.execPath, ["--version"])
      ]);
      return { status: "completed", message: `System command output: ${platform.stdout.trim()} | ${node.stdout.trim()}` };
    }
    case "github_repo": {
      const owner = action.arguments.owner;
      const repo = action.arguments.repo;
      const response = await fetchWithRetry(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { headers: { accept: "application/vnd.github+json", "user-agent": "agentops-cs4680" } }, 2);
      if (!response.ok) throw new Error(`GitHub API request failed (${response.status}).`);
      const data = await response.json();
      return { status: "completed", message: `${data.full_name}: ${data.description || "No description"}. Stars: ${data.stargazers_count}. Language: ${data.language || "unknown"}.` };
    }
  }
}

export async function runAgent(input, confirmed = false) {
  const startedAt = Date.now();
  if (!input || input.length > 500) throw new Error("Enter a request under 500 characters.");
  let plan, mode = "demo", warning = "";
  try {
    plan = process.env.GROQ_API_KEY ? await llmPlan(input) : demoPlan(input);
    mode = process.env.GROQ_API_KEY ? "groq" : "demo";
  } catch (error) {
    plan = demoPlan(input);
    mode = "demo-fallback";
    warning = error.message || "The Groq request failed, so demo mode was used.";
  }
  validatePlan(plan);
  const results = [];
  for (const action of plan.actions) {
    try { results.push(await execute(action, confirmed)); }
    catch (error) { results.push({ status: "error", message: error.message || "Action failed." }); }
  }
  const blocked = results.some(r => r.status === "blocked");
  audit({ input, mode, plan, results, status: blocked ? "blocked" : "completed", durationMs: Date.now() - startedAt });
  return { plan, results, mode, blocked, warning, notes: state.notes, audit: state.audit };
}

export function getState() { return { notes: state.notes, audit: state.audit }; }
