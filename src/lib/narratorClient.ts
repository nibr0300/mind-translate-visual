import { supabase } from '@/integrations/supabase/client';
import type { NarratorScore } from './narrator';
import type { NarratorCorrection } from '../../supabase/functions/_shared/narratorVoice';

export async function generateNarration(score: NarratorScore, signal: AbortSignal, onText: (text: string) => void, correction?: NarratorCorrection, previous?: string) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Logga in för att använda Lovable AI. Lokal batch-export är tillgänglig utan inloggning.');
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/narrate-field`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify({ score, correction, previous }),
  });
  if (!response.ok) {
    const raw = await response.text(); let message = raw;
    try { const parsed = JSON.parse(raw); message = parsed.error ?? parsed.message ?? raw; } catch { /* plain error */ }
    throw new Error(message || `Narratören svarade ${response.status}`);
  }
  if (!response.body) throw new Error('AI-tjänsten gav inget svar.');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', answer = '', done = false;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'error') throw new Error(event.error);
    if (event.type === 'delta') { answer += event.text; onText(answer); }
    if (event.type === 'done') done = true;
  };
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
      lines.forEach(consume);
    }
    buffer += decoder.decode(); consume(buffer);
    if (!done || !answer.trim()) throw new Error('Svaret blev inte färdigt. Utkastet är inte godkänt.');
    return answer;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}