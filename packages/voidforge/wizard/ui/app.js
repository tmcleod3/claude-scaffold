/**
 * VoidForge Wizard — Vanilla JS Step Machine
 * Gandalf — Setup Wizard (Three-Act Flow, v7.1)
 * Act 1: 1=Vault, 2=API Key
 * Act 2: 3=Project, 4=PRD, 4b=Credentials
 * Act 3: 5=Operations Menu, 6=Review, 7=Create/Done
 */

(function () {
  'use strict';

  const TOTAL_STEPS = 7;
  let currentStep = 1;

  // State
  const state = {
    anthropicKeyStored: false,
    cloudProviders: {},   // { aws: true, vercel: false, ... }
    projectName: '',
    projectDir: '',
    projectDesc: '',
    projectDomain: '',
    projectHostname: '',
    prdMode: 'generate',  // 'generate' | 'paste' | 'skip'
    prdContent: '',
    generatedPrd: '',
    deployTarget: '',
    createdDir: '',
    envGroups: [],        // PRD-driven env credential groups
    envCredentials: {},   // { VAR_NAME: 'value', ... }
  };

  // DOM refs
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const progressBar = $('#progress-bar');
  const stepLabel = $('#step-label');
  const btnBack = $('#btn-back');
  const btnNext = $('#btn-next');

  // --- Navigation ---

  function showStep(step) {
    // ENCHANT-R2-012 + CROSS-R4-016: Determine direction for animation
    const goingBack = (typeof step === 'number' && typeof currentStep === 'number' && step < currentStep) ||
                      (step === 4 && currentStep === '4b') ||
                      (step === '4b' && currentStep === 5);
    $$('.step').forEach((el) => {
      el.classList.add('hidden');
      el.classList.remove('entering-backward');
    });
    const target = $(`#step-${step}`);
    if (target) {
      if (goingBack) target.classList.add('entering-backward');
      target.classList.remove('hidden');
    }

    currentStep = step;

    // Act-based progress: Act 1 (steps 1-2), Act 2 (steps 3-4b), Act 3 (steps 5-7)
    const hasEnvStep = state.envGroups.length > 0;
    const visibleSteps = hasEnvStep ? [1, 2, 3, 4, '4b', 5, 6, 7] : [1, 2, 3, 4, 5, 6, 7];
    const currentIdx = visibleSteps.indexOf(step);
    const totalVisible = visibleSteps.length;
    const displayNum = currentIdx >= 0 ? currentIdx + 1 : (typeof step === 'number' ? step : 5);

    const pct = Math.round((displayNum / totalVisible) * 100);
    progressBar.style.width = `${pct}%`;
    progressBar.setAttribute('aria-valuenow', String(pct));

    // Show act labels instead of step numbers
    let actLabel = 'Act 1 — Secure Your Forge';
    if (step >= 3 && step !== 5 && step !== 6 && step !== 7) actLabel = 'Act 2 — Describe Your Vision';
    if (step === '4b') actLabel = 'Act 2 — Describe Your Vision';
    if (step >= 5) actLabel = 'Act 3 — Equip Your Project';
    if (step === 6) actLabel = 'Review';
    if (step === 7) actLabel = 'Creating';
    stepLabel.textContent = actLabel;

    btnBack.disabled = step === 1;

    if (step === 6) {
      btnNext.textContent = 'Create Project';
    } else if (step === 7) {
      btnNext.style.display = 'none';
      btnBack.style.display = 'none';
    } else if (step === '4b') {
      // Step 4b has its own Store/Skip buttons, hide main nav Next
      btnNext.style.display = 'none';
      btnBack.style.display = '';
    } else {
      btnNext.textContent = 'Next';
      btnNext.style.display = '';
      btnBack.style.display = '';
    }

    // Focus first input
    const firstInput = target?.querySelector('input, textarea, select');
    if (firstInput) setTimeout(() => firstInput.focus(), 100);
  }

  function syncState() {
    if (currentStep === 3) {
      state.projectName = $('#project-name').value.trim();
      state.projectDir = $('#project-dir').value.trim();
      state.projectDesc = $('#project-desc').value.trim();
    }
    if (currentStep === 5) {
      // Domain/hostname are now in the operations menu
      state.projectDomain = $('#project-domain')?.value.trim() || '';
      state.projectHostname = $('#project-hostname')?.value.trim() || '';
    }
    if (currentStep === 4) {
      if (state.prdMode === 'paste') {
        state.prdContent = $('#prd-paste').value.trim();
      } else if (state.prdMode === 'generate' && state.generatedPrd) {
        state.prdContent = state.generatedPrd;
      } else {
        state.prdContent = '';
      }
    }
    // Deploy target is set directly by card clicks — no sync needed
  }

  function canAdvance() {
    switch (currentStep) {
      case 1: return true; // Vault unlock handled by button, not Next
      case 2: return true; // API key has skip option
      case 3: return state.projectName.trim() !== '' && state.projectDir.trim() !== '';
      case 4: return true; // PRD optional
      case 5: return true; // Operations menu — all optional
      case 6: return true;
      default: return false;
    }
  }

  async function nextStep() {
    syncState();
    if (!canAdvance()) {
      showValidationErrors();
      return;
    }
    clearValidationErrors();

    // After PRD step (4), check for env requirements then go to operations menu
    if (currentStep === 4) {
      const prdText = state.prdContent || state.generatedPrd || '';
      if (prdText) {
        const envGroups = await loadEnvRequirements(prdText);
        state.envGroups = envGroups;
        if (envGroups.length > 0) {
          renderEnvCredentials(envGroups);
          showStep('4b');
          return;
        }
      }
      // No env requirements — go to operations menu
      await loadDeployTargets();
      loadCloudProviders();
      showStep(5);
      return;
    }

    // After 4b, proceed to operations menu
    if (currentStep === '4b') {
      await loadDeployTargets();
      loadCloudProviders();
      showStep(5);
      return;
    }

    if (currentStep === 6) {
      createProject();
      showStep(7);
      return;
    }

    // Blueprint auto-detection: when moving from Step 3 → Step 4,
    // check if docs/PRD.md already exists in the TARGET project directory (not CWD).
    // During init, the project dir doesn't exist yet — detection is skipped.
    if (currentStep === 3 && state.projectDir) {
      try {
        const detectRes = await fetch('/api/blueprint/detect?dir=' + encodeURIComponent(state.projectDir));
        const detectData = await detectRes.json();
        if (detectData.detected) {
          const blueprintBanner = $('#blueprint-detection');
          if (blueprintBanner) {
            $('#blueprint-project-name').textContent = detectData.name || 'your project';
            blueprintBanner.classList.remove('hidden');
            // User clicks "Use my blueprint" → redirect to /blueprint flow
            // User clicks "Start fresh" → continue to Step 4 normally
            return; // Pause navigation until user decides
          }
        }
      } catch { /* detection failed — proceed normally */ }
    }

    if (currentStep < TOTAL_STEPS) {
      const nextStepNum = currentStep + 1;
      if (nextStepNum === 5) await loadDeployTargets();
      if (nextStepNum === 6) populateReview();
      showStep(nextStepNum);
    }
  }

  function prevStep() {
    if (currentStep === 1) return;
    if (currentStep === '4b') { showStep(4); return; }
    if (currentStep === 5 && state.envGroups.length > 0) { showStep('4b'); return; }
    if (currentStep === 5) { showStep(4); return; }
    if (currentStep === 6) { showStep(5); return; }
    showStep(currentStep - 1);
  }

  btnNext.addEventListener('click', nextStep);
  btnBack.addEventListener('click', prevStep);

  // Keyboard: Enter triggers contextual action
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.tagName === 'TEXTAREA') return;
    // Don't intercept Enter on buttons, links, or selects — let native behavior handle them
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A' || e.target.tagName === 'SELECT') return;
    e.preventDefault();

    if (currentStep === 1) {
      if (vaultPasswordInput.value) unlockVaultBtn.click();
      return;
    }
    if (currentStep === 2) {
      if (keyInput.value.trim()) validateKeyBtn.click();
      else nextStep(); // skip
      return;
    }

    if (currentStep === '4b') return; // Step 4b has its own Store/Skip buttons

    if (currentStep === 4) {
      const generateTab = $('#tab-generate');
      const ideaField = $('#prd-idea');
      if (generateTab.classList.contains('active') && ideaField.value.trim() && !state.generatedPrd) {
        generatePrdBtn.click();
        return;
      }
    }

    nextStep();
  });

  // =============================================
  // Step 1: Vault + API Key
  // =============================================

  const vaultPasswordInput = $('#vault-password');
  const vaultStatus = $('#vault-status');
  const unlockVaultBtn = $('#unlock-vault');
  const toggleVaultBtn = $('#toggle-vault-visibility');
  const vaultCard = $('#vault-card');
  const apikeyCard = $('#apikey-card');

  const keyInput = $('#anthropic-key');
  const keyStatus = $('#key-status');
  const validateKeyBtn = $('#validate-key');
  const toggleKeyBtn = $('#toggle-key-visibility');

  toggleVaultBtn.addEventListener('click', () => {
    const isPassword = vaultPasswordInput.type === 'password';
    vaultPasswordInput.type = isPassword ? 'text' : 'password';
    toggleVaultBtn.textContent = isPassword ? 'Hide' : 'Show';
  });

  toggleKeyBtn.addEventListener('click', () => {
    const isPassword = keyInput.type === 'password';
    keyInput.type = isPassword ? 'text' : 'password';
    toggleKeyBtn.textContent = isPassword ? 'Hide' : 'Show';
  });

  // Check vault state on load
  fetch('/api/credentials/status')
    .then((r) => r.json())
    .then((data) => {
      if (data.vaultPath) $('#vault-path').textContent = data.vaultPath;
      if (data.vaultExists) {
        $('#vault-password-label').textContent = 'Vault Password';
        vaultPasswordInput.placeholder = 'Enter your vault password';
        $('#vault-hint').textContent = 'Enter the password you used to create this vault.';
      }
      if (data.unlocked && data.anthropic) {
        state.anthropicKeyStored = true;
        vaultCard.classList.add('hidden');
        apikeyCard.classList.remove('hidden');
        showStatus(keyStatus, 'success', 'API key already stored in vault');
        keyInput.placeholder = 'Key already stored — enter a new one to replace';
      }
    })
    .catch(() => {});

  unlockVaultBtn.addEventListener('click', async () => {
    const password = vaultPasswordInput.value;
    if (!password) { showStatus(vaultStatus, 'error', 'Please enter a password'); return; }
    if (password.length < 8) { showStatus(vaultStatus, 'error', 'Password must be at least 8 characters'); return; }

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
        // ENCHANT-R2-003 + CROSS-R4-017: Forge-lit pulse on vault unlock (force replay)
        const vc = document.getElementById('vault-card');
        if (vc) { vc.classList.remove('forge-lit'); void vc.offsetWidth; vc.classList.add('forge-lit'); }
        if (data.anthropic) {
          state.anthropicKeyStored = true;
          showStatus(vaultStatus, 'success', 'Vault unlocked — API key found');
          setTimeout(() => showStep(3), 900);
        } else {
          showStatus(vaultStatus, 'success', 'Vault unlocked');
          setTimeout(() => showStep(2), 900);
        }
      } else {
        showStatus(vaultStatus, 'error', data.error || 'Failed to unlock');
      }
    } catch (err) {
      showStatus(vaultStatus, 'error', 'Connection error: ' + err.message);
    } finally {
      unlockVaultBtn.disabled = false;
    }
  });

  validateKeyBtn.addEventListener('click', async () => {
    const apiKey = keyInput.value.trim();
    if (!apiKey) { showStatus(keyStatus, 'error', 'Please enter your API key'); return; }

    showStatus(keyStatus, 'loading', 'Validating...');
    validateKeyBtn.disabled = true;

    try {
      const res = await fetch('/api/credentials/anthropic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VoidForge-Request': '1' },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();

      if (res.ok && data.stored) {
        showStatus(keyStatus, 'success', 'Key validated and stored in vault');
        state.anthropicKeyStored = true;
        setTimeout(() => showStep(3), 600);
      } else {
        showStatus(keyStatus, 'error', data.error || 'Validation failed');
      }
    } catch (err) {
      showStatus(keyStatus, 'error', 'Connection error: ' + err.message);
    } finally {
      validateKeyBtn.disabled = false;
    }
  });

  // =============================================
  // Step 2: API Key + Skip
  // =============================================

  let providersLoaded = false;

  /** Make a div act as a keyboard-accessible button */
  function activateOnKeyboard(el, handler) {
    el.addEventListener('click', handler);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler(e);
      }
    });
  }

  // Skip API key button
  $('#skip-key')?.addEventListener('click', () => {
    showStep(3);
  });

  async function loadCloudProviders() {
    if (providersLoaded) return;
    providersLoaded = true;

    try {
      const [provRes, statusRes] = await Promise.all([
        fetch('/api/cloud/providers').then((r) => r.json()),
        fetch('/api/cloud/status').then((r) => r.json()),
      ]);

      const container = $('#cloud-providers-list');
      container.innerHTML = '';

      for (const provider of provRes.providers) {
        const configured = statusRes.status[provider.id] || false;
        state.cloudProviders[provider.id] = configured;

        const card = document.createElement('div');
        card.className = 'provider-card' + (configured ? ' configured' : '');
        card.dataset.provider = provider.id;

        const badge = configured
          ? '<span class="provider-badge connected">Connected</span>'
          : '<span class="provider-badge not-connected">Not connected</span>';

        let fieldsHtml = '';
        for (const field of provider.fields) {
          fieldsHtml += `
            <div class="field">
              <label for="cloud-${field.key}">${field.label}</label>
              <input type="${field.secret ? 'password' : 'text'}" id="cloud-${field.key}"
                     data-field-key="${field.key}" placeholder="${field.placeholder}" autocomplete="off">
            </div>`;
        }

        card.innerHTML = `
          <div class="provider-header" data-toggle="${provider.id}" role="button" tabindex="0" aria-expanded="false">
            <div class="provider-header-left">
              <span class="provider-chevron">&#9654;</span>
              <div>
                <div class="provider-name">${provider.name} <button class="provider-help-btn" data-help="${provider.id}" type="button" title="How to get credentials">?</button></div>
                <div class="provider-desc">${provider.description}</div>
              </div>
            </div>
            ${badge}
          </div>
          <div class="provider-body hidden" id="body-${provider.id}">
            <div class="provider-help hidden" id="help-${provider.id}">
              <button class="provider-help-close" data-close-help="${provider.id}" type="button" title="Close">&times;</button>
              ${provider.help}
              <a class="help-link" href="${provider.credentialUrl}" target="_blank" rel="noopener">Open ${provider.name} Credentials Page &rarr;</a>
            </div>
            <div class="provider-fields" id="fields-${provider.id}">
            ${fieldsHtml}
            <div class="btn-row">
              <button class="btn btn-primary btn-small" data-validate="${provider.id}" type="button">
                ${configured ? 'Update' : 'Connect'}
              </button>
              ${configured ? `<button class="btn btn-secondary btn-small" data-remove="${provider.id}" type="button">Remove</button>` : ''}
            </div>
            <div class="status-row" id="cloud-status-${provider.id}"></div>
            </div>
          </div>`;

        container.appendChild(card);
      }

      // Toggle accordion on header click or keyboard (Enter/Space)
      function toggleAccordion(toggle) {
        const id = toggle.dataset.toggle;
        const card = toggle.closest('.provider-card');
        const body = $(`#body-${id}`);
        const isOpen = !body.classList.contains('hidden');
        body.classList.toggle('hidden');
        card.classList.toggle('open', !isOpen);
        toggle.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      }

      container.addEventListener('click', (e) => {
        if (e.target.closest('[data-help]')) return;
        if (e.target.closest('[data-close-help]')) return;
        const toggle = e.target.closest('[data-toggle]');
        if (toggle) toggleAccordion(toggle);
      });

      container.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (e.target.closest('[data-help]')) return;
        if (e.target.closest('[data-close-help]')) return;
        const toggle = e.target.closest('[data-toggle]');
        if (toggle) {
          e.preventDefault();
          toggleAccordion(toggle);
        }
      });

      // Help button toggles
      container.addEventListener('click', (e) => {
        const helpBtn = e.target.closest('[data-help]');
        if (helpBtn) {
          e.stopPropagation();
          const providerId = helpBtn.dataset.help;
          // Expand the accordion if it's collapsed so the help panel is visible
          const body = $(`#body-${providerId}`);
          const card = helpBtn.closest('.provider-card');
          if (body.classList.contains('hidden')) {
            body.classList.remove('hidden');
            card.classList.add('open');
          }
          $(`#help-${providerId}`).classList.toggle('hidden');
          return;
        }
        const closeBtn = e.target.closest('[data-close-help]');
        if (closeBtn) {
          e.stopPropagation();
          $(`#help-${closeBtn.dataset.closeHelp}`).classList.add('hidden');
          return;
        }
      });

      // Validate buttons
      container.addEventListener('click', async (e) => {
        const validateBtn = e.target.closest('[data-validate]');
        if (!validateBtn) return;

        const providerId = validateBtn.dataset.validate;
        const statusEl = $(`#cloud-status-${providerId}`);
        const card = validateBtn.closest('.provider-card');

        const credentials = {};
        card.querySelectorAll('[data-field-key]').forEach((input) => {
          if (input.value.trim()) credentials[input.dataset.fieldKey] = input.value.trim();
        });

        const provider = provRes.providers.find((p) => p.id === providerId);
        const missing = provider.fields.filter((f) => !f.optional && !credentials[f.key]);
        if (missing.length > 0) {
          showStatus(statusEl, 'error', `Missing: ${missing.map((f) => f.label).join(', ')}`);
          return;
        }

        showStatus(statusEl, 'loading', 'Validating...');
        validateBtn.disabled = true;

        try {
          const res = await fetch('/api/cloud/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-VoidForge-Request': '1' },
            body: JSON.stringify({ provider: providerId, credentials }),
          });
          const data = await res.json();

          if (res.ok && data.stored) {
            const identity = data.identity ? ` (${data.identity})` : '';
            showStatus(statusEl, 'success', `Connected${identity}`);
            state.cloudProviders[providerId] = true;
            card.classList.add('configured');
            card.querySelector('.provider-badge').className = 'provider-badge connected';
            card.querySelector('.provider-badge').textContent = 'Connected';
          } else {
            showStatus(statusEl, 'error', data.error || 'Validation failed');
          }
        } catch (err) {
          showStatus(statusEl, 'error', 'Connection error: ' + err.message);
        } finally {
          validateBtn.disabled = false;
        }
      });

      // Remove buttons
      container.addEventListener('click', async (e) => {
        const removeBtn = e.target.closest('[data-remove]');
        if (!removeBtn) return;

        const providerId = removeBtn.dataset.remove;
        const statusEl = $(`#cloud-status-${providerId}`);
        const card = removeBtn.closest('.provider-card');

        try {
          await fetch('/api/cloud/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-VoidForge-Request': '1' },
            body: JSON.stringify({ provider: providerId }),
          });

          state.cloudProviders[providerId] = false;
          card.classList.remove('configured');
          card.querySelector('.provider-badge').className = 'provider-badge not-connected';
          card.querySelector('.provider-badge').textContent = 'Not connected';
          showStatus(statusEl, 'info', 'Credentials removed');
          removeBtn.remove();
        } catch (err) {
          showStatus(statusEl, 'error', 'Failed to remove: ' + err.message);
        }
      });

    } catch (err) {
      $('#cloud-providers-list').innerHTML = `<div class="status-row error">Failed to load providers: ${escapeHtml(err.message)}</div>`;
    }
  }

  // Step 4b needs to re-show nav buttons properly
  const origShowStep = showStep;
  showStep = function (step) {
    if (step === '4b') {
      btnNext.style.display = 'none';
      btnBack.style.display = '';
      btnBack.disabled = false;
    }
    origShowStep(step);
  };

  // =============================================
  // Step 3: Project Setup
  // =============================================

  const projectNameInput = $('#project-name');
  const projectDirInput = $('#project-dir');

  projectNameInput.addEventListener('input', () => {
    const name = projectNameInput.value.trim();
    if (name && !projectDirInput.dataset.manual) {
      const slug = name.toLowerCase().replace(/[^a-z0-9\-_\s]/g, '').replace(/\s+/g, '-');
      fetch('/api/project/defaults')
        .then((r) => r.json())
        .then((data) => {
          if (!projectDirInput.dataset.manual) {
            projectDirInput.value = data.baseDir + '/' + slug;
          }
        })
        .catch(() => {});
    }
    state.projectName = name;
  });

  projectDirInput.addEventListener('input', () => {
    projectDirInput.dataset.manual = 'true';
    state.projectDir = projectDirInput.value.trim();
  });

  // Clear individual validation errors on input
  projectNameInput.addEventListener('input', () => {
    const err = $('#project-name-error');
    if (err && !err.classList.contains('hidden')) {
      projectNameInput.style.borderColor = '';
      projectNameInput.removeAttribute('aria-invalid');
      err.textContent = '';
      err.classList.add('hidden');
    }
  });
  projectDirInput.addEventListener('input', () => {
    const err = $('#project-dir-error');
    if (err && !err.classList.contains('hidden')) {
      projectDirInput.style.borderColor = '';
      projectDirInput.removeAttribute('aria-invalid');
      err.textContent = '';
      err.classList.add('hidden');
    }
  });

  // =============================================
  // Step 4: PRD
  // =============================================

  function activatePrdTab(tab) {
    const allTabs = Array.from($$('.tab'));
    allTabs.forEach((t) => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
      t.setAttribute('tabindex', '-1');
    });
    $$('.tab-panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    tab.setAttribute('tabindex', '0');
    tab.focus();
    const panel = $(`#tab-${tab.dataset.tab}`);
    if (panel) panel.classList.add('active');
    state.prdMode = tab.dataset.tab;
  }

  $$('.tab').forEach((tab, i) => {
    // Set initial tabindex: only active tab is tabbable
    tab.setAttribute('tabindex', i === 0 ? '0' : '-1');
    tab.addEventListener('click', () => { activatePrdTab(tab); });
  });

  // Keyboard navigation for PRD tabs (WAI-ARIA tab pattern)
  const prdTablist = $('[role="tablist"]');
  if (prdTablist) {
    prdTablist.addEventListener('keydown', (e) => {
      const tabArray = Array.from($$('.tab'));
      const idx = tabArray.indexOf(document.activeElement);
      if (idx === -1) return;

      let newIdx = -1;
      if (e.key === 'ArrowRight') {
        newIdx = (idx + 1) % tabArray.length;
      } else if (e.key === 'ArrowLeft') {
        newIdx = (idx - 1 + tabArray.length) % tabArray.length;
      } else if (e.key === 'Home') {
        newIdx = 0;
      } else if (e.key === 'End') {
        newIdx = tabArray.length - 1;
      }

      if (newIdx >= 0) {
        e.preventDefault();
        activatePrdTab(tabArray[newIdx]);
      }
    });
  }

  const validatePrdBtn = $('#validate-prd');
  const prdStatus = $('#prd-status');

  validatePrdBtn.addEventListener('click', async () => {
    const content = $('#prd-paste').value.trim();
    if (!content) { showStatus(prdStatus, 'error', 'Paste your PRD content first'); return; }

    try {
      const res = await fetch('/api/prd/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VoidForge-Request': '1' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();

      if (data.valid) {
        showStatus(prdStatus, 'success', `Valid frontmatter: ${data.frontmatter.name || 'unnamed'} (${data.frontmatter.type || 'no type'})`);
      } else {
        showStatus(prdStatus, 'error', data.errors.join(', '));
      }
    } catch (err) {
      showStatus(prdStatus, 'error', 'Validation error: ' + err.message);
    }
  });

  // PRD file upload + drag-and-drop
  const dropzone = $('#prd-dropzone');
  const fileInput = $('#prd-file-input');
  const prdTextarea = $('#prd-paste');

  if (dropzone && fileInput) {
    function handlePrdFile(file) {
      const reader = new FileReader();
      reader.onload = function (e) {
        prdTextarea.value = e.target.result;
        showStatus(prdStatus, 'success', 'Loaded: ' + file.name + ' (' + file.size + ' bytes)');
        dropzone.style.borderColor = 'var(--accent, #5b5bf7)';
        setTimeout(function () { dropzone.style.borderColor = ''; }, 2000);
      };
      reader.onerror = function () {
        showStatus(prdStatus, 'error', 'Failed to read file');
      };
      reader.readAsText(file);
    }

    dropzone.addEventListener('click', function () { fileInput.click(); });
    dropzone.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });

    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) handlePrdFile(fileInput.files[0]);
    });

    dropzone.addEventListener('dragover', function (e) {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--accent, #5b5bf7)';
      dropzone.style.background = 'rgba(91, 91, 247, 0.05)';
    });
    dropzone.addEventListener('dragleave', function () {
      dropzone.style.borderColor = '';
      dropzone.style.background = '';
    });
    dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropzone.style.borderColor = '';
      dropzone.style.background = '';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handlePrdFile(e.dataTransfer.files[0]);
    });
  }

  let cachedPrompt = null;
  $('#copy-prd-prompt').addEventListener('click', async () => {
    const promptCopyStatus = $('#prompt-copy-status');
    try {
      if (!cachedPrompt) {
        showStatus(promptCopyStatus, 'loading', 'Loading prompt...');
        const res = await fetch('/api/prd/prompt');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load prompt');
        cachedPrompt = data.prompt;
      }
      await copyToClipboard(cachedPrompt);
      showStatus(promptCopyStatus, 'success', 'Prompt copied — paste it into your AI of choice, add your idea, then paste the result above');
    } catch (err) {
      showStatus(promptCopyStatus, 'error', 'Failed to copy: ' + err.message);
    }
  });

  const generatePrdBtn = $('#generate-prd');
  const generationOutput = $('#generation-output');
  const generatedContent = $('#generated-prd-content');

  generatePrdBtn.addEventListener('click', async () => {
    const idea = $('#prd-idea').value.trim();
    if (!idea) {
      showStatus($('#generate-status'), 'error', 'Describe your idea first');
      return;
    }
    $('#generate-status').className = 'status-row';

    generatePrdBtn.disabled = true;
    generatePrdBtn.textContent = 'Generating...';
    generationOutput.classList.remove('hidden');
    generatedContent.textContent = '';
    // ENCHANT-R2-006: Add streaming cursor
    generatedContent.classList.add('streaming');
    state.generatedPrd = '';

    try {
      const res = await fetch('/api/prd/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VoidForge-Request': '1' },
        body: JSON.stringify({
          idea,
          name: state.projectName,
          framework: $('#pref-framework').value,
          database: $('#pref-database').value,
          deploy: $('#pref-deploy').value,
        }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let wasTruncated = false;

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
            const parsed = JSON.parse(data);
            if (parsed.text) {
              state.generatedPrd += parsed.text;
              generatedContent.textContent = state.generatedPrd;
              generatedContent.scrollTop = generatedContent.scrollHeight;
            }
            if (parsed.truncated) {
              wasTruncated = true;
            }
            if (parsed.error) {
              generatedContent.textContent += '\n\nError: ' + parsed.error;
            }
          } catch { /* skip */ }
        }
      }

      if (wasTruncated) {
        showStatus($('#generate-status'), 'error',
          'PRD was truncated — the output hit the model token limit. Try a shorter idea description or generate again with fewer details.');
      }
    } catch (err) {
      generatedContent.textContent += '\n\nConnection error: ' + err.message;
    } finally {
      // ENCHANT-R2-006: Remove streaming cursor when done
      generatedContent.classList.remove('streaming');
      generatePrdBtn.disabled = false;
      generatePrdBtn.textContent = 'Generate PRD with Claude';
    }
  });

  $('#copy-generated').addEventListener('click', () => {
    if (!state.generatedPrd) return;
    copyToClipboard(state.generatedPrd).then(() => {
      $('#copy-generated').textContent = 'Copied!';
      setTimeout(() => { $('#copy-generated').textContent = 'Copy'; }, 2000);
    });
  });

  // =============================================
  // Step 4b: PRD-Driven Credentials
  // =============================================

  async function loadEnvRequirements(prdText) {
    try {
      const res = await fetch('/api/prd/env-requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VoidForge-Request': '1' },
        body: JSON.stringify({ content: prdText }),
      });
      const data = await res.json();
      return data.groups || [];
    } catch {
      return [];
    }
  }

  function renderEnvCredentials(groups) {
    const container = $('#env-credentials-list');
    const emptyEl = $('#env-credentials-empty');
    container.innerHTML = '';

    if (groups.length === 0) {
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');

    for (const group of groups) {
      const section = document.createElement('div');
      section.className = 'card';
      section.style.marginBottom = '12px';

      let fieldsHtml = '';
      for (const field of group.fields) {
        fieldsHtml += `
          <div class="field">
            <label for="env-${field.key}">${escapeHtml(field.label)}</label>
            <input type="${field.secret ? 'password' : 'text'}" id="env-${field.key}"
                   data-env-key="${field.key}" placeholder="${escapeHtml(field.placeholder)}" autocomplete="off">
          </div>`;
      }

      section.innerHTML = `
        <h3>${escapeHtml(group.name)}</h3>
        ${fieldsHtml}`;
      container.appendChild(section);
    }
  }

  // Store All button
  $('#store-env-credentials')?.addEventListener('click', async () => {
    const statusEl = $('#env-store-status');
    const inputs = $$('[data-env-key]');
    const credentials = {};
    let count = 0;

    inputs.forEach((input) => {
      if (input.value.trim()) {
        credentials[input.dataset.envKey] = input.value.trim();
        count++;
      }
    });

    if (count === 0) {
      showStatus(statusEl, 'info', 'No credentials entered — skipping.');
      proceedFromEnvStep();
      return;
    }

    showStatus(statusEl, 'loading', `Storing ${count} credentials in vault...`);
    try {
      const res = await fetch('/api/credentials/env-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VoidForge-Request': '1' },
        body: JSON.stringify({ credentials }),
      });
      const data = await res.json();

      if (res.ok && data.stored) {
        state.envCredentials = credentials;
        showStatus(statusEl, 'success', `${count} credentials stored in vault`);
        setTimeout(proceedFromEnvStep, 600);
      } else {
        showStatus(statusEl, 'error', data.error || 'Failed to store credentials');
      }
    } catch (err) {
      showStatus(statusEl, 'error', 'Connection error: ' + err.message);
    }
  });

  // Skip button
  $('#skip-env-credentials')?.addEventListener('click', () => {
    proceedFromEnvStep();
  });

  function proceedFromEnvStep() {
    Promise.all([loadDeployTargets(), loadCloudProviders()]).then(() => showStep(5));
  }

  // =============================================
  // Step 5: Deploy Target
  // =============================================

  async function loadDeployTargets() {
    try {
      const res = await fetch('/api/cloud/deploy-targets');
      const data = await res.json();

      const container = $('#deploy-targets-list');
      const noteEl = $('#deploy-note');
      container.innerHTML = '';

      if (!state.deployTarget) {
        state.deployTarget = 'docker';
      }

      const availableTargets = data.targets.filter((t) => t.available);
      const onlyDocker = availableTargets.length === 1 && availableTargets[0].id === 'docker';

      if (onlyDocker) {
        state.deployTarget = 'docker';
        noteEl.innerHTML = '<div class="status-row info" style="margin-top: 16px;">No cloud providers configured, so <strong>Docker (local)</strong> is preselected. You can add cloud credentials later by re-running the wizard.</div>';
      } else {
        noteEl.innerHTML = '';
      }

      for (const target of data.targets) {
        const card = document.createElement('div');
        card.className = 'deploy-card' + (target.available ? '' : ' unavailable');
        if (state.deployTarget === target.id) card.classList.add('selected');
        card.dataset.target = target.id;
        card.setAttribute('role', 'radio');
        card.setAttribute('aria-checked', state.deployTarget === target.id ? 'true' : 'false');
        if (target.available) {
          card.tabIndex = 0;
        } else {
          card.setAttribute('aria-disabled', 'true');
        }

        const badge = target.available
          ? '<span class="provider-badge connected">Ready</span>'
          : `<span class="provider-badge not-connected">Needs ${target.provider || 'setup'}</span>`;

        card.innerHTML = `
          <div class="deploy-card-header">
            <span class="deploy-card-name">${target.name}</span>
            ${badge}
          </div>
          <div class="deploy-card-desc">${target.description}</div>`;

        const selectTarget = () => {
          if (!target.available) return;
          $$('.deploy-card').forEach((c) => {
            c.classList.remove('selected');
            c.setAttribute('aria-checked', 'false');
          });
          card.classList.add('selected');
          card.setAttribute('aria-checked', 'true');
          state.deployTarget = target.id;
        };
        activateOnKeyboard(card, selectTarget);

        container.appendChild(card);
      }
    } catch (err) {
      $('#deploy-targets-list').innerHTML = `<div class="status-row error">Failed to load targets: ${escapeHtml(err.message)}</div>`;
    }
  }

  // =============================================
  // Step 6: Review
  // =============================================

  function populateReview() {
    $('#review-name').textContent = state.projectName;
    $('#review-dir').textContent = state.projectDir;
    $('#review-desc').textContent = state.projectDesc || '(not set)';
    $('#review-domain').textContent = state.projectDomain || '(not set)';
    $('#review-hostname').textContent = state.projectHostname || '(not set)';
    const deployNames = { vps: 'VPS (AWS EC2)', vercel: 'Vercel', railway: 'Railway', cloudflare: 'Cloudflare Workers/Pages', static: 'Static (S3 + CloudFront)', docker: 'Docker (local)' };
    $('#review-deploy').textContent = deployNames[state.deployTarget] || state.deployTarget || 'Docker (local)';

    if (state.prdMode === 'paste' && state.prdContent) {
      $('#review-prd').textContent = 'Custom PRD (pasted)';
    } else if (state.prdMode === 'generate' && state.generatedPrd) {
      $('#review-prd').textContent = 'Generated by Claude';
    } else {
      $('#review-prd').textContent = 'Default template (edit later)';
    }

    // Show env credentials count if any were stored
    const envCount = Object.keys(state.envCredentials).length;
    const envRow = $('#review-env-credentials');
    if (envRow) {
      envRow.textContent = envCount > 0 ? `${envCount} keys stored in vault` : 'None (add to .env later)';
    }
  }

  // =============================================
  // Step 7: Create
  // =============================================

  async function createProject() {
    const creatingState = $('#creating-state');
    const statusText = $('#create-status-text');

    creatingState.classList.remove('hidden');

    try {
      statusText.textContent = 'Creating project files...';
      let prd = state.prdContent || undefined;

      const res = await fetch('/api/project/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VoidForge-Request': '1' },
        body: JSON.stringify({
          name: state.projectName,
          directory: state.projectDir,
          description: state.projectDesc || undefined,
          domain: state.projectDomain || undefined,
          hostname: state.projectHostname || undefined,
          deploy: state.deployTarget || undefined,
          prd,
        }),
      });

      const data = await res.json();

      if (res.ok && data.created) {
        state.createdDir = data.directory;
        // Show done state
        creatingState.classList.add('hidden');
        $('#done-state').classList.remove('hidden');
        // Switch section label to done heading
        const step7Section = $('#step-7');
        if (step7Section) step7Section.setAttribute('aria-labelledby', 'step-7-heading');
        $('#done-details').innerHTML = `
          <p><strong>${escapeHtml(state.projectName)}</strong></p>
          <p style="color: var(--text-dim); font-family: var(--mono); font-size: 13px;">${escapeHtml(data.directory)}</p>
          <p style="color: var(--text-dim); margin-top: 8px;">${data.files.length} files created</p>
        `;
        setTimeout(() => { const h = $('#step-7-heading'); if (h) h.focus(); }, 100);
      } else {
        showCreateError('Error: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      showCreateError('Error: ' + err.message);
    }
  }

  function showCreateError(message) {
    const creatingState = $('#creating-state');
    const statusText = $('#create-status-text');
    creatingState.querySelector('.spinner')?.classList.add('hidden');
    statusText.textContent = message;
    statusText.style.color = 'var(--error)';
    // Show back + retry buttons so the user isn't trapped
    btnBack.style.display = '';
    btnBack.disabled = false;
    btnNext.style.display = '';
    btnNext.textContent = 'Retry';
  }

  $('#open-tower')?.addEventListener('click', () => {
    if (state.createdDir) {
      const name = encodeURIComponent(state.projectName);
      const dir = encodeURIComponent(state.createdDir);
      window.location.href = `/tower.html?name=${name}&dir=${dir}`;
    }
  });

  $('#open-terminal')?.addEventListener('click', () => {
    if (state.createdDir) {
      const cmd = `cd "${state.createdDir}" && claude`;
      copyToClipboard(cmd).then(() => {
        alert(`Copied to clipboard:\n\n${cmd}\n\nPaste this in your terminal.`);
      }).catch(() => {
        alert(`Run this in your terminal:\n\n${cmd}`);
      });
    }
  });

  $('#open-finder')?.addEventListener('click', () => {
    if (state.createdDir) {
      copyToClipboard(state.createdDir).then(() => {
        alert(`Path copied. Open Finder and press Cmd+Shift+G, then paste:\n\n${state.createdDir}`);
      });
    }
  });

  // Provisioning moved to Haku (deploy wizard) — launch with `npm run deploy`

  // =============================================
  // Step 5: Operations Menu — Card Expand/Collapse
  // =============================================

  $$('.ops-card-header').forEach((header) => {
    function toggle() {
      const card = header.closest('.ops-card');
      const body = card.querySelector('.ops-card-body');
      const isOpen = !body.classList.contains('hidden');
      body.classList.toggle('hidden');
      card.classList.toggle('expanded', !isOpen);
      header.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      if (!isOpen) {
        const firstInput = body.querySelector('input, select');
        if (firstInput) setTimeout(() => firstInput.focus(), 100);
      }
    }
    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });

  // Skip All button
  $('#ops-skip-all')?.addEventListener('click', () => {
    populateReview();
    showStep(6);
  });

  // Update header when project name is typed (Éowyn's enchantment)
  projectNameInput.addEventListener('input', () => {
    const name = projectNameInput.value.trim();
    const logo = $('.logo');
    if (name) {
      logo.textContent = 'Gandalf — ' + name;
    } else {
      logo.textContent = 'Gandalf — VoidForge Setup';
    }
  });

  // =============================================
  // Utilities
  // =============================================

  function showValidationErrors() {
    if (currentStep === 3) {
      const nameInput = $('#project-name');
      const dirInput = $('#project-dir');
      const nameError = $('#project-name-error');
      const dirError = $('#project-dir-error');
      if (!state.projectName) {
        nameInput.style.borderColor = 'var(--error)';
        nameInput.setAttribute('aria-invalid', 'true');
        if (nameError) { nameError.textContent = 'Project name is required'; nameError.classList.remove('hidden'); }
      }
      if (!state.projectDir) {
        dirInput.style.borderColor = 'var(--error)';
        dirInput.setAttribute('aria-invalid', 'true');
        if (dirError) { dirError.textContent = 'Project directory is required'; dirError.classList.remove('hidden'); }
      }
    }
  }

  function clearValidationErrors() {
    const nameInput = $('#project-name');
    const dirInput = $('#project-dir');
    const nameError = $('#project-name-error');
    const dirError = $('#project-dir-error');
    if (nameInput) { nameInput.style.borderColor = ''; nameInput.removeAttribute('aria-invalid'); }
    if (dirInput) { dirInput.style.borderColor = ''; dirInput.removeAttribute('aria-invalid'); }
    if (nameError) { nameError.textContent = ''; nameError.classList.add('hidden'); }
    if (dirError) { dirError.textContent = ''; dirError.classList.add('hidden'); }
  }

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
      try {
        document.execCommand('copy');
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  // Blueprint detection handlers
  const btnUseBlueprint = $('#btn-use-blueprint');
  const btnStartFresh = $('#btn-start-fresh');

  if (btnUseBlueprint) {
    btnUseBlueprint.addEventListener('click', async () => {
      // User chose blueprint path — validate and show results
      const blueprintBanner = $('#blueprint-detection');

      try {
        const res = await fetch('/api/blueprint/validate');
        const data = await res.json();

        if (data.valid) {
          // Show validation success in the banner itself
          if (blueprintBanner) {
            blueprintBanner.innerHTML = `
              <h2 style="margin: 0 0 0.5rem 0; color: var(--success, #4ade80);">Blueprint Validated</h2>
              <p style="margin: 0 0 0.5rem 0;">${data.summary || 'PRD is valid and ready to build.'}</p>
              <p style="margin: 0 0 1rem 0; opacity: 0.8;">Run <code>/blueprint</code> in Claude Code to provision and start building.</p>
              <button type="button" onclick="this.closest('#blueprint-detection').classList.add('hidden'); document.querySelector('#step-4').classList.remove('hidden');"
                style="padding: 0.5rem 1rem; background: transparent; color: var(--text, #ccc); border: 1px solid var(--border, #333); border-radius: 6px; cursor: pointer;">
                Continue to wizard instead
              </button>
            `;
          }
        } else {
          // Show errors but don't dead-end — let user fix or continue
          if (blueprintBanner) {
            const errors = data.frontmatterErrors?.join('<br>') || 'Unknown validation error';
            blueprintBanner.innerHTML = `
              <h2 style="margin: 0 0 0.5rem 0; color: var(--warning, #fbbf24);">Blueprint Has Issues</h2>
              <p style="margin: 0 0 0.5rem 0; font-size: 0.9rem;">${errors}</p>
              <p style="margin: 0 0 1rem 0; opacity: 0.8;">Fix these in docs/PRD.md, or continue with the wizard interview.</p>
              <button type="button" onclick="this.closest('#blueprint-detection').classList.add('hidden'); document.querySelector('#step-4').classList.remove('hidden');"
                style="padding: 0.5rem 1rem; background: transparent; color: var(--text, #ccc); border: 1px solid var(--border, #333); border-radius: 6px; cursor: pointer;">
                Continue to wizard
              </button>
            `;
          }
        }
      } catch {
        // API unavailable — still show useful guidance, never dead-end
        if (blueprintBanner) {
          blueprintBanner.innerHTML = `
            <h2 style="margin: 0 0 0.5rem 0; color: var(--accent, #5b5bf7);">Blueprint Path Available</h2>
            <p style="margin: 0 0 1rem 0;">Run <code>/blueprint</code> in Claude Code to validate your PRD and provision infrastructure.</p>
            <button type="button" onclick="this.closest('#blueprint-detection').classList.add('hidden'); document.querySelector('#step-4').classList.remove('hidden');"
              style="padding: 0.5rem 1rem; background: transparent; color: var(--text, #ccc); border: 1px solid var(--border, #333); border-radius: 6px; cursor: pointer;">
              Continue to wizard
            </button>
          `;
        }
      }
    });
  }

  if (btnStartFresh) {
    btnStartFresh.addEventListener('click', () => {
      const blueprintBanner = $('#blueprint-detection');
      if (blueprintBanner) blueprintBanner.classList.add('hidden');
      // Continue to Step 4 (PRD interview) normally
      showStep(4);
    });
  }

  // Dismiss button — same behavior as "Start fresh"
  const btnDismissBlueprint = $('#btn-dismiss-blueprint');
  if (btnDismissBlueprint) {
    btnDismissBlueprint.addEventListener('click', () => {
      const blueprintBanner = $('#blueprint-detection');
      if (blueprintBanner) blueprintBanner.classList.add('hidden');
      showStep(4);
    });
  }

  // Init
  showStep(1);
})();
