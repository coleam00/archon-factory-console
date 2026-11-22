import { fromMarkdown } from 'mdast-util-from-markdown';

/**
 * A prompt's opening paragraph, as written: the first paragraph at the top of the document,
 * which a pack's prompt uses to say in plain words what the step does ("Land this change on its
 * landing branch, and only when it is sound to land."). The step page shows it under "What it
 * does". Null when the prompt opens with no paragraph before its first list, code or second
 * heading, so nothing that is not prose is shown as the step's summary.
 */
export function promptLead(prompt: string): string | null {
  for (const node of fromMarkdown(prompt).children) {
    if (node.type === 'heading' && node.depth === 1) continue;
    if (node.type !== 'paragraph') return null;
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    return start === undefined || end === undefined ? null : prompt.slice(start, end);
  }
  return null;
}
