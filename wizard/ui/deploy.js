/**
 * Strange — VoidForge Deploy Wizard
 * Steps: 1=Unlock+Project, 2=Confirm, 3=Provision, 4=Done
 */

(function () {
  'use strict';

  const TOTAL_STEPS = 4;
  let currentStep = 1;

  const state = {
    projectDir: '',
    projectName: '',
    deployTarget: '',
    framework: '',
    database: 'none',
    cache: 'none',
    instanceType: 't3.micro',
    hostname: '',
    registerDomain: false,
    provisionResult: null,
    provisionRunId: '',
    deployCmd: '',
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const progressBar = $('#progress-bar');
  const stepLabel = $('#step-label');

  function showStep(step) {
    $$('.step').forEach((el) => el.classList.add('hidden'));
    const target = $(`#step-${step}`);
    if (target) target.classList.remove('hidden');
    currentStep = step;

    const pct = Math.round((step / TOTAL_STEPS) * 100);
    progressBar.style.width = `${pct}%`;
    progressBar.setAttribute('aria-valuenow', String(pct));
    stepLabel.textContent = `Step ${step} of ${TOTAL_STEPS}`;

    const firstInput = target?.querySelector('input, textarea, select');
    if (firstInput) setTimeout(() => firstInput.focus(), 100);
  }

  // --- Step 1: Unlock + Scan Project ---

  const vaultPasswordInput = $('#vault-password');
  const vaultStatus = $('#vault-status');
  const unlockVaultBtn = $('#unlock-vault');
  const projectCard = $('#project-card');

  $('#toggle-vault-visibility').addEventListener('click', () => {
    const isPassword = vaultPasswordInput.type === 'password';
    vaultPasswordInput.type = isPassword ? 'text' : 'password';
    $('#toggle-vault-visibility').textContent = isPassword ? 'Hide' : 'Show';
  });

  // Check vault state on load — skip unlock if already open
  fetch('/api/credentials/status')
    .then((r) => r.json())
    .then((data) => {
      if (data.unlocked) {
        showStatus(vaultStatus, 'success', 'Vault already unlocked');
        unlockVaultBtn.style.display = 'none';
        vaultPasswordInput.style.display = 'none';
        $('#toggle-vault-visibility').style.display = 'none';
        projectCard.classList.remove('hidden');
        $('#project-dir').focus();
      }
    })
    .catch(() => {});

  unlockVaultBtn.addEventListener('click', async () => {
    const password = vaultPasswordInput.value;
    if (!password) { showStatus(vaultStatus, 'error', 'Please enter your password'); return; }

    showStatus(vaultStatus, 'loading', 'Unlocking...');
    unlockVaultBtn.disabled = true;

    try {
      const res = await fetch('/api/credentials/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VoidForge-Request': '1' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (res.ok && data.unlocked) {
        showStatus(vaultStatus, 'success', 'Vault unlocked');
        projectCard.classList.remove('hidden');
        $('#project-dir').focus();
      } else {
        showStatus(vaultStatus, 'error', data.error || 'Failed to unlock');
      }
    } catch (err) {
      showStatus(vaultStatus, 'error', 'Connection error: ' + err.message);
    } finally {
      unlockVaultBtn.disabled = false;
    }
  });

  // Scan project
  const projectDirInput = $('#project-dir');
  const projectStatus = $('#project-status');
  const scanProjectBtn = $('#scan-project');

  scanProjectBtn.addEventListener('click', async () => {
    const dir = projectDirInput.value.trim();
    if (!dir) { showStatus(projectStatus, 'error', 'Enter your project directory'); return; }

    showStatus(projectStatus, 'loading', 'Scanning project...');
    scanProjectBtn.disabled = true;

    try {
      const res = await fetch('/api/deploy/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VoidForge-Request': '1' },
        body: JSON.stringify({ directory: dir }),
      });
      const data = await res.json();

      if (res.ok && data.valid) {
        state.projectDir = dir;
        state.projectName = data.name;
        state.deployTarget = data.deploy || 'docker';
        state.framework = data.framework || '';
        state.database = data.database || 'none';
        state.cache = data.cache || 'none';
        state.instanceType = data.instanceType || 't3.micro';
        state.hostname = data.hostname || '';

        showStatus(projectStatus, 'success', `Found: ${data.name} (${data.deploy || 'docker'})`);
        // Show continue button instead of auto-advancing
        scanProjectBtn.textContent = 'Continue';
        scanProjectBtn.onclick = () => goToStep2();
      } else {
        showStatus(projectStatus, 'error', data.error || 'Not a valid VoidForge project');
      }
    } catch (err) {
      showStatus(projectStatus, 'error', 'Scan failed: ' + err.message);
    } finally {
      scanProjectBtn.disabled = false;
    }
  });

  // --- Step 2: Review & Configure ---

  const DEPLOY_DESCRIPTIONS = {
    docker: 'This will generate a Dockerfile, docker-compose.yml, and .dockerignore. No cloud resources will be created.',
    vps: 'This will create AWS resources: EC2 instance, security group, SSH key pair. These resources will incur AWS charges.',
    vercel: 'This will create a project on your Vercel account. Free tier covers most hobby projects.',
    railway: 'This will create a project on your Railway account with optional database/Redis services.',
    cloudflare: 'This will create a Cloudflare Pages project, optionally with a D1 database. Pages has a generous free tier.',
    static: 'This will create an S3 bucket configured for static website hosting. Minimal AWS charges.',
  };

  function goToStep2() {
    // Populate step 2 summary
    $('#summary-name').textContent = state.projectName;
    $('#summary-framework').textContent = state.framework || 'auto-detect';
    $('#summary-database').textContent = state.database || 'none';

    // Set deploy target dropdown
    const deploySelect = $('#summary-deploy-select');
    deploySelect.value = state.deployTarget;
    updateDeployDescription();

    // Set hostname and instance type
    $('#summary-hostname').value = state.hostname;
    $('#summary-instance-type').value = state.instanceType;

    showStep(2);
  }

  function updateDeployDescription() {
    const target = $('#summary-deploy-select').value;
    state.deployTarget = target;
    $('#provision-confirm-desc').textContent = DEPLOY_DESCRIPTIONS[target] || 'This will provision your deploy target.';

    // Show/hide instance type selector for VPS target
    const instanceRow = $('#instance-type-row');
    if (target === 'vps') {
      instanceRow.classList.remove('hidden');
    } else {
      instanceRow.classList.add('hidden');
    }

    // Show/hide domain registration checkbox (needs hostname + Cloudflare credentials)
    updateRegisterDomainVisibility();
  }

  function updateRegisterDomainVisibility() {
    const registerRow = $('#register-domain-row');
    const hostname = $('#summary-hostname').value.trim();
    // Basic domain format check: must contain a dot and look like a valid domain
    const isValidDomain = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(hostname);
    // Show registration option when a valid domain is entered and target is not Docker
    if (hostname && isValidDomain && state.deployTarget !== 'docker') {
      registerRow.classList.remove('hidden');
      registerRow.classList.add('highlight');
      setTimeout(() => registerRow.classList.remove('highlight'), 600);
      const labelSpan = $('#summary-register-domain').nextElementSibling;
      if (labelSpan) {
        labelSpan.textContent = `Register ${hostname} via Cloudflare Registrar (~$10-15/year, non-refundable)`;
      }
    } else {
      registerRow.classList.add('hidden');
      $('#summary-register-domain').checked = false;
      state.registerDomain = false;
    }
  }

  $('#summary-deploy-select').addEventListener('change', updateDeployDescription);

  $('#summary-hostname').addEventListener('input', () => {
    state.hostname = $('#summary-hostname').value.trim();
    updateRegisterDomainVisibility();
  });

  $('#summary-register-domain').addEventListener('change', () => {
    state.registerDomain = $('#summary-register-domain').checked;
  });

  $('#summary-instance-type').addEventListener('change', () => {
    state.instanceType = $('#summary-instance-type').value;
  });

  // Back to step 1
  $('#back-to-project').addEventListener('click', () => {
    scanProjectBtn.textContent = 'Scan Project';
    scanProjectBtn.onclick = null;
    showStep(1);
  });

  $('#start-provision').addEventListener('click', () => {
    if (state.registerDomain) {
      const hostname = state.hostname || 'this domain';
      const confirmed = confirm(
        `You are about to purchase "${hostname}" via Cloudflare Registrar.\n\n` +
        `Cost: ~$10-15/year\n` +
        `This is non-refundable and cannot be undone.\n\n` +
        `Continue?`
      );
      if (!confirmed) return;
    }
    showStep(3);
    runProvisioning();
  });

  // --- Step 3: Provisioning ---

  const provisionLog = $('#provision-log');
  const provisionDoneActions = $('#provision-done-actions');
  const provisionErrorActions = $('#provision-error-actions');
  const provisionSrStatus = $('#provision-sr-status');

  const STATUS_ICONS = {
    started: '\u25CF',
    done: '\u2713',
    error: '\u2717',
    skipped: '\u2014',
  };

  let provisionEventCount = 0;
  let hasNonFatalErrors = false;

  function addProvisionEvent(event) {
    if (event.status === 'error' && event.step && (event.step.startsWith('registrar') || event.step.startsWith('dns'))) {
      hasNonFatalErrors = true;
    }

    const emptyEl = $('#provision-empty');
    if (emptyEl) emptyEl.remove();

    let stepEl = provisionLog.querySelector(`[data-step="${event.step}"]`);
    if (!stepEl) {
      stepEl = document.createElement('div');
      stepEl.dataset.step = event.step;
      provisionLog.appendChild(stepEl);
    }

    stepEl.innerHTML = `
      <div class="provision-step">
        <span class="provision-icon ${event.status}">${STATUS_ICONS[event.status] || ''}</span>
        <span class="provision-message">${escapeHtml(event.message)}</span>
      </div>
      ${event.detail ? `<div class="provision-detail">${escapeHtml(event.detail)}</div>` : ''}`;

    provisionLog.scrollTop = provisionLog.scrollHeight;
    if (event.status === 'done') provisionEventCount++;
    provisionSrStatus.textContent = `${provisionEventCount} steps completed`;
  }

  async function runProvisioning() {
    provisionEventCount = 0;
    hasNonFatalErrors = false;

    const deployNames = { vps: 'AWS VPS', vercel: 'Vercel', railway: 'Railway', cloudflare: 'Cloudflare', static: 'Static S3', docker: 'Docker' };
    $('#provision-log-subtitle').textContent = `Provisioning ${deployNames[state.deployTarget] || state.deployTarget}...`;

    try {
      const res = await fetch('/api/provision/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VoidForge-Request': '1' },
        body: JSON.stringify({
          projectDir: state.projectDir,
          projectName: state.projectName,
          deployTarget: state.deployTarget,
          framework: state.framework,
          database: state.database,
          cache: state.cache,
          instanceType: state.instanceType,
          hostname: state.hostname || undefined,
          registerDomain: state.registerDomain ? true : undefined,
        }),
      });

      const contentType = res.headers.get('Content-Type') || '';
      if (!contentType.includes('text/event-stream')) {
        const data = await res.json();
        addProvisionEvent({ step: 'error', status: 'error', message: data.error || 'Provisioning failed' });
        provisionErrorActions.classList.remove('hidden');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);
            if (event.result) state.provisionResult = event.result;
            if (event.runId) state.provisionRunId = event.runId;
            addProvisionEvent(event);
          } catch { /* skip */ }
        }
      }

      if (state.provisionResult && state.provisionResult.success) {
        provisionDoneActions.classList.remove('hidden');
        if (hasNonFatalErrors) {
          $('#provision-log-subtitle').textContent = 'Infrastructure provisioned. Some optional steps had issues \u2014 see log above.';
          provisionSrStatus.textContent = 'Infrastructure provisioned with warnings. Some optional steps failed. Press Continue.';
        } else {
          provisionSrStatus.textContent = 'Provisioning complete. Press Continue.';
        }
      } else {
        provisionErrorActions.classList.remove('hidden');
      }
    } catch (err) {
      addProvisionEvent({ step: 'connection', status: 'error', message: 'Connection error: ' + err.message });
      provisionErrorActions.classList.remove('hidden');
    }
  }

  $('#provision-next').addEventListener('click', () => goToDone());

  $('#provision-cleanup').addEventListener('click', async () => {
    addProvisionEvent({ step: 'cleanup', status: 'started', message: 'Cleaning up resources...' });
    try {
      const res = await fetch('/api/provision/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VoidForge-Request': '1' },
        body: JSON.stringify({ runId: state.provisionRunId }),
      });
      const data = await res.json();
      addProvisionEvent({ step: 'cleanup', status: data.cleaned ? 'done' : 'error', message: data.message || data.error || 'Unknown' });
    } catch (err) {
      addProvisionEvent({ step: 'cleanup', status: 'error', message: 'Cleanup error: ' + err.message });
    }
  });

  $('#provision-continue').addEventListener('click', () => goToDone());

  // --- Step 4: Done ---

  function goToDone() {
    showStep(4);
    populateDone();
    setTimeout(() => { const h = $('#step-4-heading'); if (h) h.focus(); }, 100);
  }

  function populateDone() {
    const result = state.provisionResult;

    $('#done-details').innerHTML = `
      <p><strong>${escapeHtml(state.projectName)}</strong></p>
      <p style="color: var(--text-dim); font-family: var(--mono); font-size: 13px;">${escapeHtml(state.projectDir)}</p>
    `;

    // Infra details
    const infraCard = $('#infra-details-card');
    const infraDetails = $('#infra-details');

    const labelMap = {
      'SSH_KEY_PATH': 'SSH Key', 'SSH_HOST': 'Server IP', 'SSH_USER': 'SSH User',
      'DB_ENGINE': 'Database', 'DB_PORT': 'DB Port', 'DB_INSTANCE_ID': 'DB Instance',
      'DB_USERNAME': 'DB Username', 'DB_PASSWORD': 'DB Password',
      'REDIS_CLUSTER_ID': 'Redis Cluster',
      'VERCEL_PROJECT_ID': 'Vercel Project ID', 'VERCEL_PROJECT_NAME': 'Project Name',
      'RAILWAY_PROJECT_ID': 'Railway Project ID', 'RAILWAY_PROJECT_NAME': 'Project Name',
      'RAILWAY_DB_PLUGIN': 'Database Service',
      'CF_ACCOUNT_ID': 'Cloudflare Account', 'CF_PROJECT_NAME': 'Project Name',
      'CF_PROJECT_URL': 'Site URL', 'CF_D1_DATABASE_ID': 'D1 Database ID',
      'CF_D1_DATABASE_NAME': 'D1 Database',
      'S3_BUCKET': 'S3 Bucket', 'S3_WEBSITE_URL': 'Website URL',
      'DB_HOST': 'Database Host', 'REDIS_HOST': 'Redis Host', 'REDIS_PORT': 'Redis Port',
      'REGISTRAR_DOMAIN': 'Registered Domain', 'REGISTRAR_EXPIRY': 'Domain Expiry',
      'DNS_HOSTNAME': 'Domain', 'DNS_ZONE_ID': 'DNS Zone ID',
      'VERCEL_DOMAIN': 'Custom Domain', 'RAILWAY_DOMAIN': 'Custom Domain',
      'CF_CUSTOM_DOMAIN': 'Custom Domain',
      'DEPLOY_URL': 'Live URL',
      'GITHUB_REPO_URL': 'GitHub Repository',
      'GITHUB_OWNER': 'GitHub Owner',
      'GITHUB_REPO_NAME': 'GitHub Repo',
    };
    const sensitiveKeys = ['DB_PASSWORD'];
    const urlKeys = ['CF_PROJECT_URL', 'S3_WEBSITE_URL', 'DEPLOY_URL', 'GITHUB_REPO_URL'];

    if (result?.success && result.outputs && Object.keys(result.outputs).length > 0) {
      infraCard.classList.remove('hidden');
      let html = '';

      const displayOrder = [
        'DEPLOY_URL', 'GITHUB_REPO_URL',
        'SSH_KEY_PATH', 'SSH_HOST', 'SSH_USER',
        'DB_ENGINE', 'DB_HOST', 'DB_PORT', 'DB_INSTANCE_ID', 'DB_USERNAME', 'DB_PASSWORD',
        'REDIS_HOST', 'REDIS_PORT', 'REDIS_CLUSTER_ID',
        'VERCEL_PROJECT_ID', 'VERCEL_PROJECT_NAME', 'VERCEL_DOMAIN',
        'RAILWAY_PROJECT_ID', 'RAILWAY_PROJECT_NAME', 'RAILWAY_DB_PLUGIN', 'RAILWAY_DOMAIN',
        'CF_ACCOUNT_ID', 'CF_PROJECT_NAME', 'CF_PROJECT_URL', 'CF_D1_DATABASE_ID', 'CF_D1_DATABASE_NAME', 'CF_CUSTOM_DOMAIN',
        'S3_BUCKET', 'S3_WEBSITE_URL',
        'REGISTRAR_DOMAIN', 'REGISTRAR_EXPIRY',
        'DNS_HOSTNAME', 'DNS_ZONE_ID',
      ];
      const outputKeys = Object.keys(result.outputs);
      const orderedKeys = displayOrder.filter((k) => outputKeys.includes(k));
      const remainingKeys = outputKeys.filter((k) => !displayOrder.includes(k));
      const sortedKeys = [...orderedKeys, ...remainingKeys];

      for (const key of sortedKeys) {
        const value = result.outputs[key];
        const label = labelMap[key] || key.replace(/_/g, ' ');
        const isSensitive = sensitiveKeys.includes(key);
        const isUrl = urlKeys.includes(key);
        let displayValue;
        if (isSensitive) {
          displayValue = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
        } else if (isUrl) {
          displayValue = `<a href="${escapeHtml(value)}" target="_blank" rel="noopener">${escapeHtml(value)}</a>`;
        } else if (key === 'REGISTRAR_EXPIRY' && value) {
          try {
            displayValue = new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(new Date(value));
          } catch { displayValue = escapeHtml(value); }
        } else {
          displayValue = escapeHtml(value);
        }
        html += `<div class="infra-item"><span class="infra-label">${escapeHtml(label)}</span><span class="infra-value">${displayValue}</span></div>`;
      }
      if (result.files && result.files.length > 0) {
        html += `<div class="infra-item"><span class="infra-label">Generated files</span><span class="infra-value">${result.files.length} files</span></div>`;
      }
      infraDetails.innerHTML = html;
    }

    // Next steps per target
    const nextSteps = $('#next-steps-list');
    let stepsHtml = '';
    let deployCmd = '';

    if (result && result.success && result.outputs['SSH_HOST']) {
      deployCmd = `cd "${state.projectDir}" && ./infra/deploy.sh`;
      stepsHtml += `<li>SSH into your server: <code>ssh -i .ssh/deploy-key.pem ec2-user@${escapeHtml(result.outputs['SSH_HOST'])}</code></li>`;
      stepsHtml += '<li>Run <code>infra/provision.sh</code> on the server to install dependencies</li>';
      stepsHtml += `<li>Deploy: <code>./infra/deploy.sh</code></li>`;
    } else if (state.deployTarget === 'vercel') {
      deployCmd = `cd "${state.projectDir}" && npx vercel deploy`;
      stepsHtml += '<li>Link: <code>npx vercel link</code></li>';
      stepsHtml += '<li>Deploy: <code>npx vercel deploy</code></li>';
    } else if (state.deployTarget === 'railway') {
      const rid = result?.outputs?.['RAILWAY_PROJECT_ID'] || '';
      deployCmd = `cd "${state.projectDir}" && railway up`;
      if (rid) stepsHtml += `<li>Link: <code>railway link ${escapeHtml(rid)}</code></li>`;
      stepsHtml += '<li>Deploy: <code>railway up</code></li>';
    } else if (state.deployTarget === 'cloudflare') {
      deployCmd = `cd "${state.projectDir}" && npx wrangler pages deploy ./dist`;
      stepsHtml += '<li>Deploy: <code>npx wrangler pages deploy ./dist</code></li>';
      if (result?.outputs?.['CF_PROJECT_URL']) {
        stepsHtml += `<li>Visit: <a href="${escapeHtml(result.outputs['CF_PROJECT_URL'])}" target="_blank" rel="noopener">${escapeHtml(result.outputs['CF_PROJECT_URL'])}</a></li>`;
      }
    } else if (state.deployTarget === 'static') {
      deployCmd = `cd "${state.projectDir}" && ./infra/deploy-s3.sh`;
      stepsHtml += '<li>Deploy: <code>./infra/deploy-s3.sh</code></li>';
      if (result?.outputs?.['S3_WEBSITE_URL']) {
        stepsHtml += `<li>Visit: <a href="${escapeHtml(result.outputs['S3_WEBSITE_URL'])}" target="_blank" rel="noopener">${escapeHtml(result.outputs['S3_WEBSITE_URL'])}</a></li>`;
      }
    } else if (state.deployTarget === 'docker') {
      deployCmd = `cd "${state.projectDir}" && docker compose up -d`;
      stepsHtml += '<li>Run: <code>docker compose up -d</code></li>';
    }

    nextSteps.innerHTML = stepsHtml;

    // Store deploy command for the copy button
    state.deployCmd = deployCmd;
  }

  // Copy deploy command button — bound once, reads from state
  $('#copy-deploy-cmd').addEventListener('click', () => {
    if (state.deployCmd) {
      copyToClipboard(state.deployCmd).then(() => {
        $('#copy-deploy-cmd').textContent = 'Copied!';
        setTimeout(() => { $('#copy-deploy-cmd').textContent = 'Copy Deploy Command'; }, 2000);
      });
    }
  });

  // --- Utilities ---

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function showStatus(el, type, message) {
    el.className = 'status-row ' + type;
    el.textContent = message;
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); resolve(); }
      catch (e) { reject(e); }
      finally { document.body.removeChild(ta); }
    });
  }

  // Keyboard: Enter triggers contextual action
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
    e.preventDefault();

    if (currentStep === 1) {
      if (!projectCard.classList.contains('hidden') && projectDirInput.value.trim()) {
        scanProjectBtn.click();
      } else if (vaultPasswordInput.value) {
        unlockVaultBtn.click();
      }
    } else if (currentStep === 2) {
      $('#start-provision').click();
    }
  });

  showStep(1);
})();
