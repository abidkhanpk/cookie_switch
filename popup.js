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
const autoSyncToggle = document.getElementById('autoSyncToggle');
const cookiesTableBody = document.querySelector('#cookiesTable tbody');
const importCookiesBtn = document.getElementById('importCookiesBtn');
const saveAccountBtn = document.getElementById('saveAccountBtn');
const resetAccountBtn = document.getElementById('resetAccountForm');
const importAccountBtn = document.getElementById('importAccountBtn');
const importSiteBtn = document.getElementById('importSiteBtn');
const exportSiteBtn = document.getElementById('exportSiteBtn');
const importBackupBtn = document.getElementById('importBackupBtn');
const exportBackupBtn = document.getElementById('exportBackupBtn');
const backupStatus = document.getElementById('backupStatus');
const helpBtn = document.getElementById('helpBtn');
const helpModal = document.getElementById('helpModal');
const helpContent = document.getElementById('helpContent');
const closeHelpBtn = document.getElementById('closeHelpBtn');
const versionLabel = document.querySelector('.app-version');

let siteProfiles = {};
let currentSiteKey = null;
let editingAccountId = null;
let activeAccountMap = {};
const statusTimers = new WeakMap();
const APP_VERSION = chrome.runtime.getManifest().version || '1.0.0';
const COOKIE_PLACEHOLDER_TEXT = 'Use \"Get Current Account\" to capture cookies.';
const IMPORT_BUTTON_LABELS = {
  create: 'Get Current Account',
  edit: 'Update from current account'
};
let helpLoaded = false;

init();

function init() {
  bindEvents();
  loadProfiles();
  setVersionLabel();
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
    const removedKey = currentSiteKey;
    delete siteProfiles[currentSiteKey];
    currentSiteKey = Object.keys(siteProfiles)[0] || null;
    persistProfiles();
    renderSiteOptions();
    resetAccountForm();
    renderAccounts();
    displayStatus(siteStatus, 'Site removed.', 'success');
    updateActiveAccountMapping(removedKey, null);
  });

  importCookiesBtn.addEventListener('click', () => importCurrentCookies());

  saveAccountBtn.addEventListener('click', () => saveAccount());
  resetAccountBtn.addEventListener('click', () => resetAccountForm());
  importAccountBtn.addEventListener('click', () => importAccountFromFile());
  importSiteBtn.addEventListener('click', () => importSiteData());
  exportSiteBtn.addEventListener('click', () => exportSiteData());
  importBackupBtn.addEventListener('click', () => importFullBackup());
  exportBackupBtn.addEventListener('click', () => exportFullBackup());
  if (helpBtn) {
    helpBtn.addEventListener('click', openHelpModal);
  }
  if (closeHelpBtn) {
    closeHelpBtn.addEventListener('click', closeHelpModal);
  }
  if (helpModal) {
    helpModal.addEventListener('click', (event) => {
      if (event.target === helpModal) {
        closeHelpModal();
      }
    });
  }
}

async function loadProfiles() {
  const stored = await chrome.storage.local.get({ siteProfiles: {}, activeAccountMap: {} });
  siteProfiles = stored.siteProfiles || {};
  activeAccountMap = stored.activeAccountMap || {};
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
      const isActive = activeAccountMap[currentSiteKey]?.accountId === account.id;
      if (isActive) {
        card.classList.add('active');
      }

      const header = document.createElement('div');
      header.className = 'account-card-header';

      const title = document.createElement('strong');
      title.textContent = account.name;

      const titleWrap = document.createElement('div');
      titleWrap.className = 'account-card-title';
      titleWrap.appendChild(title);
      if (account.autoSync) {
        const badge = document.createElement('span');
        badge.className = 'chip';
        badge.textContent = 'Auto update';
        badge.dataset.tooltip = 'Auto update cookies is enabled';
        titleWrap.appendChild(badge);
      }

      const meta = document.createElement('small');
      const cookieCount = account.cookies?.length || 0;
      const updated = account.updatedAt ? new Date(account.updatedAt).toLocaleString() : 'Never';
      meta.textContent = `${cookieCount} cookies • Updated ${updated}`;

      header.appendChild(titleWrap);
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

      const exportBtn = document.createElement('button');
      exportBtn.textContent = 'Export';
      exportBtn.className = 'ghost';
      exportBtn.addEventListener('click', () => exportAccount(account));

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.className = 'ghost danger';
      deleteBtn.addEventListener('click', () => deleteAccount(account.id));

      actions.appendChild(switchBtn);
      actions.appendChild(editBtn);
      actions.appendChild(exportBtn);
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
  autoSyncToggle.checked = false;
  setImportButtonLabel();
  showCookiePlaceholder();
}

function populateAccountForm(account) {
  editingAccountId = account.id;
  accountFormTitle.textContent = 'Edit Account';
  accountNameInput.value = account.name;
  autoSyncToggle.checked = Boolean(account.autoSync);
  setImportButtonLabel();
  setCookiesInForm(account.cookies || []);
}

function addCookieRow(cookie = {}) {
  if (hasCookiePlaceholder()) {
    cookiesTableBody.innerHTML = '';
  }
  const row = document.createElement('tr');
  row.className = 'cookie-row';
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
    if (!cookiesTableBody.querySelector('.cookie-row')) {
      showCookiePlaceholder();
    }
  });
  setRowMeta(row, cookie);
  cookiesTableBody.appendChild(row);
}

function setCookiesInForm(cookies = []) {
  cookiesTableBody.innerHTML = '';
  if (!cookies.length) {
    showCookiePlaceholder();
    return;
  }
  cookies.forEach((cookie) => addCookieRow(cookie));
}

function showCookiePlaceholder() {
  cookiesTableBody.innerHTML = `
    <tr class="cookie-placeholder-row">
      <td colspan="7" class="cookie-placeholder">${COOKIE_PLACEHOLDER_TEXT}</td>
    </tr>
  `;
}

function hasCookiePlaceholder() {
  return Boolean(cookiesTableBody.querySelector('.cookie-placeholder-row'));
}

function setImportButtonLabel() {
  const mode = editingAccountId ? 'edit' : 'create';
  importCookiesBtn.textContent = IMPORT_BUTTON_LABELS[mode];
  importCookiesBtn.title = mode === 'edit'
    ? 'Replace this account\'s cookies with those from the active tab'
    : 'Capture cookies from the active tab';
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
      site.accounts[idx] = { ...site.accounts[idx], name, cookies, autoSync: autoSyncToggle.checked, updatedAt: now };
    }
  } else {
    const newAccount = {
      id: crypto.randomUUID ? crypto.randomUUID() : `acc-${Date.now()}`,
      name,
      cookies,
      autoSync: autoSyncToggle.checked,
      updatedAt: now
    };
    site.accounts.push(newAccount);
  }
  persistProfiles();
  renderAccounts();
  resetAccountForm();
  displayStatus(accountStatus, 'Account saved.', 'success');
}

function collectCookiesFromForm() {
  const rows = Array.from(cookiesTableBody.querySelectorAll('tr.cookie-row'));
  if (!rows.length) {
    return [];
  }
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
    const fallbackHost = domainFallback ? domainFallback.replace(/^\./, '') : '';
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
    const meta = getRowMeta(row);
    meta.hostOnly = isHostCookie;
    cookies.push(normalizeCookieForStorage({ ...meta, ...cookieRecord }));
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
  const [removed] = site.accounts.splice(index, 1);
  persistProfiles();
  renderAccounts();
  displayStatus(accountStatus, 'Account deleted.', 'success');
  if (editingAccountId === accountId) {
    resetAccountForm();
  }
  if (activeAccountMap[currentSiteKey]?.accountId === accountId) {
    updateActiveAccountMapping(currentSiteKey, null);
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
      updateActiveAccountMapping(currentSiteKey, account.id);
    }
  );
}

function exportAccount(account) {
  if (!currentSiteKey) {
    displayStatus(accountStatus, 'Select a site before exporting.', 'error');
    return;
  }
  const sanitizedAccount = serializeAccount(account);
  const payload = {
    type: 'cookie-switch/account',
    version: APP_VERSION,
    site: currentSiteKey,
    account: sanitizedAccount
  };
  const filename = `cookie-switch-account-${slugify(account.name || 'account')}.json`;
  triggerJsonDownload(filename, payload);
  displayStatus(accountStatus, `Exported ${account.name || 'account'}.`, 'success');
}

async function importAccountFromFile() {
  try {
    const file = await pickJsonFile();
    if (!file) {
      return;
    }
    const payload = file.data;
    if (!payload || payload.type !== 'cookie-switch/account' || !payload.account) {
      throw new Error('Selected file is not a Cookie Switch account export.');
    }
    const importedSite = payload.site ? normalizeOrigin(payload.site) : null;
    const targetSiteKey = currentSiteKey || importedSite;
    if (!targetSiteKey) {
      throw new Error('Select or create a site before importing an account.');
    }
    if (!siteProfiles[targetSiteKey]) {
      siteProfiles[targetSiteKey] = { origin: targetSiteKey, accounts: [] };
    }
    const site = siteProfiles[targetSiteKey];
    const newAccount = formatImportedAccount(payload.account);
    site.accounts.push(newAccount);
    currentSiteKey = targetSiteKey;
    persistProfiles();
    renderSiteOptions();
    renderAccounts();
    displayStatus(accountStatus, `Imported ${newAccount.name || 'account'}.`, 'success');
  } catch (error) {
    displayStatus(accountStatus, error.message || 'Unable to import account.', 'error');
  }
}

function exportSiteData() {
  if (!currentSiteKey || !siteProfiles[currentSiteKey]) {
    displayStatus(siteStatus, 'Select a site to export.', 'error');
    return;
  }
  const snapshot = serializeSite(siteProfiles[currentSiteKey], currentSiteKey);
  const payload = {
    type: 'cookie-switch/site',
    version: APP_VERSION,
    site: snapshot
  };
  let siteSlug = 'site';
  try {
    siteSlug = slugify(new URL(currentSiteKey).hostname);
  } catch (err) {
    siteSlug = slugify(currentSiteKey);
  }
  const filename = `cookie-switch-site-${siteSlug}.json`;
  triggerJsonDownload(filename, payload);
  displayStatus(siteStatus, 'Site exported.', 'success');
}

async function importSiteData() {
  try {
    const file = await pickJsonFile();
    if (!file) {
      return;
    }
    const payload = file.data;
    if (!payload || payload.type !== 'cookie-switch/site' || !payload.site) {
      throw new Error('Selected file is not a Cookie Switch site export.');
    }
    const targetOrigin = normalizeOrigin(payload.site.origin || payload.site.url || payload.site);
    if (!targetOrigin) {
      throw new Error('Site origin missing from file.');
    }
    if (siteProfiles[targetOrigin] && !confirm('Site already exists. Replace it with the imported data?')) {
      return;
    }
    siteProfiles[targetOrigin] = {
      origin: targetOrigin,
      accounts: (payload.site.accounts || []).map((account) => formatImportedAccount(account))
    };
    currentSiteKey = targetOrigin;
    persistProfiles();
    renderSiteOptions();
    updateSiteInput();
    renderAccounts();
    displayStatus(siteStatus, `Imported ${targetOrigin}.`, 'success');
  } catch (error) {
    displayStatus(siteStatus, error.message || 'Unable to import site.', 'error');
  }
}

async function exportFullBackup() {
  if (!Object.keys(siteProfiles).length) {
    displayStatus(backupStatus, 'No data to export.', 'info');
    return;
  }
  try {
    const stored = await chrome.storage.local.get({ activeAccountMap: {} });
    const payload = {
      type: 'cookie-switch/backup',
      version: APP_VERSION,
      siteProfiles: serializeAllSites(siteProfiles),
      activeAccountMap: stored.activeAccountMap || {}
    };
    const filename = `cookie-switch-backup-${new Date().toISOString().split('T')[0]}.json`;
    triggerJsonDownload(filename, payload);
    displayStatus(backupStatus, 'Full backup exported.', 'success');
  } catch (error) {
    displayStatus(backupStatus, error.message || 'Unable to export backup.', 'error');
  }
}

async function importFullBackup() {
  try {
    const file = await pickJsonFile();
    if (!file) {
      return;
    }
    if (!confirm('Restoring a backup will replace all saved sites and accounts. Continue?')) {
      return;
    }
    const payload = file.data;
    if (!payload || payload.type !== 'cookie-switch/backup' || typeof payload.siteProfiles !== 'object') {
      throw new Error('Selected file is not a Cookie Switch backup.');
    }
    const restoredProfiles = {};
    Object.entries(payload.siteProfiles || {}).forEach(([origin, site]) => {
      const key = normalizeOrigin(site?.origin || origin);
      if (!key) {
        return;
      }
      restoredProfiles[key] = {
        origin: key,
        accounts: (site.accounts || []).map((account) => formatImportedAccount(account))
      };
    });
    siteProfiles = restoredProfiles;
    currentSiteKey = Object.keys(siteProfiles)[0] || null;
    activeAccountMap = payload.activeAccountMap || {};
    await chrome.storage.local.set({
      siteProfiles,
      activeAccountMap
    });
    renderSiteOptions();
    updateSiteInput();
    renderAccounts();
    displayStatus(backupStatus, 'Backup restored.', 'success');
  } catch (error) {
    displayStatus(backupStatus, error.message || 'Unable to restore backup.', 'error');
  }
}

async function importCurrentCookies() {
  if (!currentSiteKey) {
    displayStatus(accountStatus, 'Save or select a site first.', 'error');
    return;
  }
  displayStatus(accountStatus, 'Fetching cookies from current account...', 'info');
  try {
    const tabs = await queryTabs({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    const payload = {
      origin: currentSiteKey
    };
    if (activeTab?.id) {
      payload.tabId = activeTab.id;
    }
    chrome.runtime.sendMessage(
      {
        type: 'fetch-cookies',
        payload
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
        const cookies = (response?.cookies || []).map((cookie) => normalizeCookieForStorage(cookie));
        setCookiesInForm(cookies);
        if (!cookies.length) {
          displayStatus(accountStatus, 'No cookies found for the current domain.', 'info');
        } else {
          displayStatus(accountStatus, `Imported ${cookies.length} cookies from the current account.`, 'success');
        }
      }
    );
  } catch (error) {
    displayStatus(accountStatus, error.message || 'Unable to fetch cookies.', 'error');
  }
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

function queryTabs(queryInfo) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tabs || []);
    });
  });
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

function updateActiveAccountMapping(origin, accountId) {
  if (!origin) return;
  if (accountId) {
    activeAccountMap = { ...activeAccountMap, [origin]: { accountId } };
  } else {
    const { [origin]: _removed, ...rest } = activeAccountMap;
    activeAccountMap = rest;
  }
  renderAccounts();
  chrome.runtime.sendMessage(
    {
      type: 'set-active-account',
      payload: { origin, accountId }
    },
    () => {}
  );
}

function setVersionLabel() {
  if (versionLabel) {
    versionLabel.textContent = `v${APP_VERSION}`;
  }
}

async function openHelpModal() {
  if (!helpModal) return;
  helpModal.classList.remove('hidden');
  if (!helpLoaded && helpContent) {
    try {
      const response = await fetch(chrome.runtime.getURL('README.md'));
      const markdown = await response.text();
      helpContent.innerHTML = renderMarkdown(markdown);
      helpLoaded = true;
    } catch (error) {
      helpContent.textContent = 'Unable to load help content.';
    }
  }
}

function closeHelpModal() {
  if (!helpModal) return;
  helpModal.classList.add('hidden');
}

function renderMarkdown(md) {
  const lines = md.split(/\r?\n/);
  const html = [];
  let inList = false;
  const flushList = () => {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  };
  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      return;
    }
    if (/^###\s+/.test(line)) {
      flushList();
      html.push(`<h3>${escapeHtml(line.replace(/^###\s+/, ''))}</h3>`);
    } else if (/^##\s+/.test(line)) {
      flushList();
      html.push(`<h2>${escapeHtml(line.replace(/^##\s+/, ''))}</h2>`);
    } else if (/^#\s+/.test(line)) {
      flushList();
      html.push(`<h1>${escapeHtml(line.replace(/^#\s+/, ''))}</h1>`);
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${escapeHtml(line.replace(/^[-*]\s+/, ''))}</li>`);
    } else {
      flushList();
      html.push(`<p>${escapeHtml(line)}</p>`);
    }
  });
  flushList();
  return html.join('');
}

function escapeHtml(str) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return str.replace(/[&<>"']/g, (char) => map[char] || char);
}

function setRowMeta(row, cookie = {}) {
  row.__meta = cloneCookieMeta(cookie);
}

function getRowMeta(row) {
  if (!row.__meta) {
    return {};
  }
  return cloneCookieMeta(row.__meta);
}

function cloneCookieMeta(cookie = {}) {
  const meta = {};
  [
    'storeId',
    'partitionKey',
    'sameSite',
    'priority',
    'expirationDate',
    'sameParty',
    'session',
    'firstPartyDomain',
    'hostOnly'
  ].forEach((key) => {
    if (cookie[key] !== undefined) {
      meta[key] = cloneValue(cookie[key]);
    }
  });
  return meta;
}

function cloneValue(value) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // fallback
    }
  }
  if (typeof value === 'object') {
    return JSON.parse(JSON.stringify(value));
  }
  return value;
}

function normalizeCookieForStorage(cookie = {}) {
  const normalized = { ...cookie };
  if (!normalized.path) {
    normalized.path = '/';
  }
  if (!normalized.domain) {
    delete normalized.domain;
  }
  if (!normalized.partitionKey) {
    delete normalized.partitionKey;
  }
  if (!normalized.storeId) {
    delete normalized.storeId;
  }
  if (!normalized.sameSite) {
    delete normalized.sameSite;
  }
  if (!normalized.priority) {
    delete normalized.priority;
  }
  if (!normalized.expirationDate && !normalized.session) {
    delete normalized.expirationDate;
  }
  return normalized;
}

function serializeAccount(account = {}) {
  return {
    ...account,
    cookies: (account.cookies || []).map((cookie) => normalizeCookieForStorage(cookie)),
    autoSync: Boolean(account.autoSync)
  };
}

function serializeSite(site, key) {
  if (!site) {
    return null;
  }
  return {
    origin: site.origin || key,
    accounts: (site.accounts || []).map((account) => serializeAccount(account))
  };
}

function serializeAllSites(profiles = {}) {
  const copy = {};
  Object.entries(profiles).forEach(([key, site]) => {
    copy[key] = serializeSite(site, key);
  });
  return copy;
}

function triggerJsonDownload(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pickJsonFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      if (!input.files || !input.files.length) {
        document.body.removeChild(input);
        resolve(null);
        return;
      }
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        document.body.removeChild(input);
        try {
          const data = JSON.parse(reader.result);
          resolve({ data, name: file.name });
        } catch (error) {
          reject(new Error('Invalid JSON file.'));
        }
      };
      reader.onerror = () => {
        document.body.removeChild(input);
        reject(reader.error || new Error('Failed to read file.'));
      };
      reader.readAsText(file);
    });
    input.click();
  });
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'data';
}

function formatImportedAccount(account = {}) {
  const sanitized = serializeAccount(account);
  return {
    ...sanitized,
    autoSync: Boolean(account.autoSync),
    id: crypto.randomUUID ? crypto.randomUUID() : `acc-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    updatedAt: Date.now()
  };
}
