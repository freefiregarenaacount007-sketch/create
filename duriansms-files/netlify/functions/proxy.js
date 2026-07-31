// netlify/functions/proxy.js
const https = require('https');
const http = require('http');

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const targetUrl = event.queryStringParameters && event.queryStringParameters.url;
  if (!targetUrl) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing ?url= parameter' }) };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid URL' }) };
  }

  if (!parsedUrl.hostname.endsWith('durianrcs.com')) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden host' }) };
  }

  try {
    const data = await fetchUrl(targetUrl, 5);
    // Validate it's JSON
    try {
      JSON.parse(data);
    } catch(e) {
      return {
        statusCode: 502,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'API returned non-JSON', raw: data.substring(0, 200) })
      };
    }
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
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Upstream request failed', detail: e.message })
    };
  }
};

function fetchUrl(url, maxRedirects) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) {
      return reject(new Error('Too many redirects'));
    }
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DurianSMS/1.0)',
        'Accept': 'application/json, */*'
      },
      timeout: 15000
    }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).toString();
        res.resume();
        return resolve(fetchUrl(redirectUrl, maxRedirects - 1));
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}
