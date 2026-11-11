# AgentOps - CS4680 Assignment 4

AgentOps is a safe, auditable AI agent that converts natural-language requests into validated actions. It demonstrates the four required project areas: LLM integration, action interpretation/execution across multiple domains, a browser UI, and safety/error handling with an audit log.

## Run locally

```bash
npm start
```

Open <http://localhost:3000>. Copy `.env.example` to `.env` and set `GROQ_API_KEY` to enable the Groq planner. Without a key, deterministic demo mode still supports the same safe action patterns. With Groq enabled, the LLM chooses among notes, arithmetic, server-side file operations, allowlisted system commands, and a public GitHub API action.

## Deploy

This project is Vercel-compatible: import the repository, deploy, then add `GROQ_API_KEY` and optionally `GROQ_MODEL` in the project environment variables. The app remains usable in demo mode if no key is configured. Because the demo uses in-memory state, notes reset when a serverless instance sleeps; that is intentional for a classroom demonstration.

## Design notes

- The model is constrained to JSON and an allowlist of eleven actions.
- Arithmetic is validated before evaluation; arbitrary shell commands, URLs, paths, and credentials are not accepted.
- File operations are restricted to simple filenames in the server's temporary AgentOps directory.
- System execution uses `execFile` with fixed commands (`uname` and the Node runtime version), never a user-provided shell string.
- The API action is restricted to the public GitHub repository endpoint and validates owner/repository names.
- Deletion is always marked as requiring confirmation and is blocked until the UI confirms it.
- Every request records the input, planner mode, plan, result, status, and duration.
