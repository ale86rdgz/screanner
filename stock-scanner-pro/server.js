const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch {};
const STATIC = __dirname;
const INDEX = path.join(STATIC, 'index.html');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
};

let crumb = '';
let cookie = '';

function getCrumb() {
  return new Promise((resolve, reject) => {
    https.get('https://fc.yahoo.com/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }, (r1) => {
      const cArr = r1.headers['set-cookie'] || [];
      const ck = cArr.join('; ');
      let d1 = '';
      r1.on('data', c => d1 += c);
      r1.on('end', () => {
        https.get('https://query2.finance.yahoo.com/v1/test/getcrumb', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Cookie': ck,
            'Accept': 'text/plain',
          }
        }, (r2) => {
          let cr = '';
          r2.on('data', c => cr += c);
          r2.on('end', () => {
            crumb = cr.trim();
            cookie = ck;
            console.log(`  Crumb obtained: ${crumb}`);
            resolve();
          });
        }).on('error', reject);
      });
    }).on('error', reject);
  });
}

function fetchYahoo(path, useCrumb) {
  return new Promise((resolve, reject) => {
    const host = 'query1.finance.yahoo.com';
    const suffix = useCrumb ? `&crumb=${crumb}` : '';
    const opts = {
      hostname: host,
      path: path + suffix,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...(useCrumb && cookie ? { 'Cookie': cookie } : {}),
      }
    };
    https.get(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0,100)}`));
        } else {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Invalid JSON')); }
        }
      });
    }).on('error', reject);
  });
}

async function handleRequest(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = req.url.split('?')[0];

  try {
    // Chart data (no crumb needed)
    if (url === '/api/chart') {
      const params = new URL(req.url, `http://localhost:${PORT}`).searchParams;
      const ticker = params.get('ticker');
      if (!ticker) { res.writeHead(400); res.end('{}'); return; }
      const range = params.get('range') || '1y';
      const interval = params.get('interval') || '1d';
      const data = await fetchYahoo(`/v8/finance/chart/${ticker}?range=${range}&interval=${interval}`, false);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    // Fundamentals (needs crumb)
    if (url === '/api/fundamentals') {
      const ticker = new URL(req.url, `http://localhost:${PORT}`).searchParams.get('ticker');
      if (!ticker) { res.writeHead(400); res.end('{}'); return; }

      try {
        const modules = 'assetProfile,financialData,defaultKeyStatistics,summaryDetail,price';
        const data = await fetchYahoo(`/v10/finance/quoteSummary/${ticker}?modules=${modules}`, true);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } catch (err) {
        // If crumb expired, refresh and retry once
        if (err.message.includes('401') || err.message.includes('Invalid Crumb')) {
          await getCrumb();
          const modules = 'assetProfile,financialData,defaultKeyStatistics,summaryDetail,price';
          const data = await fetchYahoo(`/v10/finance/quoteSummary/${ticker}?modules=${modules}`, true);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      }
      return;
    }

    // Email report
    if (url === '/api/send-email') {
      if (!nodemailer) { res.writeHead(200, { 'Content-Type' : 'application/json' }); res.end(JSON.stringify({ error: 'nodemailer not installed' })); return; }
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const { html, email, password, smtpHost, smtpPort, smtpSecure } = JSON.parse(body);
          if (!html || !email || !password) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing required fields' })); return; }
          const transporter = nodemailer.createTransport({
            host: smtpHost || 'smtp.gmail.com',
            port: smtpPort || 587,
            secure: smtpSecure || false,
            auth: { user: email, pass: password },
          });
          const now = new Date();
          const dateStr = now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
          await transporter.sendMail({
            from: `"S&P500 Scanner" <${email}>`,
            to: email,
            subject: `Informe de Oportunidades S&P 500 - ${dateStr}`,
            html,
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // Save email config
    if (url === '/api/save-email-config') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const config = JSON.parse(body);
          fs.writeFileSync(path.join(__dirname, 'email-config.json'), JSON.stringify(config, null, 2));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // Get email config
    if (url === '/api/get-email-config') {
      const configPath = path.join(__dirname, 'email-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ configured: true, email: config.email || '', smtpHost: config.smtpHost || '', smtpPort: config.smtpPort || 587 }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ configured: false }));
      }
      return;
    }

    // Generic Yahoo Finance proxy
    if (url === '/api/yahoo') {
      const target = new URL(req.url, `http://localhost:${PORT}`).searchParams.get('url');
      if (!target) { res.writeHead(400); res.end('{}'); return; }
      const useCrumb = target.includes('quoteSummary');
      const parsed = new URL(decodeURIComponent(target));
      const data = await fetchYahoo(parsed.pathname + parsed.search, useCrumb);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    // Serve static files
    let filePath = req.url === '/' ? INDEX : path.join(STATIC, req.url.split('?')[0]);
    if (!filePath.startsWith(STATIC)) { res.writeHead(403); res.end(); return; }
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);

  } catch (err) {
    if (url.startsWith('/api/')) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    } else {
      res.writeHead(500);
      res.end('Server error');
    }
  }
}

async function main() {
  console.log(`\n  S&P500 Opportunity Scanner Pro\n`);
  console.log(`  Initializing Yahoo Finance connection...`);
  try {
    await getCrumb();
    console.log(`  Ready!\n`);
  } catch (e) {
    console.log(`  Warning: Could not get crumb: ${e.message}`);
    console.log(`  Fundamental data may be limited.\n`);
  }
  console.log(`  Open http://localhost:${PORT} in your browser\n`);
  http.createServer(handleRequest).listen(PORT);
  // Refresh crumb every 30 minutes
  setInterval(() => getCrumb().catch(() => {}), 30 * 60 * 1000);
}

main();