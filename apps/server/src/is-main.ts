import { pathToFileURL } from 'node:url';

/** Whether this module was run directly (`tsx file.ts`), safe for paths with spaces. */
export function isMain(metaUrl: string): boolean {
  return Boolean(process.argv[1]) && metaUrl === pathToFileURL(process.argv[1] as string).href;
}
