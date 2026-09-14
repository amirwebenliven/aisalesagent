/**
 * What every Server Action in this app resolves to.
 *
 * Actions never throw at the caller for an expected failure — a provider that
 * rejected a token, a URL we refuse to crawl, a conversation that moved. The
 * reason travels back in `error` and gets rendered, because "something went
 * wrong" is how a five minute fix becomes a day of guessing.
 *
 * `null` is the initial value for useActionState: nothing has run yet.
 */
export type ActionState = { ok: boolean; error?: string; message?: string } | null;
