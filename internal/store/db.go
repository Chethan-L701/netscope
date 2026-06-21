package store

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/mattn/go-sqlite3"
)

type Store struct {
	db *sql.DB
}

func NewStore(dbPath string) (*Store, error) {
	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL")
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	store := &Store{db: db}

	if err := store.migrate(); err != nil {
		return nil, err
	}

	return store, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate() error {
	networkQuery := `
	CREATE TABLE IF NOT EXISTS networks (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT UNIQUE NOT NULL
	);`

	minuteQuery := `
	CREATE TABLE IF NOT EXISTS minute_usage (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		network_id INTEGER NOT NULL,
		timestamp DATETIME NOT NULL,
		rx_bytes INTEGER DEFAULT 0,
		tx_bytes INTEGER DEFAULT 0,
		FOREIGN KEY (network_id) REFERENCES networks(id),
		UNIQUE(network_id, timestamp)
	);`

	hourlyQuery := `
	CREATE TABLE IF NOT EXISTS hourly_usage (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		network_id INTEGER NOT NULL,
		timestamp DATETIME NOT NULL,
		rx_bytes INTEGER DEFAULT 0,
		tx_bytes INTEGER DEFAULT 0,
		FOREIGN KEY (network_id) REFERENCES networks(id),
		UNIQUE(network_id, timestamp)
	);`

	dailyQuery := `
	CREATE TABLE IF NOT EXISTS daily_usage (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		network_id INTEGER NOT NULL,
		timestamp DATETIME NOT NULL,
		rx_bytes INTEGER DEFAULT 0,
		tx_bytes INTEGER DEFAULT 0,
		FOREIGN KEY (network_id) REFERENCES networks(id),
		UNIQUE(network_id, timestamp)
	);`

	queries := []string{networkQuery, minuteQuery, hourlyQuery, dailyQuery}

	for _, q := range queries {
		if _, err := s.db.Exec(q); err != nil {
			return fmt.Errorf("failed to execute migration: %w", err)
		}
	}

	log.Println("Database schemas initialized (Minute, Hour, Day).")
	return nil
}
