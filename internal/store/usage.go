package store

import (
	"fmt"
	"time"
)

// GetOrCreateNetwork returns the ID of a network, creating it if necessary
func (s *Store) GetOrCreateNetwork(name string) (int64, error) {
	var id int64
	err := s.db.QueryRow("SELECT id FROM networks WHERE name = ?", name).Scan(&id)
	if err == nil {
		return id, nil // Found
	}

	// Insert if not found
	res, err := s.db.Exec("INSERT INTO networks (name) VALUES (?)", name)
	if err != nil {
		return 0, fmt.Errorf("failed to insert network: %w", err)
	}
	
	return res.LastInsertId()
}

// UpsertUsage adds the rx/tx delta to the minute, hourly, and daily buckets atomically
func (s *Store) UpsertUsage(networkName string, t time.Time, rxDelta, txDelta uint64) error {
	netID, err := s.GetOrCreateNetwork(networkName)
	if err != nil {
		return err
	}

	minuteBucket := t.Truncate(time.Minute)
	y, m, d := t.Date()
	hour, _, _ := t.Clock()
	hourBucket := time.Date(y, m, d, hour, 0, 0, 0, t.Location())
	// For daily we need to truncate correctly based on local timezone
	// time.Truncate(24*time.Hour) truncates to UTC midnight, which is fine, 
	// but to be safer with local time zones we can do:
	dayBucket := time.Date(y, m, d, 0, 0, 0, 0, t.Location())

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback() // Rollback if not committed

	queryTmpl := `
	INSERT INTO %s (network_id, timestamp, rx_bytes, tx_bytes) 
	VALUES (?, ?, ?, ?) 
	ON CONFLICT(network_id, timestamp) 
	DO UPDATE SET 
		rx_bytes = rx_bytes + excluded.rx_bytes, 
		tx_bytes = tx_bytes + excluded.tx_bytes;
	`

	tables := map[string]time.Time{
		"minute_usage": minuteBucket,
		"hourly_usage": hourBucket,
		"daily_usage":  dayBucket,
	}

	for tableName, bucket := range tables {
		query := fmt.Sprintf(queryTmpl, tableName)
		_, err = tx.Exec(query, netID, bucket, rxDelta, txDelta)
		if err != nil {
			return fmt.Errorf("failed to upsert %s: %w", tableName, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// GetUsage fetches historical data based on the period table
func (s *Store) GetUsage(networkName, table string) ([]map[string]interface{}, error) {
	// Basic SQL injection prevention
	if table != "minute_usage" && table != "hourly_usage" && table != "daily_usage" {
		return nil, fmt.Errorf("invalid table name")
	}

	query := fmt.Sprintf(`
		SELECT timestamp, rx_bytes, tx_bytes 
		FROM %s 
		WHERE network_id = (SELECT id FROM networks WHERE name = ?)
		ORDER BY timestamp ASC
	`, table)

	rows, err := s.db.Query(query, networkName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var ts string
		var rx, tx uint64
		if err := rows.Scan(&ts, &rx, &tx); err != nil {
			continue
		}
		results = append(results, map[string]interface{}{
			"timestamp": ts,
			"rx_bytes":  rx,
			"tx_bytes":  tx,
		})
	}
	return results, nil
}

// GetAllNetworks returns all known network names
func (s *Store) GetAllNetworks() ([]string, error) {
	rows, err := s.db.Query("SELECT name FROM networks")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			names = append(names, name)
		}
	}
	return names, nil
}

// GetTotalUsageSince calculates the total (rx + tx) bytes across all networks since the given time
func (s *Store) GetTotalUsageSince(since time.Time) (uint64, error) {
	// daily_usage is updated in real-time and provides a very fast way to aggregate
	// usage for quotas (daily, weekly, monthly).
	query := `
		SELECT COALESCE(SUM(rx_bytes + tx_bytes), 0)
		FROM daily_usage
		WHERE timestamp >= ?
	`
	var total uint64
	// Format time strictly as SQLite expects it if using the default schema, 
	// which is RFC3339 or similar. In Go-SQLite, passing time.Time usually works, 
	// but since our DB stores it directly, we should format it exactly as UpsertUsage does.
	// Wait, UpsertUsage passes time.Time natively to Exec, which SQLite3 driver handles.
	err := s.db.QueryRow(query, since).Scan(&total)
	return total, err
}
