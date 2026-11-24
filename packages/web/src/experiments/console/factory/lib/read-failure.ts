import { HttpError, serverErrorMessage } from '../../lib/http';

/**
 * What a failed read says to the person on the page, in plain words:
 * - "the server did not answer" when the request got no answer at all. `fetch` rejects with a
 *   `TypeError` then; classified by type as `network-retry.ts` does, never by message text.
 * - The server's own message when it sent one (the factory routes word theirs for that reader).
 * - Else its status, or the body it sent (`serverErrorMessage`).
 * - Else the error's text.
 */
/**
 * Detail for a failed factory read shown after a sentence ("could not be loaded: ..."): for an
 * HttpError the server's own `error` (and `detail`), read from the whole body, else its status
 * or the capped body (`serverErrorMessage`); else the error's text.
 */
export function factoryErrorDetail(e: unknown): string {
  if (e instanceof HttpError) {
    if (e.serverError === undefined) return serverErrorMessage(e);
    return e.serverDetail ? `${e.serverError}: ${e.serverDetail}` : e.serverError;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

export function readFailure(error: Error): string {
  if (error instanceof TypeError) return 'the server did not answer';
  if (error instanceof HttpError) return error.serverError ?? serverErrorMessage(error);
  return error.message;
}
