import React, { createContext, useContext, useEffect } from 'react';
import { useSettings } from './SettingsContext';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const { settings, saveSettings } = useSettings();
  const theme = settings?.theme || 'dark';

  useEffect(() => {
    let activeTheme = theme;
    let mediaQuery = null;

    if (theme === 'system') {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      activeTheme = mediaQuery.matches ? 'dark' : 'light';
    }

    const applyTheme = (t) => {
      document.documentElement.setAttribute('data-theme', t);
      if (t === 'custom' && settings?.customColors) {
        Object.entries(settings.customColors).forEach(([key, value]) => {
          document.documentElement.style.setProperty(`--${key}`, value);
        });
      } else {
        document.documentElement.removeAttribute('style');
      }
    };

    applyTheme(activeTheme);

    const handleChange = (e) => {
      if (theme === 'system') {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    };

    if (mediaQuery) {
      mediaQuery.addEventListener('change', handleChange);
    }

    return () => {
      if (mediaQuery) {
        mediaQuery.removeEventListener('change', handleChange);
      }
    };
  }, [theme, settings?.customColors]);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    saveSettings({ ...settings, theme: next });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
