import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const targetDir = resolve("dist");
const rootIndex = resolve("index-approval.html");
const distIndex = resolve(targetDir, "index.html");
const packageName = "第七版-第2次修改-项目任务清单静态审查包";
const approvalRoot = resolve("G:/mutou/xm/jt");
const approvalDir = resolve(approvalRoot, packageName);

const html = await readFile(distIndex, "utf8");
const cssMatch = html.match(/href="\.\/assets\/([^"]+\.css)"/);
const jsMatch = html.match(/src="\.\/assets\/([^"]+\.js)"/);

if (!cssMatch || !jsMatch) {
  throw new Error("没有找到 Vite 输出的 CSS/JS 资源引用。");
}

const css = await readFile(resolve(targetDir, "assets", cssMatch[1]), "utf8");
const js = await readFile(resolve(targetDir, "assets", jsMatch[1]), "utf8");

const standaloneHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>第七版项目任务优化预览包</title>
    <style>
${css}
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module">
${js}
    </script>
  </body>
</html>
`;

await writeFile(distIndex, standaloneHtml, "utf8");
await writeFile(rootIndex, standaloneHtml, "utf8");
await rm(approvalDir, { recursive: true, force: true });
await mkdir(approvalDir, { recursive: true });
await cp(targetDir, resolve(approvalDir, "dist"), { recursive: true });
await writeFile(resolve(approvalDir, "index.html"), standaloneHtml, "utf8");
await writeFile(resolve(approvalRoot, "index.html"), standaloneHtml, "utf8");
await writeFile(
  resolve(approvalDir, "README.md"),
  `# ${packageName}\n\n生成时间：${new Date().toLocaleString("zh-CN", { hour12: false })}\n\n打开 index.html 可查看本次第七版前端整改静态包。\n`,
  "utf8"
);
