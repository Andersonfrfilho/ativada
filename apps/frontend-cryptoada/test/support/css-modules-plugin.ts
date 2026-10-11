// Copyright (c) 2026 Ada Technology. All rights reserved.
// Nos testes, `import styles from './x.module.css'` devolve o próprio nome da classe.
Bun.plugin({
  name: 'css-modules-as-class-names',
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, () => ({
      contents: 'export default new Proxy({}, { get: (_target, key) => String(key) });',
      loader: 'js',
    }));
  },
});
