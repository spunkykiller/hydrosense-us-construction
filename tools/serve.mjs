import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const base = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const port = Number(process.argv[3] || 8090);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!relative) { try { await fs.stat(path.join(base, 'index.html')); relative = 'index.html'; } catch { res.setHeader('Content-Type', 'text/html'); res.end('<h1>HydroSense Review</h1><ul>' + ['hydrosense-firefighters', 'hydrosense-mining-safety', 'hydrosense-us-construction'].map((slug) => `<li><a href="/${slug}/">${slug}</a></li>`).join('') + '</ul>'); return; } }
    if (relative.endsWith('/')) relative += 'index.html';
    const target = path.resolve(base, relative);
    if (!target.startsWith(base + path.sep) || /(?:^|\/)(?:\.git|source|backend|node_modules|handover-tooling)(?:\/|$)/.test(relative) || /\.env(?:$|\.)/.test(relative)) { res.writeHead(403); res.end(); return; }
    const bytes = await fs.readFile(target);
    res.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream'); res.end(bytes);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log('HydroSense review at http://127.0.0.1:' + port));
