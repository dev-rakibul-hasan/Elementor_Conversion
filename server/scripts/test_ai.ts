import { GeminiAdapter } from '../src/modules/ai/providers/gemini.js';
import { GroqAdapter } from '../src/modules/ai/providers/groq.js';
import { OpenRouterAdapter } from '../src/modules/ai/providers/openrouter.js';

async function main() {
  console.log('Testing AI adapters...');

  const gemini = new GeminiAdapter();
  const geminiHealth = await gemini.checkHealth();
  console.log('Gemini Health:', geminiHealth);

  const groq = new GroqAdapter();
  const groqHealth = await groq.checkHealth();
  console.log('Groq Health:', groqHealth);

  const openrouter = new OpenRouterAdapter();
  const orHealth = await openrouter.checkHealth();
  console.log('OpenRouter Health:', orHealth);
}

main().catch(console.error);

