const siteSelect = document.getElementById('siteSelect');
const siteInput = document.getElementById('siteInput');
const siteStatus = document.getElementById('siteStatus');
const siteButtons = {
  save: document.getElementById('saveSiteBtn'),
  del: document.getElementById('deleteSiteBtn'),
  new: document.getElementById('newSiteBtn')
};

const accountsList = document.getElementById('accountsList');
const accountStatus = document.getElementById('accountStatus');
const accountFormTitle = document.getElementById('accountFormTitle');
const accountNameInput = document.getElementById('accountName');
const cookiesTableBody = document.querySelector('#cookiesTable tbody');
const addCookieRowBtn = document.getElementById('addCookieRowBtn');
const importCookiesBtn = document.getElementById('importCookiesBtn');
const saveAccountBtn = document.getElementById('saveAccountBtn');
const resetAccountBtn = document.getElementById('resetAccountForm');

let siteProfiles = {};
let currentSiteKey = null;
let editingAccountId = null;
const statusTimers = new WeakMap();

init();

function init() {
  bindEvents();
  loadProfiles();
}

function bindEvents() {
  siteSelect.addEventListener('change', () => {
    currentSiteKey = siteSelect.value || null;
    editingAccountId = null;
    updateSiteInput();
    resetAccountForm();
    renderAccounts();
  });

  siteButtons.new.addEventListener('click', () => {
    currentSiteKey = null;
    siteSelect.value = '';
    editingAccountId = null;
    updateSiteInput();
    resetAccountForm();
    renderAccounts();
    displayStatus(siteStatus, 'Started a new site profile.', 'info');
  });

  siteButtons.save.addEventListener('click', () => {
    const normalized = normalizeOrigin(siteInput.value.trim());
    if (!normalized) {
      displayStatus(siteStatus, 'Enter a valid URL such as https://example.com.', 'error');
      return;
    }
    const alreadyExists = siteProfiles[normalized];
    if (currentSiteKey && currentSiteKey !== normalized) {
      const siteData = siteProfiles[currentSiteKey] || { origin: normalized, accounts: [] };
      delete siteProfiles[currentSiteKey];
      siteData.origin = normalized;
      siteProfiles[normalized] = siteData;
    } else if (!alreadyExists) {
      siteProfiles[normalized] = { origin: normalized, accounts: [] };
    }
    currentSiteKey = normalized;
    persistProfiles();
    renderSiteOptions();
    renderAccounts();
    displayStatus(siteStatus, `Saved ${normalized}.`, 'success');
  });

  siteButtons.del.addEventListener('click', () => {
    if (!currentSiteKey) {
      displayStatus(siteStatus, 'Select a site to delete.', 'error');
      return;
    }
    if (!confirm('Delete this site and all saved accounts?')) {
      return;
    }
    delete siteProfiles[currentSiteKey];
    currentSiteKey = Object.keys(siteProfiles)[0] || null;
    persistProfiles();
    renderSiteOptions();
    resetAccountForm();
    renderAccounts();
    displayStatus(siteStatus, 'Site removed.', 'success');
  });

  addCookieRowBtn.addEventListener('click', () => addCookieRow());
  importCookiesBtn.addEventListener('click', () => importCurrentCookies());

  saveAccountBtn.addEventListener('click', () => saveAccount());
  resetAccountBtn.addEventListener('click', () => resetAccountForm());
}

async function loadProfiles() {
  const stored = await chrome.storage.local.get({ siteProfiles: {} });
  siteProfiles = stored.siteProfiles || {};
  currentSiteKey = currentSiteKey || Object.keys(siteProfiles)[0] || null;
  renderSiteOptions();
  updateSiteInput();
  resetAccountForm();
  renderAccounts();
}

function persistProfiles() {
  chrome.storage.local.set({ siteProfiles });
}

function updateSiteInput() {
  if (currentSiteKey) {
    siteInput.value = currentSiteKey;
    siteSelect.value = currentSiteKey;
  } else {
    siteInput.value = '';
    siteSelect.value = '';
  }
}

function renderSiteOptions() {
  const keys = Object.keys(siteProfiles).sort();
  siteSelect.innerHTML = '';
  if (!keys.length) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'No saved sites';
    siteSelect.appendChild(placeholder);
    siteSelect.disabled = true;
  } else {
    siteSelect.disabled = false;
    keys.forEach((key) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = key;
      siteSelect.appendChild(option);
    });
  }
  if (currentSiteKey && keys.includes(currentSiteKey)) {
    siteSelect.value = currentSiteKey;
  }
}

function renderAccounts() {
  accountsList.innerHTML = '';
  if (!currentSiteKey) {
    accountsList.appendChild(createEmptyState('Create or select a site to manage accounts.'));
    return;
  }
  const site = siteProfiles[currentSiteKey];
  if (!site || !site.accounts || !site.accounts.length) {
    accountsList.appendChild(createEmptyState('No accounts yet. Use the form below to add one.'));
    return;
  }
  site.accounts
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .forEach((account) => {
      const card = document.createElement('div');
      card.className = 'account-card';

      const header = document.createElement('div');
      header.className = 'account-card-header';

      const title = document.createElement('strong');
      title.textContent = account.name;

      const meta = document.createElement('small');
      const cookieCount = account.cookies?.length || 0;
      const updated = account.updatedAt ? new Date(account.updatedAt).toLocaleString() : 'Never';
      meta.textContent = `${cookieCount} cookies • Updated ${updated}`;

      header.appendChild(title);
      header.appendChild(meta);
      card.appendChild(header);

      const actions = document.createElement('div');
      actions.className = 'account-card-actions';

      const switchBtn = document.createElement('button');
      switchBtn.textContent = 'Switch';
      switchBtn.addEventListener('click', () => applyAccount(account));

      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.className = 'ghost';
      editBtn.addEventListener('click', () => populateAccountForm(account));

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.className = 'ghost danger';
      deleteBtn.addEventListener('click', () => deleteAccount(account.id));

      actions.appendChild(switchBtn);
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      card.appendChild(actions);

      accountsList.appendChild(card);
    });
}

function createEmptyState(message) {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.textContent = message;
  return div;
}

function resetAccountForm() {
  editingAccountId = null;
  accountFormTitle.textContent = 'Add Account';
  accountNameInput.value = '';
  setCookiesInForm([]);
}

function populateAccountForm(account) {
  editingAccountId = account.id;
  accountFormTitle.textContent = 'Edit Account';
  accountNameInput.value = account.name;
  setCookiesInForm(account.cookies || []);
}

function addCookieRow(cookie = {}) {
  const row = document.createElement('tr');
  row.innerHTML = `
    <td><input type="text" class="cookie-name" value="${cookie.name || ''}" placeholder="session" /></td>
    <td><input type="text" class="cookie-value" value="${cookie.value || ''}" placeholder="value" /></td>
    <td><input type="text" class="cookie-domain" value="${cookie.domain || ''}" placeholder=".example.com" /></td>
    <td><input type="text" class="cookie-path" value="${cookie.path || '/'}" /></td>
    <td class="toggle"><input type="checkbox" class="cookie-secure" ${cookie.secure ? 'checked' : ''} /></td>
    <td class="toggle"><input type="checkbox" class="cookie-httpOnly" ${cookie.httpOnly ? 'checked' : ''} /></td>
    <td><button class="ghost danger remove-row" title="Remove">x</button></td>
  `;
  const hostPrefixed = (cookie.name || '').startsWith('__Host-');
  const isHostOnly = (cookie.hostOnly || hostPrefixed) ? 'true' : 'false';
  row.dataset.hostOnly = isHostOnly;
  row.dataset.lockedHostOnly = hostPrefixed ? 'true' : 'false';
  const domainInput = row.querySelector('.cookie-domain');
  if (!domainInput.value) {
    if (cookie.hostOnly && cookie.domain) {
      domainInput.value = cookie.domain;
    } else if (!cookie.hostOnly) {
      const defaultDomain = getDefaultDomainValue();
      if (defaultDomain) {
        domainInput.value = defaultDomain;
      }
    }
  }
  domainInput.addEventListener('input', () => {
    if (row.dataset.lockedHostOnly === 'true') {
      row.dataset.hostOnly = 'true';
      return;
    }
    row.dataset.hostOnly = domainInput.value.trim() ? 'false' : 'true';
  });
  row.querySelector('.remove-row').addEventListener('click', () => {
    row.remove();
    if (!cookiesTableBody.children.length) {
      addCookieRow();
    }
  });
  cookiesTableBody.appendChild(row);
}

function setCookiesInForm(cookies = []) {
  cookiesTableBody.innerHTML = '';
  if (!cookies.length) {
    addCookieRow();
    return;
  }
  cookies.forEach((cookie) => addCookieRow(cookie));
}

function saveAccount() {
  if (!currentSiteKey) {
    displayStatus(accountStatus, 'Save a site before creating accounts.', 'error');
    return;
  }
  const name = accountNameInput.value.trim();
  if (!name) {
    displayStatus(accountStatus, 'Account name is required.', 'error');
    return;
  }
  const cookies = collectCookiesFromForm();
  if (!cookies.length) {
    displayStatus(accountStatus, 'Add at least one cookie.', 'error');
    return;
  }
  const site = siteProfiles[currentSiteKey];
  if (!site) {
    displayStatus(accountStatus, 'Save the site profile before adding accounts.', 'error');
    return;
  }
  const now = Date.now();
  if (editingAccountId) {
    const idx = site.accounts.findIndex((a) => a.id === editingAccountId);
    if (idx >= 0) {
      site.accounts[idx] = { ...site.accounts[idx], name, cookies, updatedAt: now };
    }
  } else {
    site.accounts.push({ id: crypto.randomUUID ? crypto.randomUUID() : `acc-${Date.now()}`, name, cookies, updatedAt: now });
  }
  persistProfiles();
  renderAccounts();
  resetAccountForm();
  displayStatus(accountStatus, 'Account saved.', 'success');
}

function collectCookiesFromForm() {
  const rows = Array.from(cookiesTableBody.querySelectorAll('tr'));
  let domainFallback = '';
  if (currentSiteKey) {
    try {
      domainFallback = new URL(currentSiteKey).hostname;
    } catch (err) {
      domainFallback = '';
    }
  }
  const cookies = [];
  rows.forEach((row) => {
    const name = row.querySelector('.cookie-name').value.trim();
    const value = row.querySelector('.cookie-value').value.trim();
    if (!name || !value) {
      return;
    }
    const domainInput = row.querySelector('.cookie-domain').value.trim();
    const pathInput = row.querySelector('.cookie-path').value.trim() || '/';
    const secureChecked = row.querySelector('.cookie-secure').checked;
    const httpOnly = row.querySelector('.cookie-httpOnly').checked;
    const isHostCookie = row.dataset.hostOnly === 'true' || name.startsWith('__Host-');
    const fallbackHost = domainFallback.replace(/^\./, '');
    let domainValue = domainInput;
    if (!domainValue && fallbackHost) {
      domainValue = isHostCookie ? fallbackHost : `.${fallbackHost}`;
    }
    const normalizedPath = isHostCookie ? '/' : pathInput.startsWith('/') ? pathInput : `/${pathInput}`;
    const secure = isHostCookie || name.startsWith('__Secure-') ? true : secureChecked;
    const cookieRecord = {
      name,
      value,
      path: normalizedPath,
      secure,
      httpOnly,
      hostOnly: isHostCookie
    };
    if (domainValue) {
      cookieRecord.domain = domainValue;
    }
    cookies.push(cookieRecord);
  });
  return cookies;
}

function deleteAccount(accountId) {
  if (!currentSiteKey) {
    return;
  }
  const site = siteProfiles[currentSiteKey];
  const index = site.accounts.findIndex((a) => a.id === accountId);
  if (index === -1) {
    return;
  }
  site.accounts.splice(index, 1);
  persistProfiles();
  renderAccounts();
  displayStatus(accountStatus, 'Account deleted.', 'success');
  if (editingAccountId === accountId) {
    resetAccountForm();
  }
}

function applyAccount(account) {
  if (!currentSiteKey || !siteProfiles[currentSiteKey]) {
    displayStatus(accountStatus, 'Select a valid site first.', 'error');
    return;
  }
  displayStatus(accountStatus, 'Switching...', 'info');
  chrome.runtime.sendMessage(
    {
      type: 'switch-account',
      payload: {
        origin: currentSiteKey,
        accountId: account.id,
        cookies: account.cookies
      }
    },
    (response) => {
      if (chrome.runtime.lastError) {
        displayStatus(accountStatus, chrome.runtime.lastError.message, 'error');
        return;
      }
      if (response?.error) {
        displayStatus(accountStatus, response.error, 'error');
        return;
      }
      displayStatus(accountStatus, `Applied ${account.name} cookies.`, 'success');
    }
  );
}

function importCurrentCookies() {
  if (!currentSiteKey) {
    displayStatus(accountStatus, 'Save or select a site first.', 'error');
    return;
  }
  displayStatus(accountStatus, 'Fetching cookies from current account...', 'info');
  chrome.runtime.sendMessage(
    {
      type: 'fetch-cookies',
      payload: {
        origin: currentSiteKey
      }
    },
    (response) => {
      if (chrome.runtime.lastError) {
        displayStatus(accountStatus, chrome.runtime.lastError.message, 'error');
        return;
      }
      if (response?.error) {
        displayStatus(accountStatus, response.error, 'error');
        return;
      }
      const cookies = response?.cookies || [];
      setCookiesInForm(cookies);
      if (!cookies.length) {
        displayStatus(accountStatus, 'No cookies found for the current domain.', 'info');
      } else {
        displayStatus(accountStatus, `Imported ${cookies.length} cookies from the current account.`, 'success');
      }
    }
  );
}

function getDefaultDomainValue() {
  if (!currentSiteKey) {
    return '';
  }
  try {
    const { hostname } = new URL(currentSiteKey);
    return hostname ? `.${hostname}` : '';
  } catch (err) {
    return '';
  }
}

function normalizeOrigin(value) {
  if (!value) return null;
  try {
    const hasProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(hasProtocol);
    return url.origin;
  } catch (err) {
    return null;
  }
}

function displayStatus(target, message, type) {
  if (!target) return;
  if (statusTimers.has(target)) {
    clearTimeout(statusTimers.get(target));
    statusTimers.delete(target);
  }
  target.textContent = message;
  const colors = {
    success: '#15803d',
    error: '#b91c1c',
    info: '#2563eb'
  };
  target.style.color = colors[type] || '#0f172a';
  if (!message) {
    target.textContent = '';
    return;
  }
  const timeout = setTimeout(() => {
    target.textContent = '';
    statusTimers.delete(target);
  }, 5000);
  statusTimers.set(target, timeout);
}
