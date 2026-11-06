// Builds the release files into dist/, the folder Eidos MD loads the plugin
// from (linked by `eidos plugin new`, or `eidos plugin link dist`): cli.js and
// app.js, CommonJS bundles whose one import from the host, eidosmd/plugin, the
// host answers; page.js, whose react and eidosmd/page imports the page
// answers; and manifest.yaml, instructions.md, and README.md beside them, the manifest's
// built_with stamped with the eidosmd this build compiled against, so the app
// can say when it runs on a version this plugin was not tested with. With
// --watch it builds again on every change, and the app reloads the plugin as
// it does.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { context } from 'esbuild';

const watching = process.argv.includes('--watch');
mkdirSync('dist', { recursive: true });
// the version of the eidosmd installed beside the plugin, null when none is
let builtWith = null;
try {
  builtWith = JSON.parse(readFileSync(createRequire(import.meta.url).resolve('eidosmd/package.json'), 'utf8')).version;
} catch {
  console.warn('eidosmd is not installed here, so the manifest says nothing of what it was built with (pnpm install)');
}
const copy = () => {
  const manifest = readFileSync('manifest.yaml', 'utf8').replace(/^built_with:.*\n/m, '');
  writeFileSync('dist/manifest.yaml', builtWith ? manifest.replace(/^(min_host:.*\n)/m, `$1built_with: ${builtWith}\n`) : manifest);
  copyFileSync('instructions.md', 'dist/instructions.md');
  copyFileSync('README.md', 'dist/README.md');
};
const node = { bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['eidosmd/plugin'], legalComments: 'none' };
const builds = [
  { ...node, entryPoints: ['src/cli.ts'], outfile: 'dist/cli.js' },
  { ...node, entryPoints: ['src/app.ts'], outfile: 'dist/app.js' },
  {
    entryPoints: ['src/page.tsx'],
    outfile: 'dist/page.js',
    bundle: true,
    platform: 'browser',
    format: 'cjs',
    target: 'es2022',
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'eidosmd/page'],
    legalComments: 'none',
  },
];
copy();
const contexts = await Promise.all(builds.map((options) => context(options)));
if (watching) {
  for (const held of contexts) await held.watch();
  const { watch } = await import('node:fs');
  for (const file of ['manifest.yaml', 'instructions.md', 'README.md']) watch(file, copy);
  console.log('watching src/, manifest.yaml, and instructions.md; dist/ is rebuilt on every change');
} else {
  for (const held of contexts) {
    await held.rebuild();
    await held.dispose();
  }
}
