import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import runHandler from "./api/run.js";
import stateHandler from "./api/state.js";
import statusHandler from "./api/status.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = http.createServer(async (req, res) => {
  if (req.url === "/api/run") {
    let raw = ""; for await (const chunk of req) raw += chunk; req.body = raw;
    return runHandler(req, { status: code => ({ json: data => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(data)); } }) });
  }
  if (req.url === "/api/state") return stateHandler(req, { status: code => ({ json: data => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(data)); } }) });
  if (req.url === "/api/status") return statusHandler(req, { status: code => ({ json: data => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(data)); } }) });
  const requested = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const file = path.join(root, "public", requested);
  if (!file.startsWith(path.join(root, "public")) || !fs.existsSync(file)) return res.writeHead(404).end("Not found");
  res.writeHead(200, { "content-type": mime[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
server.listen(process.env.PORT || 3000, () => console.log(`AgentOps running on http://localhost:${process.env.PORT || 3000}`));
