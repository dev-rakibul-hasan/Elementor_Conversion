import { GeminiAdapter } from '../src/modules/ai/providers/gemini.js';

async function testModel(modelId: string) {
  const adapter = new GeminiAdapter({ defaultModel: modelId });
  const start = Date.now();
  try {
    const res = await adapter.sendRequest({
      messages: [
        { role: 'system', content: 'You are a fast JSON generator.' },
        { role: 'user', content: 'Generate a short JSON object with keys "title" and "description" for a landing page.' }
      ],
      responseFormat: { type: 'json_object' }
    });
    const duration = Date.now() - start;
    console.log(`Model: ${modelId} -> Time: ${duration}ms, Tokens: ${res.usage?.totalTokens}`);
  } catch (err: any) {
    console.log(`Model: ${modelId} -> Error: ${err?.message || err}`);
  }
}

async function main() {
  await testModel('gemini-2.5-flash');
  await testModel('gemini-flash-lite-latest');
  await testModel('gemini-3.5-flash-lite');
  await testModel('gemini-3.8-flash');
}

main().catch(console.error);
