const OpenAI = require("openai").default;

console.log("========== INITIALIZING OPENAI ==========");
console.log("API Key exists:", !!process.env.OPENROUTER_API_KEY);

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",

   defaultHeaders: {
    "HTTP-Referer": "http://localhost:5173",
    "X-Title": "ELSA Beauty",
  },
});

console.log("OpenAI instance created:", !!openai);
console.log("OpenAI.chat exists:", !!openai.chat);
console.log("OpenAI.chat.completions exists:", !!openai.chat.completions);
console.log("=========================================");

module.exports = { openai };