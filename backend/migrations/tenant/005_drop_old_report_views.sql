-- The old report views are replaced by services/reports/metrics.js and are no
-- longer used anywhere. Dropping them keeps one definition of every number.
DROP VIEW IF EXISTS master_performance;
DROP VIEW IF EXISTS revenue_by_day;
DROP VIEW IF EXISTS revenue_by_master;
DROP VIEW IF EXISTS revenue_by_service;
DROP VIEW IF EXISTS cogs_report;
