import React, { createContext, useContext, useState, useEffect } from 'react';

const SettingsContext = createContext();

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState({
    port: "8080",
    topChartType: "combined", // 'combined', 'separate'
    bottomChartType: "straight_pie", // 'straight_pie', 'normal_pie', 'bar'
    theme: "dark", // 'dark', 'light', 'custom'
    customColors: {},
    keepBackground: true
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (window.api && window.api.settings) {
      window.api.settings.get().then((data) => {
        setSettings(data);
        setLoading(false);
      });
    } else {
      console.warn("Electron API not found. Using default settings.");
      setLoading(false);
    }
  }, []);

  const saveSettings = async (newSettings) => {
    setSettings(newSettings);
    // Persist via backend API
    const port = settings?.port || "8080";
    try {
      await fetch(`http://localhost:${port}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
    } catch (e) {
      console.error("Failed to save settings via API:", e);
    }
  };

  const triggerRestart = () => {
    if (window.api && window.api.settings) {
      window.api.settings.quit();
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, saveSettings, triggerRestart, loading }}>
      {!loading && children}
    </SettingsContext.Provider>
  );
};
