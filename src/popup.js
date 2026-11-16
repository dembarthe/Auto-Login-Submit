(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = null;
  try {
    const u = new URL(tab.url);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol === "https:" || (u.protocol === "http:" && local)) host = ALS.normalize(u.hostname);
  } catch {}
  const $ = (id) => document.getElementById(id);
  $("options").onclick = () => chrome.runtime.openOptionsPage();
  if (!host) { $("host").textContent = "Unsupported page (HTTPS or localhost only)"; return; }
  $("host").textContent = host;

  const render = async () => {
    const domains = await ALS.getDomains();
    const on = ALS.matches(host, domains);
    $("status").textContent = on ? "Auto-submit is ENABLED" : "Auto-submit is disabled";
    const hits = domains.filter((d) => host === d || host.endsWith("." + d));
    $("toggle").textContent = on ? "Remove " + hits.join(", ") + " from whitelist" : "Enable on " + host;
    $("toggle").disabled = false;
    $("toggle").onclick = async () => {
      if (on) {
        await ALS.setDomains(domains.filter((d) => !hits.includes(d)));
      } else {
        await ALS.setDomains([...domains, host]);
      }
      render();
    };
  };
  render();
})();
