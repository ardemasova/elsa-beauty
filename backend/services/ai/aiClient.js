const OpenAI = require("openai").default;

if (!process.env.OPENROUTER_API_KEY) {
  console.warn("⚠️  OPENROUTER_API_KEY not set: AI features will not work");
}

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || "missing",
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": process.env.APP_URL || "https://app.elsaerp.com",
    "X-Title": "ELSA Beauty",
  },
});

module.exports = { openai };
