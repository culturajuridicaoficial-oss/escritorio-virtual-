/** A Vercel envia "Authorization: Bearer <CRON_SECRET>" nas chamadas de cron. */
export function cronAutorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  return !!segredo && req.headers.get("authorization") === `Bearer ${segredo}`;
}
