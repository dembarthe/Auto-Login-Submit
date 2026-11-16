(async () => {
  const domains = await ALS.getDomains();
  if (!ALS.matches(location.hostname, domains)) return;

  const { delayMs } = await chrome.storage.sync.get({ delayMs: ALS.DEFAULT_DELAY_MS });

  // Loop guard: after a submit, don't resubmit on this origin for 30s
  // (prevents hammering the server / locking the account on failed logins).
  const KEY = "als_last_submit";
  let last = 0;
  try { last = Number(sessionStorage.getItem(KEY) || 0); } catch {}
  if (Date.now() - last < 30000) return;

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const isFilled = (el) => {
    if (el.value) return true;
    try { return el.matches(":-webkit-autofill"); } catch { return false; }
  };

  function findLoginForm() {
    const pwds = [...document.querySelectorAll('input[type="password"]')].filter(visible);
    for (const pwd of pwds) {
      if (!isFilled(pwd)) continue;
      const form = pwd.form;
      if (!form) continue;
      // Skip sign-up / change-password forms.
      const visiblePwds = [...form.querySelectorAll('input[type="password"]')].filter(visible);
      if (visiblePwds.length !== 1) continue;
      if (/new-password/i.test(pwd.autocomplete)) continue;
      return { form, pwd };
    }
    return null;
  }

  function submit(form) {
    const btn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
    try { sessionStorage.setItem(KEY, String(Date.now())); } catch { return; } // no loop guard => don't submit
    if (typeof form.requestSubmit === "function") {
      try { form.requestSubmit(btn && visible(btn) && !btn.disabled ? btn : undefined); return; } catch {}
    }
    if (btn) btn.click(); else form.submit();
  }

  let done = false;
  let timer = null;
  const stop = () => {
    done = true;
    observer.disconnect();
    clearInterval(poll);
    clearTimeout(timer);
  };
  // If the user types into a field themselves, this is not a password-manager fill:
  // never auto-submit a half-typed password.
  const onUserInput = (e) => {
    if (e.isTrusted && e.target instanceof HTMLInputElement) {
      stop();
      removeEventListener("keydown", onUserInput, true);
    }
  };
  addEventListener("keydown", onUserInput, true);

  const attempt = () => {
    if (done) return;
    const found = findLoginForm();
    if (!found) return;
    done = true;
    observer.disconnect();
    clearInterval(poll);
    const snapshot = found.pwd.value;
    // Short delay so the password manager can finish filling all fields.
    timer = setTimeout(() => {
      removeEventListener("keydown", onUserInput, true);
      const again = findLoginForm();
      // Only submit if the same field is still filled with the same value.
      if (again && again.pwd === found.pwd && again.pwd.value === snapshot) submit(again.form);
    }, Math.max(0, Number(delayMs) || 0));
  };

  const observer = new MutationObserver(attempt);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["value"] });
  const poll = setInterval(attempt, 500); // autofill often sets .value without DOM mutation
  setTimeout(() => {
    clearInterval(poll);
    observer.disconnect();
    if (!done) removeEventListener("keydown", onUserInput, true);
  }, 20000);
  attempt();
})();
