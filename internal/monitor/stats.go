package monitor

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// NetStats holds the received and transmitted bytes for an interface
type NetStats struct {
	RxBytes uint64
	TxBytes uint64
}

// GetInterfaceStats reads the rx and tx bytes from /sys/class/net/<iface>/statistics
func GetInterfaceStats(iface string) (NetStats, error) {
	rxFile := filepath.Join("/sys/class/net", iface, "statistics", "rx_bytes")
	txFile := filepath.Join("/sys/class/net", iface, "statistics", "tx_bytes")

	rxBytesStr, err := os.ReadFile(rxFile)
	if err != nil {
		return NetStats{}, fmt.Errorf("failed to read rx_bytes: %w", err)
	}

	txBytesStr, err := os.ReadFile(txFile)
	if err != nil {
		return NetStats{}, fmt.Errorf("failed to read tx_bytes: %w", err)
	}

	rxBytes, err := strconv.ParseUint(strings.TrimSpace(string(rxBytesStr)), 10, 64)
	if err != nil {
		return NetStats{}, fmt.Errorf("failed to parse rx_bytes: %w", err)
	}

	txBytes, err := strconv.ParseUint(strings.TrimSpace(string(txBytesStr)), 10, 64)
	if err != nil {
		return NetStats{}, fmt.Errorf("failed to parse tx_bytes: %w", err)
	}

	return NetStats{
		RxBytes: rxBytes,
		TxBytes: txBytes,
	}, nil
}
