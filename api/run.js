import { runAgent } from "../lib/agent.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    return res.status(200).json(await runAgent(String(body.input || ""), Boolean(body.confirmed)));
  } catch (error) {
    return res.status(400).json({ error: error.message || "Request failed." });
  }
}
