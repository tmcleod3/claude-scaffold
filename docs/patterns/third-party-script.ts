/**
 * Pattern: Third-Party Script Loading
 *
 * When loading external scripts (Google Identity, Stripe.js, analytics SDKs),
 * always define three states: loading, ready, error.
 * The timeout MUST transition to 'error', not back to 'loading'.
 *
 * Field report #17: GIS script timeout set gsiReady=false (already false) —
 * no state change, no UI update, infinite spinner.
 */

// State machine: 'loading' → 'ready' | 'error'
type ScriptState = 'loading' | 'ready' | 'error';

interface ThirdPartyScript {
  state: ScriptState;
  error: string | null;
}

function loadExternalScript(src: string, timeoutMs = 10_000): ThirdPartyScript {
  const script: ThirdPartyScript = { state: 'loading', error: null };

  // Load the script
  const el = document.createElement('script');
  el.src = src;
  el.async = true;

  el.onload = () => {
    script.state = 'ready';
    script.error = null;
    // Update UI: show ready state
  };

  el.onerror = () => {
    script.state = 'error';
    script.error = `Failed to load ${src}`;
    // Update UI: show error state with retry action
  };

  document.head.appendChild(el);

  // Timeout — MUST transition to 'error', not stay in 'loading'
  setTimeout(() => {
    if (script.state === 'loading') {
      script.state = 'error';
      script.error = `Script load timed out after ${timeoutMs}ms`;
      // Update UI: show timeout error with retry action
    }
  }, timeoutMs);

  return script;
}

/**
 * UI Requirements:
 * - loading: Show spinner or skeleton
 * - ready: Show the feature
 * - error: Show message + "Retry" button (or "Continue without [feature]")
 *
 * Anti-pattern:
 *   if (state === 'loading') showSpinner();
 *   // NO error state handler → infinite spinner on timeout
 *
 * Correct:
 *   if (state === 'loading') showSpinner();
 *   if (state === 'ready') showFeature();
 *   if (state === 'error') showError(script.error, retryFn);
 */
