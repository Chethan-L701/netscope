package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	
	"io"
	"os"
	"sync"
	"time"
	
	"netscope/internal/monitor"
	"netscope/internal/store"
)

type Server struct {
	mon          *monitor.Monitor
	store        *store.Store
	settingsPath string
	settingsMu   sync.Mutex
}

func NewServer(mon *monitor.Monitor, db *store.Store, settingsPath string) *Server {
	return &Server{
		mon:          mon,
		store:        db,
		settingsPath: settingsPath,
	}
}

func (s *Server) Start(addr string) error {
	mux := http.NewServeMux()

	// Simple CORS wrapper for frontend development
	corsHandler := func(h http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			h(w, r)
		}
	}

	mux.HandleFunc("/api/networks", corsHandler(s.handleAllNetworks))
	mux.HandleFunc("/api/networks/active", corsHandler(s.handleActiveNetworks))
	mux.HandleFunc("/api/usage", corsHandler(s.handleUsage))
	mux.HandleFunc("/api/realtime", corsHandler(s.handleRealtime))
	
	// Add export/import stubs and settings endpoints
	mux.HandleFunc("/api/settings", corsHandler(s.handleSettings))
	mux.HandleFunc("/api/export", corsHandler(s.handleExport))
	mux.HandleFunc("/api/import", corsHandler(s.handleImport))

	fmt.Printf("HTTP API Server listening on %s\n", addr)
	return http.ListenAndServe(addr, mux)
}

// handleAllNetworks returns all known networks from the database
func (s *Server) handleAllNetworks(w http.ResponseWriter, r *http.Request) {
	networks, err := s.store.GetAllNetworks()
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	if networks == nil {
		networks = []string{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(networks)
}

// handleActiveNetworks returns the currently connected network(s)
func (s *Server) handleActiveNetworks(w http.ResponseWriter, r *http.Request) {
	networks := s.mon.GetActiveNetworks()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(networks)
}

// handleRealtime streams the 1-second usage data using Server-Sent Events (SSE)
func (s *Server) handleRealtime(w http.ResponseWriter, r *http.Request) {
	// Set headers for Server-Sent Events
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	targetNetwork := r.URL.Query().Get("network")

	sub := s.mon.Subscribe()
	defer s.mon.Unsubscribe(sub)

	// Keep connection open until client disconnects
	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return // Client disconnected
		case data := <-sub:
			// Filter by network if requested
			if targetNetwork != "" && data.NetworkName != targetNetwork {
				continue
			}

			// Encode data to JSON
			bytes, err := json.Marshal(data)
			if err != nil {
				continue
			}

			// SSE format requires "data: {json}\n\n"
			fmt.Fprintf(w, "data: %s\n\n", bytes)
			flusher.Flush()
		}
	}
}

// handleUsage returns the historical SQLite data for a specific network
func (s *Server) handleUsage(w http.ResponseWriter, r *http.Request) {
	network := r.URL.Query().Get("network")
	period := r.URL.Query().Get("period")
	
	if network == "" {
		http.Error(w, "missing network parameter", http.StatusBadRequest)
		return
	}

	table := "daily_usage" // default
	switch period {
	case "minute":
		table = "minute_usage"
	case "hour":
		table = "hourly_usage"
	}

	data, err := s.store.GetUsage(network, table)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	
	if data == nil {
		data = []map[string]interface{}{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

// handleSettings reads or writes the settings.json file
func (s *Server) handleSettings(w http.ResponseWriter, r *http.Request) {
	s.settingsMu.Lock()
	defer s.settingsMu.Unlock()

	if r.Method == "GET" {
		data, err := os.ReadFile(s.settingsPath)
		if err != nil {
			http.Error(w, "failed to read settings", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(data)
		return
	}

	if r.Method == "POST" || r.Method == "PUT" {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}
		
		// Validate JSON
		var temp map[string]interface{}
		if err := json.Unmarshal(body, &temp); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}

		if err := os.WriteFile(s.settingsPath, body, 0644); err != nil {
			http.Error(w, "failed to save settings", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
		return
	}

	http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
}

func (s *Server) handleExport(w http.ResponseWriter, r *http.Request) {
	format := r.URL.Query().Get("format")
	networks, err := s.store.GetAllNetworks()
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	if format == "csv" {
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="netscope_export.csv"`)
		w.Write([]byte("network,timestamp,rx_bytes,tx_bytes\n"))
		for _, net := range networks {
			data, _ := s.store.GetUsage(net, "daily_usage")
			for _, row := range data {
				w.Write([]byte(fmt.Sprintf("%s,%s,%v,%v\n", net, row["timestamp"], row["rx_bytes"], row["tx_bytes"])))
			}
		}
		return
	}

	// JSON format
	exportData := make(map[string]interface{})
	for _, net := range networks {
		daily, _ := s.store.GetUsage(net, "daily_usage")
		hourly, _ := s.store.GetUsage(net, "hourly_usage")
		exportData[net] = map[string]interface{}{
			"daily":  daily,
			"hourly": hourly,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", `attachment; filename="netscope_export.json"`)
	json.NewEncoder(w).Encode(exportData)
}

func (s *Server) handleImport(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "must be POST", http.StatusMethodNotAllowed)
		return
	}

	var importData map[string]map[string][]map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&importData); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	// Simplistic import: just iterate and upsert. This is very slow for large datasets
	// but works for basic backups. A transaction is used inside UpsertUsage but for 
	// bulk import it's better to do a single transaction. Since this is an MVP import,
	// we will just loop.
	for net, tables := range importData {
		for _, row := range tables["daily"] {
			tsStr, ok1 := row["timestamp"].(string)
			rx, ok2 := row["rx_bytes"].(float64)
			tx, ok3 := row["tx_bytes"].(float64)
			if ok1 && ok2 && ok3 {
				if t, err := time.Parse(time.RFC3339, tsStr); err == nil {
					s.store.UpsertUsage(net, t, uint64(rx), uint64(tx))
				}
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"imported"}`))
}
