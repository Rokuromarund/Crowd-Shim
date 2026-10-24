// 3D版を1つのHTMLにまとめる（スマホでダウンロードしてそのまま開けるように）。
// 使い方：node 3d/build.js  → リポジトリ直下に 3d.html ができる
'use strict';
const fs = require('fs'), path = require('path');
const dir = __dirname, out = path.join(dir, '..', '3d.html');

let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
// <script src="..."> を中身に置きかえる。</script> が混ざるとそこでページが切れるので、念のため逃がす
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const js = fs.readFileSync(path.join(dir, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script>/* ${src} */\n${js}\n</script>`;
});
// まとめた 3d.html は 2D版（index.html）と同じフォルダに置くので、リンク先を合わせる
html = html.replace(/href="\.\.\/index\.html"/g, 'href="index.html"');
if (/<script src=/.test(html)) throw new Error('まとめきれなかった <script src> が残っています');
fs.writeFileSync(out, html);
console.log(`${path.relative(process.cwd(), out)}: ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
