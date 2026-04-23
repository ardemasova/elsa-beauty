const { loadTenantFeatures } = require('../services/featureCache');

function requireFeature(featureCode) {
  return async (req, res, next) => {
    try {
      const tenantId = req.user?.tenantId;
      
      if (!tenantId) {
        return res.status(401).json({ error: 'Tenant ID not found in token' });
      }

      const features = await loadTenantFeatures(tenantId, req.db);

      if (!features.includes(featureCode)) {
        return res.status(403).json({
          error: 'Feature not available for your plan',
          feature: featureCode,
          required_plan: featureCode
        });
      }

      next();
    } catch (err) {
      console.error('Feature guard error:', err);
      res.status(500).json({ error: 'Feature check failed' });
    }
  };
}

module.exports = { requireFeature };