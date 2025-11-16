const ACTIVE_REQUESTS = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'switch-account') {
    const key = `${message.payload?.origin}-${message.payload?.accountId}`;
    const task = handleSwitchRequest(message.payload)
      .then((result) => {
        ACTIVE_REQUESTS.delete(key);
        sendResponse(result);
      })
      .catch((error) => {
        ACTIVE_REQUESTS.delete(key);
        sendResponse({ error: error.message || 'Failed to switch account.' });
      });
    ACTIVE_REQUESTS.set(key, task);
    return true; // Keep the message channel open for async work
  }
  if (message?.type === 'fetch-cookies') {
    handleFetchCookiesRequest(message.payload)
      .then((cookies) => sendResponse({ cookies }))
      .catch((error) => sendResponse({ error: error.message || 'Unable to fetch cookies.' }));
    return true;
  }
  return false;
});

async function handleSwitchRequest(payload = {}) {
  const { origin, cookies } = payload;
  if (!origin) {
    throw new Error('Site origin missing. Save the site before switching.');
  }
  if (!Array.isArray(cookies) || !cookies.length) {
    throw new Error('Account has no cookies to apply.');
  }
  const url = new URL(origin);
  const domain = url.hostname;
  await clearExistingCookies(domain);
  await applyCookies(origin, cookies);
  await reloadMatchingTabs(origin);
  return { success: true };
}

async function clearExistingCookies(domain) {
  const existing = await chrome.cookies.getAll({ domain });
  const tasks = existing.map((cookie) =>
    chrome.cookies.remove(
      (() => {
        const details = {
          name: cookie.name,
          url: buildCookieUrl({
            domain: cookie.domain || domain,
            secure: cookie.secure,
            path: cookie.path
          })
        };
        if (cookie.storeId) {
          details.storeId = cookie.storeId;
        }
        return details;
      })()
    )
  );
  await Promise.all(tasks);
}

async function applyCookies(origin, cookies) {
  const originUrl = new URL(origin);
  const tasks = cookies.map((cookie) => {
    const cookieName = cookie.name || '';
    const isHostCookie = Boolean(cookie.hostOnly) || cookieName.startsWith('__Host-');
    const requiresSecure = cookieName.startsWith('__Host-') || cookieName.startsWith('__Secure-');
    const secure = requiresSecure ? true : Boolean(cookie.secure ?? originUrl.protocol === 'https:');
    const fallbackHost = originUrl.hostname;
    const storedDomain = (cookie.domain || '').trim();
    const normalizedHost = (isHostCookie ? storedDomain : storedDomain.replace(/^\./, '')) || fallbackHost;
    const rawPath = cookie.path || '/';
    const normalizedPath = isHostCookie ? '/' : rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    const cookieUrl = buildCookieUrl({
      domain: normalizedHost,
      secure,
      path: normalizedPath
    });
    const details = {
      url: cookieUrl,
      name: cookieName,
      value: cookie.value,
      path: normalizedPath,
      secure,
      httpOnly: Boolean(cookie.httpOnly)
    };
    if (!isHostCookie) {
      details.domain = storedDomain || `.${fallbackHost}`;
    }
    if (cookie.storeId) {
      details.storeId = cookie.storeId;
    }
    if (cookie.partitionKey) {
      details.partitionKey = cookie.partitionKey;
    }
    if (cookie.sameSite) {
      details.sameSite = cookie.sameSite;
    }
    if (cookie.priority) {
      details.priority = cookie.priority;
    }
    if (cookie.expirationDate) {
      details.expirationDate = cookie.expirationDate;
    }
    return chrome.cookies.set(details);
  });
  await Promise.all(tasks);
}

async function reloadMatchingTabs(origin) {
  const url = new URL(origin);
  const tabs = await chrome.tabs.query({});
  const matches = tabs.filter((tab) => {
    if (!tab.url) return false;
    try {
      const tabUrl = new URL(tab.url);
      return tabUrl.hostname === url.hostname;
    } catch (err) {
      return false;
    }
  });
  if (!matches.length) {
    await chrome.tabs.create({ url: origin });
    return;
  }
  await Promise.all(
    matches
      .filter((tab) => typeof tab.id === 'number')
      .map((tab) => chrome.tabs.reload(tab.id))
  );
}

function buildCookieUrl({ domain, secure, path }) {
  const protocol = secure ? 'https:' : 'http:';
  const cleanDomain = (domain || '').replace(/^\./, '');
  const safePath = path && path.startsWith('/') ? path : '/';
  return `${protocol}//${cleanDomain || 'localhost'}${safePath}`;
}

async function handleFetchCookiesRequest(payload = {}) {
  const origin = payload.origin;
  if (!origin) {
    throw new Error('Select or save a site first.');
  }
  const domain = new URL(origin).hostname;
  const query = { domain };
  if (payload.tabId) {
    const storeId = await resolveStoreIdFromTab(payload.tabId);
    if (storeId) {
      query.storeId = storeId;
    }
  }
  const cookies = await chrome.cookies.getAll(query);
  return cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    hostOnly: cookie.hostOnly,
    expirationDate: cookie.expirationDate,
    sameSite: cookie.sameSite,
    priority: cookie.priority,
    storeId: cookie.storeId,
    partitionKey: cookie.partitionKey,
    session: cookie.session
  }));
}

async function resolveStoreIdFromTab(tabId) {
  if (typeof tabId !== 'number') {
    return null;
  }
  const stores = await chrome.cookies.getAllCookieStores();
  const targetStore = stores.find((store) => Array.isArray(store.tabIds) && store.tabIds.includes(tabId));
  return targetStore ? targetStore.id : null;
}
