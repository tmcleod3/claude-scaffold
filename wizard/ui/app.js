/**
 * VoidForge Wizard — Vanilla JS Step Machine
 */

(function () {
  'use strict';

  const TOTAL_STEPS = 5;
  let currentStep = 1;

  // State
  const state = {
    anthropicKeyStored: false,
    projectName: '',
    projectDir: '',
    projectDesc: '',
    projectDomain: '',
    prdMode: 'generate', // 'generate' | 'paste' | 'skip'
    prdContent: '',
    generatedPrd: '',
    createdDir: '',
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
    progressBar.style.width = `${(step / TOTAL_STEPS) * 100}%`;
    stepLabel.textContent = `Step ${step} of ${TOTAL_STEPS}`;

    btnBack.disabled = step <= 1;

    // Update next button text
    if (step === 4) {
      btnNext.textContent = 'Create Project';
    } else if (step === 5) {
      btnNext.style.display = 'none';
      btnBack.style.display = 'none';
    } else {
      btnNext.textContent = 'Next';
      btnNext.style.display = '';
      btnBack.style.display = '';
    }

    // Focus first input on the step
    const firstInput = target?.querySelector('input, textarea, select');
    if (firstInput) setTimeout(() => firstInput.focus(), 100);
  }

  /** Read current step's inputs into state before checking validity */
  function syncState() {
    if (currentStep === 2) {
      state.projectName = $('#project-name').value.trim();
      state.projectDir = $('#project-dir').value.trim();
      state.projectDesc = $('#project-desc').value.trim();
      state.projectDomain = $('#project-domain').value.trim();
    }
    if (currentStep === 3) {
      if (state.prdMode === 'paste') {
        state.prdContent = $('#prd-paste').value.trim();
      } else if (state.prdMode === 'generate' && state.generatedPrd) {
        state.prdContent = state.generatedPrd;
      } else {
        state.prdContent = '';
      }
    }
  }

  function canAdvance() {
    switch (currentStep) {
      case 1:
        return state.anthropicKeyStored;
      case 2:
        return state.projectName.trim() !== '' && state.projectDir.trim() !== '';
      case 3:
        return true; // PRD is optional (template mode)
      case 4:
        return true;
      default:
        return false;
    }
  }

  function nextStep() {
    syncState();
    if (!canAdvance()) return;

    if (currentStep === 4) {
      createProject();
      showStep(5);
      return;
    }

    if (currentStep < TOTAL_STEPS) {
      const nextStepNum = currentStep + 1;
      if (nextStepNum === 4) populateReview();
      showStep(nextStepNum);
    }
  }

  function prevStep() {
    if (currentStep > 1) showStep(currentStep - 1);
  }

  btnNext.addEventListener('click', nextStep);
  btnBack.addEventListener('click', prevStep);

  // Keyboard navigation — Enter triggers the contextually correct action
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();

    if (currentStep === 1) {
      // If vault is locked and password field is focused/filled, unlock first
      if (!apikeyCard.classList.contains('hidden') && keyInput.value.trim()) {
        validateKeyBtn.click();
      } else if (vaultPasswordInput.value) {
        unlockVaultBtn.click();
      }
      return;
    }

    if (currentStep === 3) {
      // If on the generate tab with an idea typed, generate instead of advancing
      const generateTab = $('#tab-generate');
      const ideaField = $('#prd-idea');
      if (generateTab.classList.contains('active') && ideaField.value.trim() && !state.generatedPrd) {
        generatePrdBtn.click();
        return;
      }
    }

    // Default: advance to next step
    nextStep();
  });

  // --- Step 1: Vault + API Key ---

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

  // Toggle password visibility
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
      if (data.vaultPath) {
        $('#vault-path').textContent = data.vaultPath;
      }
      if (data.vaultExists) {
        // Existing vault — change label to "Enter" instead of "Choose"
        $('#vault-password-label').textContent = 'Vault Password';
        vaultPasswordInput.placeholder = 'Enter your vault password';
        $('#vault-hint').textContent = 'Enter the password you used to create this vault.';
      }
      if (data.unlocked && data.anthropic) {
        // Already unlocked from this session
        state.anthropicKeyStored = true;
        vaultCard.classList.add('hidden');
        apikeyCard.classList.remove('hidden');
        showStatus(keyStatus, 'success', 'API key already stored in vault');
        keyInput.placeholder = 'Key already stored — enter a new one to replace';
      }
    })
    .catch(() => {});

  // Unlock vault
  unlockVaultBtn.addEventListener('click', async () => {
    const password = vaultPasswordInput.value;
    if (!password) {
      showStatus(vaultStatus, 'error', 'Please enter a password');
      return;
    }
    if (password.length < 4) {
      showStatus(vaultStatus, 'error', 'Password must be at least 4 characters');
      return;
    }

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
        if (data.anthropic) {
          // Key already stored — skip straight to next step
          state.anthropicKeyStored = true;
          showStatus(vaultStatus, 'success', 'Vault unlocked — API key found');
          setTimeout(() => nextStep(), 600);
        } else {
          // Vault unlocked but no key yet — show the API key card
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

  // Validate and store API key
  validateKeyBtn.addEventListener('click', async () => {
    const apiKey = keyInput.value.trim();
    if (!apiKey) {
      showStatus(keyStatus, 'error', 'Please enter your API key');
      return;
    }

    showStatus(keyStatus, 'loading', 'Validating...');
    validateKeyBtn.disabled = true;

    try {
      const res = await fetch('/api/credentials/anthropic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  // --- Step 2: Project Setup ---

  const projectNameInput = $('#project-name');
  const projectDirInput = $('#project-dir');

  // Auto-suggest directory from project name
  projectNameInput.addEventListener('input', () => {
    const name = projectNameInput.value.trim();
    if (name && !projectDirInput.dataset.manual) {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9\-_\s]/g, '')
        .replace(/\s+/g, '-');
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

  // --- Step 3: PRD ---

  // Tab switching
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach((t) => t.classList.remove('active'));
      $$('.tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = $(`#tab-${tab.dataset.tab}`);
      if (panel) panel.classList.add('active');
      state.prdMode = tab.dataset.tab;
    });
  });

  // Validate PRD
  const validatePrdBtn = $('#validate-prd');
  const prdStatus = $('#prd-status');

  validatePrdBtn.addEventListener('click', async () => {
    const content = $('#prd-paste').value.trim();
    if (!content) {
      showStatus(prdStatus, 'error', 'Paste your PRD content first');
      return;
    }

    try {
      const res = await fetch('/api/prd/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  // Copy PRD generator prompt for use with other AIs
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

  // Generate PRD
  const generatePrdBtn = $('#generate-prd');
  const generationOutput = $('#generation-output');
  const generatedContent = $('#generated-prd-content');

  generatePrdBtn.addEventListener('click', async () => {
    const idea = $('#prd-idea').value.trim();
    if (!idea) {
      alert('Please describe your idea first');
      return;
    }

    generatePrdBtn.disabled = true;
    generatePrdBtn.textContent = 'Generating...';
    generationOutput.classList.remove('hidden');
    generatedContent.textContent = '';
    state.generatedPrd = '';

    try {
      const res = await fetch('/api/prd/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
              // Auto-scroll to bottom
              generatedContent.scrollTop = generatedContent.scrollHeight;
            }
            if (parsed.error) {
              generatedContent.textContent += '\n\nError: ' + parsed.error;
            }
          } catch {
            // Skip
          }
        }
      }
    } catch (err) {
      generatedContent.textContent += '\n\nConnection error: ' + err.message;
    } finally {
      generatePrdBtn.disabled = false;
      generatePrdBtn.textContent = 'Generate PRD with Claude';
    }
  });

  // Copy generated PRD
  $('#copy-generated').addEventListener('click', () => {
    if (!state.generatedPrd) return;
    copyToClipboard(state.generatedPrd).then(() => {
      $('#copy-generated').textContent = 'Copied!';
      setTimeout(() => { $('#copy-generated').textContent = 'Copy'; }, 2000);
    });
  });

  // --- Step 4: Review ---

  function populateReview() {
    $('#review-name').textContent = state.projectName;
    $('#review-dir').textContent = state.projectDir;
    $('#review-desc').textContent = state.projectDesc || '(not set)';
    $('#review-domain').textContent = state.projectDomain || '(not set)';

    if (state.prdMode === 'paste' && state.prdContent) {
      $('#review-prd').textContent = 'Custom PRD (pasted)';
    } else if (state.prdMode === 'generate' && state.generatedPrd) {
      $('#review-prd').textContent = 'Generated by Claude';
    } else {
      $('#review-prd').textContent = 'Default template (edit later)';
    }
  }

  // --- Step 5: Create ---

  async function createProject() {
    const creatingState = $('#creating-state');
    const doneState = $('#done-state');
    const statusText = $('#create-status-text');

    creatingState.classList.remove('hidden');
    doneState.classList.add('hidden');

    try {
      statusText.textContent = 'Creating project files...';

      // Determine PRD content
      let prd = state.prdContent || undefined;

      const res = await fetch('/api/project/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: state.projectName,
          directory: state.projectDir,
          description: state.projectDesc || undefined,
          domain: state.projectDomain || undefined,
          prd,
        }),
      });

      const data = await res.json();

      if (res.ok && data.created) {
        state.createdDir = data.directory;
        creatingState.classList.add('hidden');
        doneState.classList.remove('hidden');

        $('#done-details').innerHTML = `
          <p><strong>${state.projectName}</strong></p>
          <p style="color: var(--text-dim); font-family: var(--mono); font-size: 13px;">${data.directory}</p>
          <p style="color: var(--text-dim); margin-top: 8px;">${data.files.length} files created</p>
        `;
      } else {
        statusText.textContent = 'Error: ' + (data.error || 'Unknown error');
        statusText.style.color = 'var(--error)';
      }
    } catch (err) {
      statusText.textContent = 'Error: ' + err.message;
      statusText.style.color = 'var(--error)';
    }
  }

  // Open in Terminal
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

  // Open in Finder
  $('#open-finder')?.addEventListener('click', () => {
    if (state.createdDir) {
      copyToClipboard(state.createdDir).then(() => {
        alert(`Path copied. Open Finder and press Cmd+Shift+G, then paste:\n\n${state.createdDir}`);
      });
    }
  });

  // --- Utilities ---

  function showStatus(el, type, message) {
    el.className = 'status-row ' + type;
    el.textContent = message;
  }

  /** Clipboard with fallback for non-HTTPS contexts */
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback: hidden textarea + execCommand
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
