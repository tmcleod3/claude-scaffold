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
    provisionResult: null,
    provisionRunId: '',
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const progressBar = $('#progress-bar');
  const stepLabel = $('#step-label');
  const btnBack = $('#btn-back');
  const btnNext = $('#btn-next');

  // --- Navigation ---

  function showStep(step) {
    $$('.step').forEach((el) => el.classList.add('hidden'));
    const target = $(`#step-${step}`);
    if (target) target.classList.remove('hidden');
    currentStep = step;

    const pct = Math.round((step / TOTAL_STEPS) * 100);
    progressBar.style.width = `${pct}%`;
    progressBar.setAttribute('aria-valuenow', String(pct));
    stepLabel.textContent = `Step ${step} of ${TOTAL_STEPS}`;

    btnBack.disabled = step <= 1;
    if (step >= 2) {
      btnNext.style.display = 'none';
      btnBack.style.display = 'none';
    } else {
      btnNext.style.display = '';
      btnBack.style.display = '';
    }

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

  // Check vault state on load
  fetch('/api/credentials/status')
    .then((r) => r.json())
    .then((data) => {
      if (data.unlocked) {
        showStatus(vaultStatus, 'success', 'Vault already unlocked');
        projectCard.classList.remove('hidden');
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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

        showStatus(projectStatus, 'success', `Found: ${data.name} (${data.deploy || 'docker'})`);

        // Populate step 2 summary
        const deployNames = { vps: 'AWS VPS (EC2)', vercel: 'Vercel', railway: 'Railway', cloudflare: 'Cloudflare', static: 'Static (S3)', docker: 'Docker' };
        $('#summary-name').textContent = data.name;
        $('#summary-framework').textContent = data.framework || 'auto-detect';
        $('#summary-database').textContent = data.database || 'none';
        $('#summary-deploy').textContent = deployNames[data.deploy] || data.deploy || 'Docker';

        // Set confirmation description
        const descriptions = {
          docker: 'This will generate a Dockerfile, docker-compose.yml, and .dockerignore. No cloud resources will be created.',
          vps: 'This will create AWS resources: EC2 instance (t3.micro), security group, SSH key pair. These resources will incur AWS charges.',
          vercel: 'This will create a project on your Vercel account. Free tier covers most hobby projects.',
          railway: 'This will create a project on your Railway account with optional database/Redis services.',
          cloudflare: 'This will create a Cloudflare Pages project, optionally with a D1 database. Pages has a generous free tier.',
          static: 'This will create an S3 bucket configured for static website hosting. Minimal AWS charges.',
        };
        $('#provision-confirm-desc').textContent = descriptions[state.deployTarget] || 'This will provision your deploy target.';

        // Auto-advance to step 2
        setTimeout(() => showStep(2), 400);
      } else {
        showStatus(projectStatus, 'error', data.error || 'Not a valid VoidForge project');
      }
    } catch (err) {
      showStatus(projectStatus, 'error', 'Scan failed: ' + err.message);
    } finally {
      scanProjectBtn.disabled = false;
    }
  });

  // --- Step 2: Confirm ---

  $('#start-provision').addEventListener('click', () => {
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

  function addProvisionEvent(event) {
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

    const deployNames = { vps: 'AWS VPS', vercel: 'Vercel', railway: 'Railway', cloudflare: 'Cloudflare', static: 'Static S3', docker: 'Docker' };
    $('#provision-log-subtitle').textContent = `Provisioning ${deployNames[state.deployTarget] || state.deployTarget}...`;

    try {
      const res = await fetch('/api/provision/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectDir: state.projectDir,
          projectName: state.projectName,
          deployTarget: state.deployTarget,
          framework: state.framework,
          database: state.database,
          cache: state.cache,
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
        provisionSrStatus.textContent = 'Provisioning complete. Press Continue.';
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
        headers: { 'Content-Type': 'application/json' },
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
    };
    const sensitiveKeys = ['DB_PASSWORD'];
    const urlKeys = ['CF_PROJECT_URL', 'S3_WEBSITE_URL'];

    if (result && result.success && Object.keys(result.outputs).length > 0) {
      infraCard.classList.remove('hidden');
      let html = '';
      for (const [key, value] of Object.entries(result.outputs)) {
        const label = labelMap[key] || key.replace(/_/g, ' ');
        const isSensitive = sensitiveKeys.includes(key);
        const isUrl = urlKeys.includes(key);
        let displayValue;
        if (isSensitive) {
          displayValue = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
        } else if (isUrl) {
          displayValue = `<a href="${escapeHtml(value)}" target="_blank" rel="noopener">${escapeHtml(value)}</a>`;
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

    // Copy deploy command button
    $('#copy-deploy-cmd').addEventListener('click', () => {
      if (deployCmd) {
        copyToClipboard(deployCmd).then(() => {
          $('#copy-deploy-cmd').textContent = 'Copied!';
          setTimeout(() => { $('#copy-deploy-cmd').textContent = 'Copy Deploy Command'; }, 2000);
        });
      }
    });
  }

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
    }
  });

  showStep(1);
})();
