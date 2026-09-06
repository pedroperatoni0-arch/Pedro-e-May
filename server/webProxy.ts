import { Request, Response } from 'express';

// In-memory cookie store per hostname to preserve sessions, tokens, and CSRF cookies across dynamic navigation
interface CookieStore {
  [name: string]: string;
}
const domainCookies = new Map<string, CookieStore>();

function getCookieHeader(hostname: string): string {
  const store = domainCookies.get(hostname);
  if (!store) return '';
  return Object.entries(store)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function updateCookies(hostname: string, response: globalThis.Response) {
  let store = domainCookies.get(hostname);
  if (!store) {
    store = {};
    domainCookies.set(hostname, store);
  }

  let cookieHeaders: string[] = [];
  if (typeof (response.headers as any).getSetCookie === 'function') {
    cookieHeaders = (response.headers as any).getSetCookie();
  } else {
    const raw = response.headers.get('set-cookie');
    if (raw) cookieHeaders = [raw];
  }

  for (const header of cookieHeaders) {
    const [pair] = header.split(';');
    const eqIdx = pair.indexOf('=');
    if (eqIdx > 0) {
      const key = pair.slice(0, eqIdx).trim();
      const val = pair.slice(eqIdx + 1).trim();
      if (val === '' || header.toLowerCase().includes('max-age=0') || header.includes('1970')) {
        delete store[key];
      } else {
        store[key] = val;
      }
    }
  }
}

export async function handleWebProxy(req: Request, res: Response) {
  // CORS Preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const targetUrl = (req.query.url as string) || (req.body?.url as string);
  if (!targetUrl) {
    return res.status(400).send('URL é obrigatória.');
  }

  try {
    let refHeader = (req.query.ref as string) || '';
    if (!refHeader && req.headers.referer) {
      try {
        const refUrl = new URL(req.headers.referer);
        const innerUrl = refUrl.searchParams.get('url');
        refHeader = innerUrl || '';
      } catch {
        refHeader = '';
      }
    }

    let parsedUrl: URL;
    try {
      const baseUrl = refHeader ? new URL(refHeader) : undefined;
      parsedUrl = new URL(targetUrl, baseUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return res.status(400).send('Protocolo inválido. Apenas HTTP e HTTPS são suportados.');
      }
    } catch {
      return res.status(400).send('URL inválida.');
    }

    if (!refHeader) {
      refHeader = parsedUrl.origin + '/';
    }

    const outgoingHeaders: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 14; Mobile; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      Accept:
        req.headers.accept ||
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,application/json,*/*;q=0.8',
      'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
      'Sec-Ch-Ua-Mobile': '?1',
      'Sec-Ch-Ua-Platform': '"Android"',
      Referer: refHeader,
      Origin: parsedUrl.origin,
    };

    // Attach stored cookies for this domain
    const cookieString = getCookieHeader(parsedUrl.hostname);
    if (cookieString) {
      outgoingHeaders['Cookie'] = cookieString;
    }

    if (req.headers['x-requested-with']) {
      outgoingHeaders['X-Requested-With'] = req.headers['x-requested-with'] as string;
    }

    const fetchOptions: RequestInit = {
      method: req.method,
      headers: outgoingHeaders,
      redirect: 'follow',
    };

    // Forward POST / PUT body
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const incomingContentType = (req.headers['content-type'] || '') as string;
      if (typeof req.body === 'string' && req.body.length > 0) {
        if (incomingContentType) outgoingHeaders['Content-Type'] = incomingContentType;
        fetchOptions.body = req.body;
      } else if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        if (incomingContentType.includes('application/json')) {
          outgoingHeaders['Content-Type'] = 'application/json';
          fetchOptions.body = JSON.stringify(req.body);
        } else {
          outgoingHeaders['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
          fetchOptions.body = new URLSearchParams(req.body as Record<string, string>).toString();
        }
      }
    }

    const response = await fetch(parsedUrl.toString(), fetchOptions);

    // Save cookies from response
    updateCookies(parsedUrl.hostname, response);

    const finalUrl = response.url || parsedUrl.toString();
    const contentType = response.headers.get('content-type') || 'text/html';

    // Strip anti-framing and security headers
    res.status(response.status);
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Content-Security-Policy-Report-Only');
    res.removeHeader('Cross-Origin-Embedder-Policy');
    res.removeHeader('Cross-Origin-Opener-Policy');
    res.removeHeader('Cross-Origin-Resource-Policy');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');

    // Absolute application origin for proxying requests safely without base-href collision
    const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
    const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
    const appOrigin = `${proto}://${host}`;
    const PROXY_PATH = `${appOrigin}/api/cineminha/web-proxy?url=`;

    // Handle HLS Playlists (.m3u8) to fix relative stream chunks and bypass CORS on segments
    if (
      contentType.includes('mpegurl') ||
      contentType.includes('application/x-mpegURL') ||
      parsedUrl.pathname.endsWith('.m3u8')
    ) {
      let m3u8Text = await response.text();
      m3u8Text = m3u8Text.replace(/URI=["']([^"']+)["']/g, (m, uri) => {
        try {
          const resolved = new URL(uri, finalUrl).toString();
          return `URI="${PROXY_PATH}${encodeURIComponent(resolved)}&ref=${encodeURIComponent(finalUrl)}"`;
        } catch {
          return m;
        }
      });

      const lines = m3u8Text.split('\n');
      const rewritten = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        try {
          const resolved = new URL(trimmed, finalUrl).toString();
          return `${PROXY_PATH}${encodeURIComponent(resolved)}&ref=${encodeURIComponent(finalUrl)}`;
        } catch {
          return line;
        }
      });
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      return res.send(rewritten.join('\n'));
    }

    // Handle JSON or JSON-like API responses (like /api getPlayer or vaiquecol /player/index.php)
    const isJsonHeader =
      contentType.includes('application/json') || contentType.includes('text/json');
    if (
      isJsonHeader ||
      parsedUrl.pathname.endsWith('/api') ||
      parsedUrl.pathname.includes('/index.php')
    ) {
      const rawText = await response.text();
      const trimmed = rawText.trim();
      if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ) {
        try {
          const jsonObj = JSON.parse(trimmed);

          // 1. Plenoflu style: data.video_url (base64 or plain)
          if (jsonObj && jsonObj.data && typeof jsonObj.data.video_url === 'string') {
            let val = jsonObj.data.video_url;
            let isB64 = false;
            try {
              const decoded = Buffer.from(val, 'base64').toString('utf-8');
              if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
                val = decoded;
                isB64 = true;
              }
            } catch {}

            if (val.startsWith('http://') || val.startsWith('https://')) {
              const effectiveRef = (req.query.ref as string) || finalUrl;
              const proxied = `${PROXY_PATH}${encodeURIComponent(val)}&ref=${encodeURIComponent(effectiveRef)}`;
              jsonObj.data.video_url = isB64 ? Buffer.from(proxied).toString('base64') : proxied;
            }
          }

          // 2. vaiquecol / fireplayer style: securedLink, videoSource
          if (
            jsonObj &&
            typeof jsonObj.securedLink === 'string' &&
            jsonObj.securedLink.startsWith('http')
          ) {
            jsonObj.securedLink = `${PROXY_PATH}${encodeURIComponent(jsonObj.securedLink)}&ref=${encodeURIComponent(finalUrl)}`;
          }
          if (
            jsonObj &&
            typeof jsonObj.videoSource === 'string' &&
            jsonObj.videoSource.startsWith('http')
          ) {
            jsonObj.videoSource = `${PROXY_PATH}${encodeURIComponent(jsonObj.videoSource)}&ref=${encodeURIComponent(finalUrl)}`;
          }

          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          return res.send(JSON.stringify(jsonObj));
        } catch {
          // If JSON parse failed, fall through to text/html or generic handler
        }
      }
      if (isJsonHeader) {
        res.setHeader('Content-Type', contentType);
        return res.send(rawText);
      }
    }

    // Handle HTML
    if (contentType.includes('text/html')) {
      let html = await response.text();

      // Check if it is JSON disguised as text/html
      const trimmed = html.trim();
      if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ) {
        try {
          const jsonObj = JSON.parse(trimmed);
          if (
            jsonObj &&
            typeof jsonObj.securedLink === 'string' &&
            jsonObj.securedLink.startsWith('http')
          ) {
            jsonObj.securedLink = `${PROXY_PATH}${encodeURIComponent(jsonObj.securedLink)}&ref=${encodeURIComponent(finalUrl)}`;
          }
          if (
            jsonObj &&
            typeof jsonObj.videoSource === 'string' &&
            jsonObj.videoSource.startsWith('http')
          ) {
            jsonObj.videoSource = `${PROXY_PATH}${encodeURIComponent(jsonObj.videoSource)}&ref=${encodeURIComponent(finalUrl)}`;
          }
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          return res.send(JSON.stringify(jsonObj));
        } catch {}
      }

      // Remove meta tags that enforce CSP inside the document
      html = html.replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');

      html = html.replace(/<iframe\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*?)>/gi, (match, prefix, src, suffix) => {
        if (src.startsWith('about:') || src.startsWith('javascript:') || src.includes('/api/cineminha/web-proxy')) {
          return match;
        }
        try {
          const resolvedSrc = new URL(src, finalUrl).toString();
          return `<iframe${prefix}src="${PROXY_PATH}${encodeURIComponent(resolvedSrc)}&ref=${encodeURIComponent(finalUrl)}"${suffix}>`;
        } catch {
          return match;
        }
      });

      // Neutralize scripts that redirect to 404 or bust frames
      html = html.replace(/devtoolsDetector\.lanuch\(\)/gi, '/* neutralized */');
      html = html.replace(/document\.location\.href\s*=\s*["']\/404\.php["']/gi, '/* neutralized */');

      const baseTag = `<base href="${finalUrl}">`;

      // Injected client bridge script
      const scriptTag = `
        <script>
          (function() {
            var TARGET_BASE = ${JSON.stringify(finalUrl)};
            var APP_ORIGIN = (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null')
              ? window.location.origin
              : ${JSON.stringify(appOrigin)};
            var PROXY_URL = APP_ORIGIN + '/api/cineminha/web-proxy?url=';

            // Neutralize devtools detector and modal traps
            try {
              window.devtoolsDetector = {
                addListener: function() {},
                lanuch: function() {},
                launch: function() {},
                isLaunch: function() { return false; },
                stop: function() {}
              };
              window.alert = function() {};
              window.confirm = function() { return true; };
              window.prompt = function() { return null; };
            } catch(e) {}

            // Extract the real target if a URL was inadvertently prefixed by another domain
            function sanitizeTargetUrl(url) {
              if (!url || typeof url !== 'string') return url;
              var proxyIdx = url.indexOf('/api/cineminha/web-proxy');
              if (proxyIdx !== -1) {
                try {
                  var urlObj = new URL(url.startsWith('http') ? url : (APP_ORIGIN + (url.startsWith('/') ? '' : '/') + url));
                  var inner = urlObj.searchParams.get('url');
                  if (inner) return inner;
                } catch(e) {}
              }
              return url;
            }

            function resolveUrl(url) {
              if (!url || typeof url !== 'string') return url;
              url = sanitizeTargetUrl(url);
              if (url.startsWith(PROXY_URL) || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('javascript:')) {
                return url;
              }
              try {
                return new URL(url, TARGET_BASE).toString();
              } catch(e) {
                return url;
              }
            }

            function toProxyUrl(target, ref) {
              if (!target || typeof target !== 'string') return target;
              target = sanitizeTargetUrl(target);
              if (target.startsWith('data:') || target.startsWith('blob:') || target.startsWith('javascript:') || target.startsWith('about:')) {
                return target;
              }
              if (target.startsWith(PROXY_URL)) {
                return target;
              }
              var resolved = resolveUrl(target);
              if (resolved.startsWith(PROXY_URL)) {
                return resolved;
              }
              var proxied = PROXY_URL + encodeURIComponent(resolved);
              var r = ref || TARGET_BASE;
              if (r) {
                proxied += '&ref=' + encodeURIComponent(r);
              }
              return proxied;
            }

            function notifyPlayer(url) {
              try {
                if (!url || typeof url !== 'string') return;
                var cleaned = sanitizeTargetUrl(url);
                var resolved = resolveUrl(cleaned);
                var msg = {
                  type: 'cineminha:player-detected',
                  playerUrl: resolved,
                  pageUrl: TARGET_BASE,
                  title: document.title || ''
                };
                if (window.parent && window.parent !== window) {
                  window.parent.postMessage(msg, '*');
                }
                if (window.top && window.top !== window && window.top !== window.parent) {
                  window.top.postMessage(msg, '*');
                }
              } catch(e) {}
            }

            // HTML string rewriter for iframes
            function rewriteIframeHtml(str) {
              if (!str || typeof str !== 'string') return str;
              return str.replace(/<iframe\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*?)>/gi, function(match, prefix, src, suffix) {
                if (src.startsWith('about:') || src.startsWith('javascript:') || src.startsWith('data:') || src.startsWith('blob:')) {
                  return match;
                }
                var cleaned = sanitizeTargetUrl(src);
                if (cleaned.startsWith(PROXY_URL)) {
                  return match;
                }
                notifyPlayer(cleaned);
                var proxied = toProxyUrl(cleaned, TARGET_BASE);
                return '<iframe' + prefix + 'src="' + proxied + '"' + suffix + '>';
              });
            }

            // Hook window.atob (crucial for sites that decode video/player URL via base64, e.g. plenoflu)
            try {
              var origAtob = window.atob;
              window.atob = function(str) {
                var res = origAtob.call(this, str);
                try {
                  if (typeof res === 'string') {
                    var trimmed = res.trim();
                    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('//')) {
                      var cleaned = sanitizeTargetUrl(trimmed);
                      notifyPlayer(cleaned);
                      return toProxyUrl(cleaned, TARGET_BASE);
                    }
                  }
                } catch(e) {}
                return res;
              };
            } catch(e) {}

            // Hook Element.prototype.innerHTML
            try {
              var origInnerHtmlDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
              if (origInnerHtmlDesc && origInnerHtmlDesc.set) {
                Object.defineProperty(Element.prototype, 'innerHTML', {
                  get: function() {
                    return origInnerHtmlDesc.get.call(this);
                  },
                  set: function(val) {
                    try {
                      if (typeof val === 'string' && val.indexOf('<iframe') !== -1) {
                        val = rewriteIframeHtml(val);
                      }
                    } catch(e) {}
                    return origInnerHtmlDesc.set.call(this, val);
                  },
                  configurable: true,
                  enumerable: true
                });
              }
            } catch(e) {}

            // Hook Element.prototype.insertAdjacentHTML
            try {
              var origInsertAdjacentHTML = Element.prototype.insertAdjacentHTML;
              Element.prototype.insertAdjacentHTML = function(pos, text) {
                try {
                  if (typeof text === 'string' && text.indexOf('<iframe') !== -1) {
                    text = rewriteIframeHtml(text);
                  }
                } catch(e) {}
                return origInsertAdjacentHTML.call(this, pos, text);
              };
            } catch(e) {}

            // Hook Node.prototype.appendChild & insertBefore
            try {
              function rewriteNodeIframes(node) {
                if (!node || !node.nodeType) return;
                try {
                  if (node.nodeType === 1) {
                    if (node.tagName === 'IFRAME') {
                      var src = node.getAttribute('src');
                      if (src && !src.startsWith('about:') && !src.startsWith('javascript:') && !src.startsWith('data:') && !src.startsWith('blob:')) {
                        var cleaned = sanitizeTargetUrl(src);
                        if (!cleaned.startsWith(PROXY_URL)) {
                          notifyPlayer(cleaned);
                          var proxied = toProxyUrl(cleaned, TARGET_BASE);
                          node.src = proxied;
                          if (origSetAttr) origSetAttr.call(node, 'src', proxied);
                        }
                      }
                    } else if (node.querySelectorAll) {
                      var iframes = node.querySelectorAll('iframe');
                      for (var i = 0; i < iframes.length; i++) {
                        rewriteNodeIframes(iframes[i]);
                      }
                    }
                  } else if (node.nodeType === 11 && node.querySelectorAll) {
                    var iframes = node.querySelectorAll('iframe');
                    for (var j = 0; j < iframes.length; j++) {
                      rewriteNodeIframes(iframes[j]);
                    }
                  }
                } catch(e) {}
              }

              var origAppendChild = Node.prototype.appendChild;
              Node.prototype.appendChild = function(child) {
                rewriteNodeIframes(child);
                return origAppendChild.call(this, child);
              };

              var origInsertBefore = Node.prototype.insertBefore;
              Node.prototype.insertBefore = function(newNode, refNode) {
                rewriteNodeIframes(newNode);
                return origInsertBefore.call(this, newNode, refNode);
              };
            } catch(e) {}

            // Hook jQuery methods if loaded
            try {
              function patchJq(jq) {
                if (!jq || jq.__cineminhaHooked) return;
                jq.__cineminhaHooked = true;
                if (jq.fn) {
                  if (jq.fn.append) {
                    var origJqAppend = jq.fn.append;
                    jq.fn.append = function() {
                      for (var i = 0; i < arguments.length; i++) {
                        if (typeof arguments[i] === 'string' && arguments[i].indexOf('<iframe') !== -1) {
                          arguments[i] = rewriteIframeHtml(arguments[i]);
                        }
                      }
                      return origJqAppend.apply(this, arguments);
                    };
                  }
                  if (jq.fn.html) {
                    var origJqHtml = jq.fn.html;
                    jq.fn.html = function(val) {
                      if (typeof val === 'string' && val.indexOf('<iframe') !== -1) {
                        val = rewriteIframeHtml(val);
                      }
                      return origJqHtml.call(this, val);
                    };
                  }
                }
              }

              if (window.jQuery) patchJq(window.jQuery);
              if (window.$) patchJq(window.$);

              var _jqVal = window.jQuery;
              Object.defineProperty(window, 'jQuery', {
                configurable: true,
                get: function() { return _jqVal; },
                set: function(v) {
                  _jqVal = v;
                  try { patchJq(v); } catch(e) {}
                }
              });
            } catch(e) {}

            // 1. Intercept HTMLIFrameElement.prototype.src (CRITICAL for sites setting iframe.src = url)
            try {
              var iframeProto = HTMLIFrameElement.prototype;
              var origIframeSrcDesc = Object.getOwnPropertyDescriptor(iframeProto, 'src') ||
                                      Object.getOwnPropertyDescriptor(Element.prototype, 'src');
              if (origIframeSrcDesc && origIframeSrcDesc.set) {
                Object.defineProperty(iframeProto, 'src', {
                  get: function() {
                    return origIframeSrcDesc.get.call(this);
                  },
                  set: function(val) {
                    try {
                      if (typeof val === 'string' && val.trim() !== '') {
                        var cleaned = sanitizeTargetUrl(val);
                        if (cleaned.startsWith(PROXY_URL)) {
                          return origIframeSrcDesc.set.call(this, cleaned);
                        }
                        notifyPlayer(cleaned);
                        var proxied = toProxyUrl(cleaned, TARGET_BASE);
                        return origIframeSrcDesc.set.call(this, proxied);
                      }
                    } catch(e) {}
                    return origIframeSrcDesc.set.call(this, val);
                  },
                  configurable: true,
                  enumerable: true
                });
              }
            } catch(e) {
              console.warn('[Cineminha] Iframe prototype patch error:', e);
            }

            // 2. Intercept Element.prototype.setAttribute & setAttributeNS
            try {
              var origSetAttr = Element.prototype.setAttribute;
              Element.prototype.setAttribute = function(name, val) {
                try {
                  if (this && this.tagName === 'IFRAME' && name && name.toLowerCase() === 'src' && typeof val === 'string' && val.trim() !== '') {
                    var cleaned = sanitizeTargetUrl(val);
                    if (!cleaned.startsWith(PROXY_URL)) {
                      notifyPlayer(cleaned);
                      val = toProxyUrl(cleaned, TARGET_BASE);
                    }
                  }
                } catch(e) {}
                return origSetAttr.call(this, name, val);
              };

              var origSetAttrNS = Element.prototype.setAttributeNS;
              Element.prototype.setAttributeNS = function(ns, name, val) {
                try {
                  if (this && this.tagName === 'IFRAME' && name && name.toLowerCase() === 'src' && typeof val === 'string' && val.trim() !== '') {
                    var cleaned = sanitizeTargetUrl(val);
                    if (!cleaned.startsWith(PROXY_URL)) {
                      notifyPlayer(cleaned);
                      val = toProxyUrl(cleaned, TARGET_BASE);
                    }
                  }
                } catch(e) {}
                return origSetAttrNS.call(this, ns, name, val);
              };
            } catch(e) {}

            // 3. Monkey-patch window.fetch for dynamic AJAX search and sources
            var origFetch = window.fetch;
            window.fetch = function(input, init) {
              try {
                var rawUrl = '';
                if (typeof input === 'string') {
                  rawUrl = input;
                } else if (input && typeof input === 'object' && input.url) {
                  rawUrl = input.url;
                }
                if (rawUrl && !rawUrl.startsWith('data:') && !rawUrl.startsWith('blob:')) {
                  var cleaned = sanitizeTargetUrl(rawUrl);
                  if (!cleaned.startsWith(PROXY_URL)) {
                    var resolved = resolveUrl(cleaned);
                    var proxied = toProxyUrl(resolved, TARGET_BASE);
                    if (typeof input === 'string') {
                      return origFetch.call(this, proxied, init);
                    } else if (input instanceof Request) {
                      var newReq = new Request(proxied, input);
                      return origFetch.call(this, newReq, init);
                    }
                  }
                }
              } catch(err) {}
              return origFetch.apply(this, arguments);
            };

            // 4. Monkey-patch XMLHttpRequest.prototype.open
            var origOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url) {
              var rest = Array.prototype.slice.call(arguments, 2);
              try {
                if (typeof url === 'string' && !url.startsWith('data:') && !url.startsWith('blob:')) {
                  var cleaned = sanitizeTargetUrl(url);
                  if (!cleaned.startsWith(PROXY_URL)) {
                    var resolved = resolveUrl(cleaned);
                    var proxied = toProxyUrl(resolved, TARGET_BASE);
                    return origOpen.apply(this, [method, proxied].concat(rest));
                  }
                }
              } catch(err) {}
              return origOpen.apply(this, arguments);
            };

            // 5. Intercept Form Submissions (for search bars and query forms)
            document.addEventListener('submit', function(e) {
              var form = e.target;
              if (form && form.tagName === 'FORM') {
                var method = (form.method || 'GET').toUpperCase();
                var rawAction = form.getAttribute('action') || '';
                var resolvedAction = resolveUrl(rawAction || TARGET_BASE);

                if (method === 'GET') {
                  e.preventDefault();
                  var formData = new FormData(form);
                  var params = new URLSearchParams(formData).toString();
                  var fullTarget = resolvedAction.indexOf('?') !== -1
                    ? (resolvedAction + '&' + params)
                    : (resolvedAction + '?' + params);

                  try {
                    window.parent.postMessage({ type: 'cineminha:navigate', url: fullTarget }, '*');
                  } catch(err) {
                    window.location.href = toProxyUrl(fullTarget, TARGET_BASE);
                  }
                } else {
                  form.action = toProxyUrl(resolvedAction, TARGET_BASE);
                }
              }
            }, true);

            // 6. Intercept Link Clicks
            document.addEventListener('click', function(e) {
              var target = e.target;
              while (target && target.tagName !== 'A') {
                target = target.parentElement;
              }
              if (target && target.href && !target.href.startsWith('javascript:') && !target.href.startsWith('#')) {
                var rawHref = target.getAttribute('href') || target.href;
                // Ignore empty or dummy links
                if (!rawHref || rawHref === '#' || rawHref.startsWith('javascript:')) return;
                e.preventDefault();
                var resolved = resolveUrl(rawHref);
                try {
                  window.parent.postMessage({ type: 'cineminha:navigate', url: resolved }, '*');
                } catch(err) {
                  window.location.href = toProxyUrl(resolved, TARGET_BASE);
                }
              }
            }, true);

            // 7. Dynamic iframe patching & MutationObserver
            function patchIframe(el) {
              try {
                if (!el || el.dataset.cineminhaProxied) return;
                var raw = el.getAttribute('src');
                if (raw && !raw.startsWith('about:') && !raw.startsWith('javascript:')) {
                  var cleaned = sanitizeTargetUrl(raw);
                  if (cleaned.startsWith(PROXY_URL)) {
                    el.dataset.cineminhaProxied = 'true';
                    return;
                  }
                  el.dataset.cineminhaProxied = 'true';
                  notifyPlayer(cleaned);
                  var proxied = toProxyUrl(cleaned, TARGET_BASE);
                  el.src = proxied;
                  if (origSetAttr) origSetAttr.call(el, 'src', proxied);
                }
              } catch(e) {}
            }

            function scanAllIframes() {
              try {
                var iframes = document.getElementsByTagName('iframe');
                for (var i = 0; i < iframes.length; i++) {
                  patchIframe(iframes[i]);
                }
              } catch(e) {}
            }

            scanAllIframes();
            document.addEventListener('DOMContentLoaded', scanAllIframes);
            window.addEventListener('load', scanAllIframes);
            var scanTimer = setInterval(scanAllIframes, 400);
            setTimeout(function() { clearInterval(scanTimer); }, 15000);

            try {
              var observer = new MutationObserver(function(mutations) {
                for (var i = 0; i < mutations.length; i++) {
                  var m = mutations[i];
                  if (m.type === 'childList') {
                    for (var j = 0; j < m.addedNodes.length; j++) {
                      var node = m.addedNodes[j];
                      if (node.nodeType === 1) {
                        if (node.tagName === 'IFRAME') patchIframe(node);
                        var childIframes = node.getElementsByTagName ? node.getElementsByTagName('iframe') : [];
                        for (var k = 0; k < childIframes.length; k++) patchIframe(childIframes[k]);
                      }
                    }
                  } else if (m.type === 'attributes' && m.attributeName === 'src') {
                    if (m.target && m.target.tagName === 'IFRAME') {
                      patchIframe(m.target);
                    }
                  }
                }
              });
              observer.observe(document.documentElement || document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['src']
              });
            } catch(e) {}

            // 8. Prevent unwanted ad popups while preserving smooth video navigation
            try {
              window.open = function() {
                console.log('[Cineminha] Ad popup blocked');
                return null;
              };
            } catch(e) {}

            // 9. Notify parent of page loaded & title
            try {
              window.parent.postMessage({
                type: 'cineminha:page-loaded',
                url: TARGET_BASE,
                title: document.title || TARGET_BASE
              }, '*');
            } catch(e) {}

            // 10. Video tag playback detector
            document.addEventListener('play', function(e) {
              var v = e.target;
              if (v && v.tagName === 'VIDEO') {
                var src = v.currentSrc || v.src || TARGET_BASE;
                try {
                  window.parent.postMessage({
                    type: 'cineminha:video-detected',
                    videoUrl: src,
                    pageUrl: TARGET_BASE,
                    title: document.title
                  }, '*');
                } catch(err) {}
              }
            }, true);
          })();
        </script>
      `;

      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>${baseTag}${scriptTag}`);
      } else if (html.includes('<html>')) {
        html = html.replace('<html>', `<html><head>${baseTag}${scriptTag}</head>`);
      } else {
        html = `${baseTag}${scriptTag}${html}`;
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    }

    // Binary / Stream / JSON / Other assets
    res.setHeader('Content-Type', contentType);
    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    console.error('[WebProxy] Error fetching:', targetUrl, err?.message || err);
    res.status(502).send(`
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>Erro de Conexão</title></head>
        <body style="font-family:sans-serif; background:#020617; color:#f8fafc; padding:40px 20px; text-align:center;">
          <h2 style="font-size:18px; margin-bottom:8px;">Não foi possível carregar a página</h2>
          <p style="color:#94a3b8; font-size:13px; max-width:400px; margin:0 auto 16px;">
            ${err?.message || 'O site solicitado recusou a conexão ou demorou para responder.'}
          </p>
        </body>
      </html>
    `);
  }
}
