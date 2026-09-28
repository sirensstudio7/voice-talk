-- Analytics aggregation and retention support (TKT-008).
--
-- Dashboards now aggregate in SQL over bounded windows; these composite
-- indexes let the planner satisfy business + event + date without scanning the
-- whole table.

CREATE INDEX IF NOT EXISTS idx_analytics_events_business_name_created
  ON analytics_events (business_id, event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vision_events_business_type_created
  ON vision_events (business_id, event_type, created_at DESC);
