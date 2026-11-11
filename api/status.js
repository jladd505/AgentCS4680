export default function handler(req, res) {
  res.status(200).json({
    configured: Boolean(process.env.GROQ_API_KEY),
    model: process.env.GROQ_MODEL || "openai/gpt-oss-20b"
  });
}
