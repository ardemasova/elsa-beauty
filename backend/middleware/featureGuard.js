const { loadAccountFeatures } = require("../services/featureCache");

/** Blocks the route unless the account's plan includes `featureCode`. Use after authenticateToken. */
function requireFeature(featureCode) {
  return async (req, res, next) => {
    try {
      const accountId = req.user?.accountId;
      if (!accountId) return res.status(401).json({ message: "Authentication required" });

      const features = await loadAccountFeatures(accountId);
      if (!features.includes(featureCode)) {
        return res.status(403).json({
          message: "This module is not included in your plan",
          feature: featureCode,
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireFeature };
