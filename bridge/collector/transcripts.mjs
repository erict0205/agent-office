import { open, readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { normalizeTranscript } from './events.mjs';

// Optional Codex compatibility reader. JSONL is not a stable public protocol;
// only explicit lifecycle records are interpreted. No text is retained/uploaded.
export class CodexTranscriptReader {
  constructor({ root = join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'sessions'), onEvent, now = Date.now }) {
    this.root = root; this.onEvent = onEvent; this.files = new Map(); this.now = now;
  }
  async candidates() {
    const result = [];
    for (let ago = 0; ago < 3; ago++) {
      const d = new Date(this.now() - ago * 86_400_000);
      const folder = join(this.root, String(d.getUTCFullYear()), String(d.getUTCMonth() + 1).padStart(2,'0'), String(d.getUTCDate()).padStart(2,'0'));
      let entries; try { entries = await readdir(folder, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) if (entry.isFile() && entry.name.endsWith('.jsonl')) result.push(join(folder, entry.name));
    }
    return result.slice(-200);
  }
  async poll() {
    for (const file of await this.candidates()) {
      let info; try { info = await stat(file); } catch { continue; }
      if (this.now() - info.mtimeMs > 86_400_000) continue;
      let cursor = this.files.get(file);
      if (!cursor || info.size < cursor.offset) {
        // Read metadata independently, so a tail never loses session identity.
        const h = await open(file, 'r'); const buf = Buffer.alloc(65536);
        const { bytesRead } = await h.read(buf, 0, buf.length, 0); await h.close();
        let first; try { first = JSON.parse(buf.subarray(0, bytesRead).toString().split('\n')[0]); } catch { continue; }
        if (first.type !== 'session_meta' || typeof first.payload?.id !== 'string') continue;
        cursor = { offset: 0, meta: { session: first.payload.id, originator: first.payload.originator, source: first.payload.source }, last: null };
        this.files.set(file, cursor);
      }
      if (info.size > cursor.offset) {
        // Read only the snapshotted range; leave an incomplete final line for the next poll.
        const stream = createReadStream(file, { start: cursor.offset, end: info.size - 1 });
        let pending = Buffer.alloc(0), consumed = 0;
        for await (const chunk of stream) {
          pending = Buffer.concat([pending, chunk]); let newline;
          while ((newline = pending.indexOf(10)) !== -1) {
            const line = pending.subarray(0, newline); consumed += newline + 1; pending = pending.subarray(newline + 1);
            let record; try { record = JSON.parse(line.toString()); } catch { continue; }
            const event = normalizeTranscript(record, cursor.meta, cursor.last);
            if (event) cursor.last = event;
          }
          if (pending.length > 8_000_000) { consumed += pending.length; pending = Buffer.alloc(0); }
        }
        cursor.offset += consumed;
      }
      if (cursor.last) {
        const unknown = cursor.last.status === 'working' && this.now() - info.mtimeMs > 120_000;
        await this.onEvent(unknown ? { ...cursor.last, status: 'unknown', observedAt: Math.trunc(info.mtimeMs) + 120_001 } : { ...cursor.last, observedAt: cursor.last.status === 'working' ? Math.max(cursor.last.observedAt, Math.trunc(info.mtimeMs)) : cursor.last.observedAt });
      }
    }
  }
}
