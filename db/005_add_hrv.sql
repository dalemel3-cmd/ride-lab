ALTER TABLE body_comp ADD COLUMN hrv_ms integer check (hrv_ms is null or (hrv_ms between 5 and 300));
