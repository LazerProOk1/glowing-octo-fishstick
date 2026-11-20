// Generation error codes: sim throws a code, the ui picks the player-facing text (errorDetail).

/** Province debris cleanup did not converge; the text is the error.cleanupNoConverge key in ru.ts. */
export const ERR_CLEANUP_NO_CONVERGE = 'province_cleanup_no_converge';

/** Error with a stable code and data (numbers, ids). Errors cross the worker as message text only, so it is encoded there. */
export class CodedError extends Error {
  constructor(code: string, params?: Record<string, string | number>) {
    super(params ? `${code}: ${JSON.stringify(params)}` : code);
  }
}

/** Inverse of CodedError message encoding; undefined if the text is not one. */
export function parseCodedMessage(msg: string): { code: string; params: Record<string, string | number> } | undefined {
  const m = /^([a-z_]+)(?:: (\{.*\}))?$/s.exec(msg);
  if (!m?.[1]) return undefined;
  return { code: m[1], params: m[2] ? (JSON.parse(m[2]) as Record<string, string | number>) : {} };
}
