import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/db.ts';
import { z } from 'npm:zod@3.23.8';

const ALLOWED_KEYS = [
  'audit_frequency',
  'conciliation_auto',
  'conciliation_frequency',
  'export_format',
] as const;

const BodySchema = z.object({
  config: z.record(
    z.enum(ALLOWED_KEYS),
    z.string().max(500)
  ).refine((entries) => Object.keys(entries).length > 0, {
    message: 'Pelo menos uma chave de configuração deve ser fornecida',
  }),
});

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  if (req.method !== 'POST') return jsonResponse({ error: 'Método não permitido' }, 405);

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse({ error: 'Corpo inválido' }, 400);
  }

  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse({ error: 'Payload inválido', details: parsed.error.flatten() }, 400);
  }

  const entries = parsed.data.config;
  const now = new Date().toISOString();
  const rows = Object.entries(entries).map(([key, value]) => ({ key, value, updated_at: now }));

  const db = serviceClient();
  const { error } = await db.from('system_config').upsert(rows, { onConflict: 'key' });
  if (error) return jsonResponse({ ok: false, error: error.message }, 500);

  return jsonResponse({ ok: true });
});
