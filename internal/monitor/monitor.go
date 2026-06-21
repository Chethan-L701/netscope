package monitor

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sync"
	"time"
	
	"netscope/internal/notifier"
	"netscope/internal/store"
)

// RealtimeData holds a snapshot of a single second's usage
type RealtimeData struct {
	NetworkName string    `json:"network_name"`
	Interface   string    `json:"interface"`
	Timestamp   time.Time `json:"timestamp"`
	RxDelta     uint64    `json:"rx_bytes"`
	TxDelta     uint64    `json:"tx_bytes"`
}

type Subscriber chan RealtimeData

type Monitor struct {
	pollInterval  time.Duration
	previousStats map[string]NetStats 
	store         *store.Store
	Verbose       bool
	
	activeNetworks []ActiveNetwork
	netMu          sync.RWMutex

	subscribers map[Subscriber]struct{}
	subMu       sync.Mutex

	settingsPath string
	notifiedDaily80   bool
	notifiedDaily90   bool
	notifiedDaily100  bool
	notifiedMonthly90 bool
	notifiedMonthly100 bool
	currentDay    time.Time
	currentMonth  time.Time
}

func NewMonitor(db *store.Store, verbose bool, settingsPath string) *Monitor {
	return &Monitor{
		pollInterval:  1 * time.Second,
		previousStats: make(map[string]NetStats),
		store:         db,
		Verbose:       verbose,
		subscribers:   make(map[Subscriber]struct{}),
		settingsPath:  settingsPath,
	}
}

// Subscribe returns a channel that receives real-time data
func (m *Monitor) Subscribe() Subscriber {
	ch := make(Subscriber, 50)
	m.subMu.Lock()
	m.subscribers[ch] = struct{}{}
	m.subMu.Unlock()
	return ch
}

// Unsubscribe removes a channel from the broadcaster
func (m *Monitor) Unsubscribe(ch Subscriber) {
	m.subMu.Lock()
	delete(m.subscribers, ch)
	m.subMu.Unlock()
	close(ch)
}

func (m *Monitor) broadcast(data RealtimeData) {
	m.subMu.Lock()
	defer m.subMu.Unlock()
	for ch := range m.subscribers {
		select {
		case ch <- data:
		default:
			// Client is too slow, drop the packet to avoid blocking the daemon
		}
	}
}

// GetActiveNetworks returns the cached active networks
func (m *Monitor) GetActiveNetworks() []ActiveNetwork {
	m.netMu.RLock()
	defer m.netMu.RUnlock()
	copied := make([]ActiveNetwork, len(m.activeNetworks))
	copy(copied, m.activeNetworks)
	return copied
}

func (m *Monitor) Start(ctx context.Context) {
	log.Println("Starting Network Monitor polling loop...")
	ticker := time.NewTicker(m.pollInterval)
	defer ticker.Stop()

	quotaTicker := time.NewTicker(1 * time.Minute)
	defer quotaTicker.Stop()

	m.poll()
	m.checkQuotas()

	for {
		select {
		case <-ctx.Done():
			log.Println("Stopping Network Monitor polling loop...")
			return
		case <-ticker.C:
			m.poll()
		case <-quotaTicker.C:
			m.checkQuotas()
		}
	}
}

func (m *Monitor) checkQuotas() {
	if m.settingsPath == "" {
		return
	}

	data, err := os.ReadFile(m.settingsPath)
	if err != nil {
		return
	}

	var settings struct {
		DailyQuotaLimitMB   uint64 `json:"dailyQuotaLimitMB"`
		MonthlyQuotaLimitMB uint64 `json:"monthlyQuotaLimitMB"`
	}
	if err := json.Unmarshal(data, &settings); err != nil {
		return
	}

	if settings.DailyQuotaLimitMB == 0 && settings.MonthlyQuotaLimitMB == 0 {
		return
	}

	now := time.Now()
	y, mo, d := now.Date()
	todayStart := time.Date(y, mo, d, 0, 0, 0, 0, now.Location())
	monthStart := time.Date(y, mo, 1, 0, 0, 0, 0, now.Location())

	// Reset notification flags if period changed
	if !m.currentDay.Equal(todayStart) {
		m.currentDay = todayStart
		m.notifiedDaily80 = false
		m.notifiedDaily90 = false
		m.notifiedDaily100 = false
	}
	if !m.currentMonth.Equal(monthStart) {
		m.currentMonth = monthStart
		m.notifiedMonthly90 = false
		m.notifiedMonthly100 = false
	}

	if settings.DailyQuotaLimitMB > 0 {
		dailyUsage, err := m.store.GetTotalUsageSince(todayStart)
		if err == nil {
			limit := settings.DailyQuotaLimitMB * 1024 * 1024
			percentage := float64(dailyUsage) / float64(limit) * 100
			if percentage >= 100 && !m.notifiedDaily100 {
				m.notifiedDaily100 = true
				notifier.SendDesktopNotification("Daily Data Limit Reached", "You have reached 100% of your daily quota.")
			} else if percentage >= 90 && percentage < 100 && !m.notifiedDaily90 {
				m.notifiedDaily90 = true
				notifier.SendDesktopNotification("Daily Data Limit Warning", fmt.Sprintf("You have reached %.1f%% of your daily quota.", percentage))
			} else if percentage >= 80 && percentage < 90 && !m.notifiedDaily80 {
				m.notifiedDaily80 = true
				notifier.SendDesktopNotification("Daily Data Limit Warning", fmt.Sprintf("You have reached %.1f%% of your daily quota.", percentage))
			}
		}
	}

	if settings.MonthlyQuotaLimitMB > 0 {
		monthlyUsage, err := m.store.GetTotalUsageSince(monthStart)
		if err == nil {
			limit := settings.MonthlyQuotaLimitMB * 1024 * 1024
			percentage := float64(monthlyUsage) / float64(limit) * 100
			if percentage >= 100 && !m.notifiedMonthly100 {
				m.notifiedMonthly100 = true
				notifier.SendDesktopNotification("Monthly Data Limit Reached", "You have reached 100% of your monthly quota.")
			} else if percentage >= 90 && percentage < 100 && !m.notifiedMonthly90 {
				m.notifiedMonthly90 = true
				notifier.SendDesktopNotification("Monthly Data Limit Warning", fmt.Sprintf("You have reached %.1f%% of your monthly quota.", percentage))
			}
		}
	}
}

func (m *Monitor) poll() {
	networks, err := GetActiveNetworks()
	if err != nil {
		log.Printf("Error getting active networks: %v", err)
		return
	}
	
	// Cache active networks for the API
	m.netMu.Lock()
	m.activeNetworks = networks
	m.netMu.Unlock()

	if len(networks) == 0 {
		return
	}

	now := time.Now()

	for _, net := range networks {
		if net.Interface == "lo" {
			continue
		}

		stats, err := GetInterfaceStats(net.Interface)
		if err != nil {
			continue
		}

		prev, exists := m.previousStats[net.Interface]
		if exists {
			rxDelta := stats.RxBytes - prev.RxBytes
			txDelta := stats.TxBytes - prev.TxBytes
			
			// Always broadcast so frontend can plot zeros
			m.broadcast(RealtimeData{
				NetworkName: net.Name,
				Interface:   net.Interface,
				Timestamp:   now,
				RxDelta:     rxDelta,
				TxDelta:     txDelta,
			})
			
			if rxDelta > 0 || txDelta > 0 {
				if m.Verbose {
					log.Printf("Network: [%s] (%s) - Usage in last 1s -> RX: %d bytes, TX: %d bytes", net.Name, net.Interface, rxDelta, txDelta)
				}
				
				if m.store != nil {
					err := m.store.UpsertUsage(net.Name, now, rxDelta, txDelta)
					if err != nil {
						log.Printf("Failed to write to DB: %v", err)
					}
				}
			}
		}

		m.previousStats[net.Interface] = stats
	}
}
