import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultFrontendRoot = resolve(import.meta.dirname, '../..');

/** Fail the production build when CSS falls back to unresolved or missing fonts. */
export function validateFontAssets(frontendRoot = defaultFrontendRoot) {
  const distRoot = resolve(frontendRoot, 'dist');
  const sourcePrefix = 'src/assets/fonts/files/';
  const sourceNames = readdirSync(resolve(frontendRoot, sourcePrefix))
    .filter(name => name.endsWith('.woff2')).sort();
  if (sourceNames.length === 0) throw new Error('No vendored WOFF2 font sources found.');

  const manifest = JSON.parse(readFileSync(resolve(distRoot, '.vite/manifest.json'), 'utf8'));
  const cssFiles = new Set(Object.values(manifest).flatMap(entry => [
    ...(entry.file.endsWith('.css') ? [entry.file] : []), ...(entry.css ?? []),
  ]));
  const fontUrls = [...cssFiles].flatMap(file => {
    const css = readFileSync(resolve(distRoot, file), 'utf8');
    return [...css.matchAll(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)/g)]
      .map(match => match[1] ?? match[2] ?? match[3])
      .filter(url => url.includes('.woff2'))
      .map(url => {
        if (/^(?:[a-z]+:)?\/\//i.test(url)) throw new Error(`Unexpected external font URL: ${url}`);
        return new URL(url, `https://font-build.invalid/${file}`).pathname;
      });
  });

  const emitted = sourceNames.map(name => {
    const source = `${sourcePrefix}${name}`;
    const output = manifest[source]?.file;
    if (!output?.startsWith('assets/') || !output.endsWith('.woff2')) {
      throw new Error(`Font has no emitted manifest asset: ${source}`);
    }
    const sourceBytes = readFileSync(resolve(frontendRoot, source));
    const emittedBytes = readFileSync(resolve(distRoot, output));
    if (!sourceBytes.equals(emittedBytes)) throw new Error(`Emitted font differs from vendored source: ${output}`);
    if (!fontUrls.some(url => url.endsWith(`/${output}`))) {
      throw new Error(`Emitted font is not referenced by built CSS: ${output}`);
    }
    return output;
  });
  for (const url of fontUrls) {
    if (!emitted.some(file => url.endsWith(`/${file}`))) {
      throw new Error(`Built CSS contains an unresolved font URL: ${url}`);
    }
  }
  return emitted;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const emitted = validateFontAssets();
  console.log(`Font assets verified: ${emitted.length} vendored WOFF2 files emitted, byte-identical and referenced by CSS.`);
}
