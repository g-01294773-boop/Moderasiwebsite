import { GoogleGenAI } from "@google/genai";
async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const models = await ai.models.list();
    for await (const model of models) {
      console.log(model.name);
    }
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}
run();
