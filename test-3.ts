import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const models = [
  "gemini-3.1-flash-lite",
  "gemini-3.1-pro-preview",
  "gemini-3.5-flash",
  "gemini-3-flash-preview"
];
async function test() {
  for (const m of models) {
    try {
      await ai.models.generateContent({ model: m, contents: "Hello" });
      console.log(`Success with: ${m}`);
      return;
    } catch (e: any) {
      console.log(`Failed with ${m}: ${e?.status} ${e?.message}`);
    }
  }
}
test();
