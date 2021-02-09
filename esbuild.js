const fs = require('fs');
const localPkgJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

require('esbuild').build({
    entryPoints: [
        'plugin.ts',
        'bin/lift.ts',
        'src/index.ts',
        ...fs.readdirSync('src/commands').map(file => 'src/commands/' + file),
    ],
    bundle: true,
    platform: 'node',
    target: ['node10.4'],
    outdir: 'dist',
    minify: true,
    external: Object.keys({
        ...(localPkgJson.dependencies || {}),
        ...(localPkgJson.devDependencies || {}),
        ...(localPkgJson.peerDependencies || {})
    })
});
