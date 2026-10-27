const http = require('http');
const https = require('https');
const PORT = process.env.PORT || 3000;
const INSITU_HOST = 'app.b2bmobilesales.com';

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'ARB Autocare inSitu Proxy' }));
    return;
  }

  if (req.url === '/partner-login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Bad request' }));
        return;
      }

      const expectedCode = process.env.PARTNER_CODE || 'autoglym';
      if (payload.access_code !== expectedCode) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Invalid access code' }));
        return;
      }

      const email = process.env.INSITU_EMAIL || 'rbunston@arbautocare.com';
      const password = process.env.INSITU_PASSWORD || 'Wales4ever!'; // note: no @ at the end

      // FIXED: inSitu mobile login expects "login", not "email"
      const loginBody = JSON.stringify({ login: email, password: password });

      const options = {
        hostname: INSITU_HOST,
        path: '/api/v1/users/mobile/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Content-Length': Buffer.byteLength(loginBody)
        }
      };

      const loginReq = https.request(options, (loginRes) => {
        let data = '';
        loginRes.on('data', chunk => { data += chunk; });
        loginRes.on('end', () => {
          res.writeHead(loginRes.statusCode, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(data);
        });
      });

      loginReq.on('error', () => {
        res.writeHead(502);
        res.end(JSON.stringify({ error: 'Could not reach inSitu' }));
      });

      loginReq.write(loginBody);
      loginReq.end();
    });
    return;
  }

  if (!req.url.startsWith('/api/')) {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const insituPath = req.url.replace(/^\/api/, '/api');
  console.log(`[${new Date().toISOString()}] ${req.method} ${insituPath}`);

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    const options = {
      hostname: INSITU_HOST,
      path: insituPath,
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      }
    };

    if (req.headers['authorization']) {
      options.headers['Authorization'] = req.headers['authorization'];
    }

    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const proxyReq = https.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => { data += chunk; });
      proxyRes.on('end', () => {
        res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
        res.end(data);
      });
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy error:', err.message);
      res.writeHead(502);
      res.end(JSON.stringify({ error: 'Could not reach inSitu', detail: err.message }));
    });

    if (body) proxyReq.write(body);
    proxyReq.end();
  });
});

server.listen(PORT, () => {
  console.log(`ARB Autocare inSitu Proxy running on port ${PORT}`);
});
