module.exports = function afterRankHook(payload) {
  const ranked = Array.isArray(payload.ranked) ? payload.ranked : [];

  const filtered = ranked.filter((item) => {
    const domain = String(item.domain || "");
    return !domain.endsWith("reddit.com");
  });

  return {
    ...payload,
    ranked: filtered,
  };
};
