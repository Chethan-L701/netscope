package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	
	"netscope/internal/api"
	"netscope/internal/monitor"
	"netscope/internal/store"
)

func main() {
	verbose := flag.Bool("verbose", false, "Enable verbose logging of per-second usage to terminal")
	logFile := flag.String("log-file", "", "Path to log file (optional, defaults to stdout)")
	flag.Parse()

	if *logFile != "" {
		f, err := os.OpenFile(*logFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
		if err != nil {
			log.Fatalf("Failed to open log file: %v", err)
		}
		defer f.Close()
		log.SetOutput(f)
	}

	fmt.Println("NetScope Unified Backend Starting...")

	// Determine data directory (migrate from datatui if needed)
	configDir, err := os.UserConfigDir()
	if err != nil {
		log.Fatalf("Cannot get user config dir: %v", err)
	}
	appDir := filepath.Join(configDir, "netscope")
	
	// Migration logic: if netscope dir doesn't exist but datatui does, rename it
	oldAppDir := filepath.Join(configDir, "datatui")
	if _, err := os.Stat(appDir); os.IsNotExist(err) {
		if _, err := os.Stat(oldAppDir); err == nil {
			log.Printf("Migrating config directory from %s to %s", oldAppDir, appDir)
			err := os.Rename(oldAppDir, appDir)
			if err != nil {
				log.Printf("Failed to migrate directory: %v", err)
			}
		}
	}

	if err := os.MkdirAll(appDir, 0755); err != nil {
		log.Fatalf("Cannot create app directory: %v", err)
	}

	dbPath := filepath.Join(appDir, "netscope.db")
	// If the old database exists under datatui.db inside the new netscope folder, rename it
	oldDbPath := filepath.Join(appDir, "datatui.db")
	if _, err := os.Stat(oldDbPath); err == nil {
		if _, err := os.Stat(dbPath); os.IsNotExist(err) {
			os.Rename(oldDbPath, dbPath)
		}
	}
	settingsPath := filepath.Join(appDir, "settings.json")

	port := "8080"
	if data, err := os.ReadFile(settingsPath); err == nil {
		var settings map[string]interface{}
		if err := json.Unmarshal(data, &settings); err == nil {
			if p, ok := settings["port"]; ok {
				if floatPort, isFloat := p.(float64); isFloat {
					port = fmt.Sprintf("%.0f", floatPort)
				} else if strPort, isStr := p.(string); isStr {
					port = strPort
				}
			}
		}
	} else if os.IsNotExist(err) {
		defaultSettings := map[string]interface{}{
			"port": "8080",
			"topChartType": "combined",
			"bottomChartType": "straight_pie",
			"theme": "dark",
		}
		if data, err := json.MarshalIndent(defaultSettings, "", "  "); err == nil {
			os.WriteFile(settingsPath, data, 0644)
		}
	}

	dbStore, err := store.NewStore(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer dbStore.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
	
	go func() {
		<-sigs
		log.Println("Received termination signal, shutting down gracefully...")
		cancel()
	}()

	// Initialize Monitor
	mon := monitor.NewMonitor(dbStore, *verbose, settingsPath)
	
	// Start Monitor in a background Goroutine
	go mon.Start(ctx)

	// Initialize and Start HTTP API Server
	apiServer := api.NewServer(mon, dbStore, settingsPath)
	
	go func() {
		if err := apiServer.Start(":" + port); err != nil {
			log.Fatalf("API Server failed: %v", err)
		}
	}()
	
	// Block until cancelled by signals
	<-ctx.Done()
	log.Println("Backend stopped.")
}
