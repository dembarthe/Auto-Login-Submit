(async () => {
  const $ = (id) => document.getElementById(id);
  const { delayMs } = await chrome.storage.sync.get({ delayMs: ALS.DEFAULT_DELAY_MS });
  $("domains").value = (await ALS.getDomains()).join("\n");
  $("delay").value = delayMs;
  $("save").onclick = async () => {
    const clean = await ALS.setDomains($("domains").value.split(/\s*[\n,]\s*/));
    const n = parseInt($("delay").value, 10);
    const d = Math.min(10000, Math.max(0, Number.isNaN(n) ? ALS.DEFAULT_DELAY_MS : n));
    $("delay").value = d;
    await chrome.storage.sync.set({ delayMs: d });
    $("domains").value = clean.join("\n");
    $("msg").textContent = "Saved";
    setTimeout(() => ($("msg").textContent = ""), 1500);
  };
})();
