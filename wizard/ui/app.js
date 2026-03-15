/**
 * VoidForge Wizard — Vanilla JS Step Machine
 * Merlin — Setup Wizard
 * Steps: 1=Vault, 2=Cloud, 3=Project, 4=PRD, 5=Deploy, 6=Review, 7=Create/Done
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
    $$('.step').forEach((el) => el.classList.add('hidden'));
    const target = $(`#step-${step}`);
    if (target) target.classList.remove('hidden');

    currentStep = step;

    // Dynamic step count — simple mode skips steps 2(cloud) and 5(deploy)
    // Step '4b' is the PRD-driven credentials step (shown only if PRD has env vars)
    const hasEnvStep = state.envGroups.length > 0;
    let visibleSteps;
    if (advancedMode) {
      visibleSteps = hasEnvStep ? [1, 2, 3, 4, '4b', 5, 6, 7] : [1, 2, 3, 4, 5, 6, 7];
    } else {
      visibleSteps = hasEnvStep ? [1, 2, 3, 4, '4b', 6, 7] : [1, 2, 3, 4, 6, 7];
    }
    const currentIdx = visibleSteps.indexOf(step);
    const totalVisible = visibleSteps.length;
    const displayNum = currentIdx >= 0 ? currentIdx + 1 : (typeof step === 'number' ? step : 5);

    const pct = Math.round((displayNum / totalVisible) * 100);
    progressBar.style.width = `${pct}%`;
    progressBar.setAttribute('aria-valuenow', String(pct));
    stepLabel.textContent = `Step ${displayNum} of ${totalVisible}`;

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
      state.projectDomain = $('#project-domain').value.trim();
      state.projectHostname = $('#project-hostname').value.trim();
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
      case 1: return state.anthropicKeyStored;
      case 2: return true;  // Cloud credentials are optional
      case 3: return state.projectName.trim() !== '' && state.projectDir.trim() !== '';
      case 4: return true;  // PRD optional
      case 5: return true;  // Deploy target optional
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

    // After PRD step (4), check for env requirements before proceeding
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
      // No env requirements — skip 4b
      if (!advancedMode) {
        populateReview();
        showStep(6);
        return;
      }
      await loadDeployTargets();
      showStep(5);
      return;
    }

    // After 4b, proceed to deploy (advanced) or review (simple)
    if (currentStep === '4b') {
      if (!advancedMode) {
        populateReview();
        showStep(6);
        return;
      }
      await loadDeployTargets();
      showStep(5);
      return;
    }

    if (currentStep === 6) {
      createProject();
      showStep(7);
      return;
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
    // Step 4b goes back to 4
    if (currentStep === '4b') {
      showStep(4);
      return;
    }
    // Step 5 goes back to 4b if env groups exist, else 4
    if (currentStep === 5 && state.envGroups.length > 0) {
      showStep('4b');
      return;
    }
    // In simple mode, review goes back to 4b (if exists) or 4
    if (currentStep === 6 && !advancedMode) {
      if (state.envGroups.length > 0) {
        showStep('4b');
      } else {
        showStep(4);
      }
      return;
    }
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
      if (!apikeyCard.classList.contains('hidden') && keyInput.value.trim()) {
        validateKeyBtn.click();
      } else if (vaultPasswordInput.value) {
        unlockVaultBtn.click();
      }
      return;
    }

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
    if (password.length < 4) { showStatus(vaultStatus, 'error', 'Password must be at least 4 characters'); return; }

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
        if (data.anthropic) {
          state.anthropicKeyStored = true;
          showStatus(vaultStatus, 'success', 'Vault unlocked — API key found');
          setTimeout(() => nextStep(), 600);
        } else {
          showStatus(vaultStatus, 'success', 'Vault unlocked');
          apikeyCard.classList.remove('hidden');
          keyInput.focus();
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
  // Step 2: Simple/Advanced Choice + Cloud Credentials
  // =============================================

  let advancedMode = false;
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

  // Simple setup — skip cloud, go straight to project
  activateOnKeyboard($('#choose-simple'), () => {
    advancedMode = false;
    nextStep();
  });

  // Advanced setup — show cloud provider cards
  activateOnKeyboard($('#choose-advanced'), () => {
    advancedMode = true;
    $('#setup-choice').classList.add('hidden');
    $('#cloud-setup').classList.remove('hidden');
    loadCloudProviders();
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

  // Reset choice view when navigating back to step 2
  const origShowStep = showStep;
  showStep = function (step) {
    if (step === 2 && !advancedMode) {
      $('#setup-choice').classList.remove('hidden');
      $('#cloud-setup').classList.add('hidden');
    }
    // Step 4b needs to re-show nav buttons properly
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

  // =============================================
  // Step 4: PRD
  // =============================================

  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      $$('.tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const panel = $(`#tab-${tab.dataset.tab}`);
      if (panel) panel.classList.add('active');
      state.prdMode = tab.dataset.tab;
    });
  });

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
    if (advancedMode) {
      loadDeployTargets().then(() => showStep(5));
    } else {
      populateReview();
      showStep(6);
    }
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

  $('#open-camelot')?.addEventListener('click', () => {
    if (state.createdDir) {
      const name = encodeURIComponent(state.projectName);
      const dir = encodeURIComponent(state.createdDir);
      window.location.href = `/camelot.html?name=${name}&dir=${dir}`;
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
  // Utilities
  // =============================================

  function showValidationErrors() {
    if (currentStep === 1 && !state.anthropicKeyStored) {
      if (apikeyCard.classList.contains('hidden')) {
        showStatus(vaultStatus, 'error', 'Unlock your vault to continue');
      } else {
        showStatus(keyStatus, 'error', 'Validate your API key to continue');
      }
    }
    if (currentStep === 3) {
      const nameInput = $('#project-name');
      const dirInput = $('#project-dir');
      if (!state.projectName) nameInput.style.borderColor = 'var(--error)';
      if (!state.projectDir) dirInput.style.borderColor = 'var(--error)';
    }
  }

  function clearValidationErrors() {
    const nameInput = $('#project-name');
    const dirInput = $('#project-dir');
    if (nameInput) nameInput.style.borderColor = '';
    if (dirInput) dirInput.style.borderColor = '';
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

  // Init
  showStep(1);
})();
