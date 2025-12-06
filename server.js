const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = __dirname;
const ASSETS_DIR = path.join(PROJECT_ROOT, 'assets');
const SCRIPT_PATH = path.join(ASSETS_DIR, 'add_contacts_to_workflow.js');
const PORT = Number(process.env.PORT) || 3000;
const MAX_PORT_RETRIES = 10;

let isRunning = false;
let currentPort = PORT;
let retries = 0;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return 'text/plain; charset=utf-8';
  }
}

function sendJson(res, statusCode, payload) {
  setCors(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.join(PROJECT_ROOT, safePath);

  if (!filePath.startsWith(PROJECT_ROOT)) {
    return sendJson(res, 403, { error: 'Forbidden' });
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    setCors(res);
    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    fs.createReadStream(filePath).pipe(res);
  });
}

function runWorkflow(res) {
  if (isRunning) {
    return sendJson(res, 409, { success: false, message: 'Processo já está em execução' });
  }
  if (!fs.existsSync(SCRIPT_PATH)) {
    return sendJson(res, 500, { success: false, message: 'Script add_contacts_to_workflow.js não encontrado' });
  }

  isRunning = true;
  const child = spawn(process.execPath, [SCRIPT_PATH], {
    cwd: ASSETS_DIR,
    env: process.env,
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
    stdout += data.toString();
  });

  child.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  child.on('error', (error) => {
    isRunning = false;
    sendJson(res, 500, { success: false, error: error.message });
  });

  child.on('close', (code) => {
    isRunning = false;
    sendJson(res, code === 0 ? 200 : 500, {
      success: code === 0,
      code,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    });
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname } = url;

  if (pathname === '/run-workflow' && req.method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    return res.end();
  }

  if (req.method === 'POST' && pathname === '/run-workflow') {
    return runWorkflow(res);
  }

  if (req.method === 'GET') {
    return serveStatic(req, res, pathname);
  }

  sendJson(res, 405, { error: 'Method not allowed' });
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE' && retries < MAX_PORT_RETRIES) {
    const nextPort = currentPort + 1;
    retries += 1;
    console.warn(`Porta ${currentPort} em uso. Tentando porta ${nextPort}...`);
    currentPort = nextPort;
    return server.listen(currentPort);
  }

  console.error('Falha ao iniciar servidor:', error);
  process.exit(1);
});

server.listen(currentPort, () => {
  console.log(`Servidor iniciado em http://localhost:${currentPort}`);
});
