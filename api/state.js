import { getState } from "../lib/agent.js";
export default function handler(req, res) { return res.status(200).json(getState()); }
