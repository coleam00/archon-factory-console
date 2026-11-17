import { HttpError } from '../../lib/http';

/**
 * What a failed read says to the person on the page: the server's own message when it sent
 * one (the factory routes word theirs for that reader), else the error's text.
 */
export function readFailure(error: Error): string {
  return error instanceof HttpError && error.serverError !== undefined
    ? error.serverError
    : error.message;
}
