const redis = require('redis');

const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379'
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.connect();

const CACHE_TTL = 3600; // 1 час

async function loadTenantFeatures(tenantId, db) {
  try {
    // 1. Проверить кэш в Redis
    const cacheKey = `tenant:${tenantId}:features`;
    const cached = await redisClient.get(cacheKey);
    
    if (cached) {
      console.log(`✅ Cache HIT for tenant ${tenantId}`);
      return JSON.parse(cached);
    }

    console.log(`❌ Cache MISS for tenant ${tenantId} - loading from DB`);

    // 2. Загрузить из БД
    const result = await db.query(`
      SELECT DISTINCT f.code
      FROM plan_features pf
      JOIN plans p ON p.id = pf.plan_id
      JOIN features f ON f.id = pf.feature_id
      JOIN public.tenants t ON t.plan_id = p.id
      WHERE t.id = $1
    `, [tenantId]);

    const features = result.rows.map(row => row.code);

    // 3. Сохранить в Redis с TTL
    await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(features));

    return features;
  } catch (err) {
    console.error('Feature cache error:', err);
    // Fallback: вернуть пустой массив (блокирует всё)
    return [];
  }
}

async function invalidateTenantCache(tenantId) {
  const cacheKey = `tenant:${tenantId}:features`;
  await redisClient.del(cacheKey);
  console.log(`🔄 Cache invalidated for tenant ${tenantId}`);
}

module.exports = { loadTenantFeatures, invalidateTenantCache, redisClient };