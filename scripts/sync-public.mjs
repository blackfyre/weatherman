import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";

const files = ["index.html", "app.css", "app.js", "manifest.webmanifest", "service-worker.js"];
const icons = ["icon-192.png", "icon-512.png"];

async function assetHash() {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(await readFile(`src/${file}`));
  }
  return hash.digest("hex").slice(0, 12);
}

function versionIndex(html, version) {
  return html
    .replace('href="manifest.webmanifest"', `href="manifest.webmanifest?v=${version}"`)
    .replace('href="app.css"', `href="app.css?v=${version}"`)
    .replace('src="app.js"', `src="app.js?v=${version}"`);
}

function versionServiceWorker(script, version) {
  return script
    .replace(/const CACHE_NAME = "weatherman-[^"]+";/, `const CACHE_NAME = "weatherman-${version}";`)
    .replace('"/app.css"', `"/app.css?v=${version}"`)
    .replace('"/app.js"', `"/app.js?v=${version}"`)
    .replace('"/manifest.webmanifest"', `"/manifest.webmanifest?v=${version}"`);
}

const version = await assetHash();

await mkdir("public/icons", { recursive: true });

for (const file of files) {
  const content = await readFile(`src/${file}`, "utf8");
  const output = file === "index.html"
    ? versionIndex(content, version)
    : file === "service-worker.js"
      ? versionServiceWorker(content, version)
      : content;
  await writeFile(`public/${file}`, output);
}

for (const icon of icons) {
  await copyFile(`src/icons/${icon}`, `public/icons/${icon}`);
}

console.log(`synced public assets with cache version ${version}`);
