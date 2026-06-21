package notifier

import (
	"log"

	"github.com/godbus/dbus/v5"
)

func SendDesktopNotification(title, body string) error {
	conn, err := dbus.SessionBus()
	if err != nil {
		log.Printf("Failed to connect to session bus for notifications: %v", err)
		return err
	}

	obj := conn.Object("org.freedesktop.Notifications", "/org/freedesktop/Notifications")
	
	// signature: ssuuayssasa{sv}i
	// SendNotification(app_name, replaces_id, app_icon, summary, body, actions, hints, expire_timeout)
	call := obj.Call("org.freedesktop.Notifications.Notify", 0,
		"NetScope",                 // app_name
		uint32(0),                 // replaces_id
		"netscope",// app_icon
		title,                     // summary
		body,                      // body
		[]string{},                // actions
		map[string]dbus.Variant{}, // hints
		int32(5000),               // timeout (ms)
	)

	if call.Err != nil {
		log.Printf("Failed to send notification: %v", call.Err)
		return call.Err
	}

	return nil
}
