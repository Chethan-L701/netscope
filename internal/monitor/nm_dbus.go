package monitor

import (
	"fmt"
	"github.com/godbus/dbus/v5"
)

const (
	nmBusName        = "org.freedesktop.NetworkManager"
	nmObjPath        = "/org/freedesktop/NetworkManager"
	nmInterface      = "org.freedesktop.NetworkManager"
	activeConnIface  = "org.freedesktop.NetworkManager.Connection.Active"
	deviceIface      = "org.freedesktop.NetworkManager.Device"
)

// ActiveNetwork represents an active connection managed by NetworkManager
type ActiveNetwork struct {
	Name      string // SSID or connection name
	Interface string // e.g. wlan0, eth0
	Type      string // e.g. 802-11-wireless, 802-3-ethernet
}

// GetActiveNetworks connects to NetworkManager via DBus and retrieves the active networks
func GetActiveNetworks() ([]ActiveNetwork, error) {
	conn, err := dbus.SystemBus()
	if err != nil {
		return nil, fmt.Errorf("failed to connect to system bus: %w", err)
	}

	obj := conn.Object(nmBusName, nmObjPath)
	
	// Get ActiveConnections property
	variant, err := obj.GetProperty(nmInterface + ".ActiveConnections")
	if err != nil {
		return nil, fmt.Errorf("failed to get active connections: %w", err)
	}

	activeConnPaths, ok := variant.Value().([]dbus.ObjectPath)
	if !ok {
		return nil, fmt.Errorf("unexpected type for ActiveConnections")
	}

	var networks []ActiveNetwork

	for _, path := range activeConnPaths {
		acObj := conn.Object(nmBusName, path)
		
		idVariant, err := acObj.GetProperty(activeConnIface + ".Id")
		if err != nil {
			continue // skip if we can't get the ID
		}
		
		typeVariant, err := acObj.GetProperty(activeConnIface + ".Type")
		if err != nil {
			continue
		}

		devicesVariant, err := acObj.GetProperty(activeConnIface + ".Devices")
		if err != nil || devicesVariant.Value() == nil {
			continue
		}

		devicesPaths, ok := devicesVariant.Value().([]dbus.ObjectPath)
		if !ok || len(devicesPaths) == 0 {
			continue
		}

		// Get interface name from the first device
		devObj := conn.Object(nmBusName, devicesPaths[0])
		ifaceVariant, err := devObj.GetProperty(deviceIface + ".Interface")
		if err != nil {
			continue
		}

		networks = append(networks, ActiveNetwork{
			Name:      idVariant.Value().(string),
			Type:      typeVariant.Value().(string),
			Interface: ifaceVariant.Value().(string),
		})
	}

	return networks, nil
}
