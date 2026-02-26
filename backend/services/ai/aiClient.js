const OpenAI = require("openai").default;

console.log("========== INITIALIZING OPENAI ==========");
console.log("API Key exists:", !!process.env.OPENAI_API_KEY);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

console.log("OpenAI instance created:", !!openai);
console.log("OpenAI.chat exists:", !!openai.chat);
console.log("OpenAI.chat.completions exists:", !!openai.chat.completions);
console.log("=========================================");

module.exports = { openai };