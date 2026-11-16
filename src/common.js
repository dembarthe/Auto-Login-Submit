// Shared helpers (content script, popup and options page).
const ALS = {
  normalize(entry) {
    let s = String(entry || "").trim().toLowerCase();
    s = s.replace(/^[a-z]+:\/\//, "").replace(/^\*\./, "").split(/[\/?#]/)[0].replace(/:\d+$/, "");
    s = s.replace(/^\.+|\.+$/g, "");
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(s)) return null;
    // A bare label such as "com" would whitelist an entire TLD; only localhost is allowed without a dot.
    if (!s.includes(".") && s !== "localhost") return null;
    return s;
  },
  // "example.com" matches example.com and any subdomain (a.example.com).
  matches(hostname, domains) {
    const h = String(hostname || "").toLowerCase();
    return domains.some((d) => h === d || h.endsWith("." + d));
  },
  async getDomains() {
    const { domains } = await chrome.storage.sync.get({ domains: [] });
    return Array.isArray(domains) ? domains.filter((d) => typeof d === "string") : [];
  },
  async setDomains(list) {
    const clean = [...new Set(list.map(ALS.normalize).filter(Boolean))].sort();
    await chrome.storage.sync.set({ domains: clean });
    return clean;
  },
  DEFAULT_DELAY_MS: 1500,
};
