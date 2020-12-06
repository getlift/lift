const fs = require('fs');
const localPkgJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

require('esbuild').build({
    entryPoints: ['bin/lift.ts'],
    bundle: true,
    platform: 'node',
    outfile: 'dist/lift',
    minify: true,
    external: Object.keys({
        ...(localPkgJson.dependencies || {}),
        ...(localPkgJson.devDependencies || {}),
        ...(localPkgJson.peerDependencies || {})
    })
});
