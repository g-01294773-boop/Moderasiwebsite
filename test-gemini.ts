import { GoogleGenAI } from "@google/genai";
const models = [
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.1-flash-lite-preview",
  "gemini-3.1-pro-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
  "gemini-flash-lite-latest",
  "gemini-flash-latest"
];
async function run() {
  const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } }
  });
  for (const m of models) {
    try {
      const res = await ai.models.generateContent({ model: m, contents: "Hello" });
      console.log("Success with", m, ":", res.text);
      return; // Stop on first success
    } catch (err: any) {
      console.error("Failed with", m, ":", err.status, err.message);
    }
  }
}
run();
