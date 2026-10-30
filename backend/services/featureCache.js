/**
 * Which features (modules) the account's plan includes.
 * Small in-process cache: one app instance, a handful of accounts, and plans
 * change rarely. No Redis needed (it was not running in docker-compose, which
 * made every request fail with 403).
 */
const db = require("../db");

const TTL_MS = 60 * 1000;
const cache = new Map(); // accountId -> { features, expires }

async function loadAccountFeatures(accountId) {
  const hit = cache.get(accountId);
  if (hit && hit.expires > Date.now()) return hit.features;

  const { rows } = await db.query(
    `SELECT f.code
       FROM public.accounts a
       JOIN public.plan_features pf ON pf.plan_id = a.plan_id
       JOIN public.features f ON f.id = pf.feature_id
      WHERE a.id = $1`,
    [accountId]
  );
  const features = rows.map((r) => r.code);
  cache.set(accountId, { features, expires: Date.now() + TTL_MS });
  return features;
}

function invalidateAccountFeatures(accountId) {
  cache.delete(accountId);
}

module.exports = { loadAccountFeatures, invalidateAccountFeatures };
