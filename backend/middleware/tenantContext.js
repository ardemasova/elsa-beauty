const db = require('../db');

async function tenantContext(req, res, next) {
  if (!req.user || !req.user.tenantId) {
    return res.status(401).json({ message: 'TenantId missing in JWT' });
  }

  try {
    const schema = `tenant_${req.user.tenantId.replace(/-/g,'_')}`;
    await db.query(`SET search_path TO ${schema}, public`);
    next();
  } catch (err) {
    console.error('TENANT CONTEXT ERROR:', err);
    res.status(500).json({ message: 'Server error setting tenant context' });
  }
}

module.exports = { tenantContext };
