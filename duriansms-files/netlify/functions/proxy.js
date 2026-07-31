// netlify/functions/proxy.js
// Server-side proxy — bypasses CORS completely
// Deployed on Netlify, called by the browser panel

const https = require('https');
const http = require('http');

exports.handler = async function(event, context) {
  // Only allow GET
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // The target API URL is passed as ?url=...
  const targetUrl = event.queryStringParameters && event.queryStringParameters.url;
  if (!targetUrl) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing ?url= parameter' }) };
  }

  // Security: only allow calls to durianrcs.com
  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid URL' }) };
  }

  if (!parsedUrl.hostname.endsWith('durianrcs.com')) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden host' }) };
  }

  // Make the actual request server-side (no CORS issue)
  try {
    const data = await fetchUrl(targetUrl);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      },
      body: data
    };
  } catch(e) {
    return {
      statusCode: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Upstream request failed', detail: e.message })
    };
  }
};

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (DurianSMS Panel)',
        'Accept': 'application/json'
      },
      timeout: 15000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}
