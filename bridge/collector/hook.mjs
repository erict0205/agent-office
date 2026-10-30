import { parseArgs } from 'node:util';
import { readConfig } from './config.mjs';
import { normalizeHook } from './events.mjs';

// Pure observation: always return {}, never approve, block or add model context.
try {
  const { values } = parseArgs({ options: { provider: { type: 'string' }, config: { type: 'string' }, 'office-hook-v1': { type: 'boolean' } } });
  let input = ''; process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) { input += chunk; if (input.length > 2_000_000) throw new Error('Oversized event'); }
  const event = normalizeHook(values.provider, JSON.parse(input));
  if (event) {
    const config = await readConfig(values.config);
    await fetch(`http://127.0.0.1:${config.port}/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.localKey}` },
      body: JSON.stringify(event), signal: AbortSignal.timeout(650),
    });
  }
} catch { /* An unavailable collector must never interrupt the coding tool. */ }
process.stdout.write('{}\n');
