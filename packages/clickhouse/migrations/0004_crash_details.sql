-- Developer-controlled data on crash reports (SDK tags, contexts, extra, level).
ALTER TABLE crash_events ADD COLUMN IF NOT EXISTS level LowCardinality(String) DEFAULT '';
ALTER TABLE crash_events ADD COLUMN IF NOT EXISTS tags Map(String, String);
ALTER TABLE crash_events ADD COLUMN IF NOT EXISTS contexts String DEFAULT '{}';
ALTER TABLE crash_events ADD COLUMN IF NOT EXISTS extra String DEFAULT '{}';
ALTER TABLE crash_events ADD COLUMN IF NOT EXISTS attachments UInt8 DEFAULT 0;
