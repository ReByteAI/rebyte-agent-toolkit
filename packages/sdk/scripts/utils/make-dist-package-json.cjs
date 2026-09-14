const pkgJson = require(process.env['PKG_JSON_PATH'] || '../../package.json');

function processExportMap(m) {
  for (const key in m) {
    if (!Object.hasOwn(m, key)) {
      continue;
    }

    const value = m[key];
    if (typeof value === 'string') {
      m[key] = value.replace(/^\.\/dist\//, './');
    } else {
      processExportMap(value);
    }
  }
}
processExportMap(pkgJson.exports);

if (pkgJson.imports?.['#x509-transport-state']) {
  const state = pkgJson.imports['#x509-transport-state'];
  for (const condition of Object.keys(state)) {
    if (condition === 'types') {
      continue;
    }
    if (condition === 'browser') {
      state[condition] = {
        import: './internal/auth/x509-transport-state.mjs',
        require: './internal/auth/x509-transport-state.js',
        default: './internal/auth/x509-transport-state.mjs',
      };
      continue;
    }
    if (condition === 'default') {
      state[condition] = './internal/auth/x509-transport-state.js';
      continue;
    }
    state[condition] = state[condition]
      .replace(/^\.\/src\//, './')
      .replace(/\.cts$/, condition === 'node' ? '.js' : '.cjs')
      .replace(/\.ts$/, '.mjs');
  }
}

for (const key of ['types', 'main', 'module']) {
  if (typeof pkgJson[key] === 'string') {
    pkgJson[key] = pkgJson[key].replace(/^(\.\/)?dist\//, './');
  }
}

pkgJson.files = ['**/*'];
delete pkgJson.scripts;
delete pkgJson.devDependencies;


console.log(JSON.stringify(pkgJson, null, 2));
