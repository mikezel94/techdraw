import { parseProject } from './projectFile';
import type { ParseResult } from './projectFile';

export const EXAMPLE_DRAWING_URL = `${import.meta.env.BASE_URL}example-drawing.json`;

// The example ships as a static asset in the regular project-file format
// (ADR 0009), so it is validated by the same parser used for Open.
export async function loadExampleDrawing(): Promise<ParseResult> {
  let text: string;
  try {
    const response = await fetch(EXAMPLE_DRAWING_URL);
    if (!response.ok) {
      return {
        ok: false,
        error: `The example could not be downloaded (HTTP ${response.status}).`,
      };
    }
    text = await response.text();
  } catch {
    return { ok: false, error: 'The example could not be downloaded.' };
  }
  return parseProject(text);
}
