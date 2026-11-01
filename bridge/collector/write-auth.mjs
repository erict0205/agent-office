import { createHmac, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// A scoped ingestion key, distinct from the Sites service credential. Only its
// fingerprint is stored in the Worker; neither value enters browser code.
export function deriveWriteToken(siteToken) {
  if(typeof siteToken!=='string'||!siteToken)throw new Error('缺少服務存取憑證');
  return createHmac('sha256',siteToken).update('agent-office/ingest/v1').digest('hex');
}
export function deriveRunnerToken(siteToken) {return createHmac('sha256',siteToken).update('agent-office/runner/v1').digest('hex');}
export function writeFingerprint(token) { return createHash('sha256').update(token).digest('hex'); }

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href&&process.argv.includes('--fingerprint-stdin')) {
  const {readSecretFromStdin}=await import('./config.mjs');
  const {token}=await readSecretFromStdin();
  console.log(JSON.stringify({fingerprint:writeFingerprint(deriveWriteToken(token))}));
}
