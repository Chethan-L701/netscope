import React, { useState, useEffect } from 'react';
import { useSettings } from './SettingsContext';
import './Settings.scss';

const DEFAULT_COLORS = {
  'bg-gradient-start': '#1e242c',
  'bg-gradient-end': '#14181d',
  'sidebar-bg': '#1c2128',
  'sidebar-border': '#2d333b',
  'text-primary': '#e2e8f0',
  'text-secondary': '#94a3b8',
  'accent-color': '#8aa8c4',
  'surface-bg': '#22272e',
  'surface-border': '#373e47'
};

export default function Settings() {
  const { settings, saveSettings, triggerRestart } = useSettings();
  
  const [draft, setDraft] = useState({
    topChartType: "combined",
    bottomChartType: "straight_pie",
    theme: "dark",
    customColors: {},
    dailyQuotaLimitMB: 0,
    monthlyQuotaLimitMB: 0,
    keepBackground: true
  });

  const [showRestart, setShowRestart] = useState(false);

  useEffect(() => {
    if (settings) {
      setDraft({
        ...settings,
        customColors: { ...DEFAULT_COLORS, ...(settings.customColors || {}) }
      });
    }
  }, [settings]);

  const handleApply = () => {
    saveSettings(draft);
    if (draft.port !== settings.port) {
      setShowRestart(true);
    }
  };

  const handleCancel = () => {
    if (settings) {
      setDraft({
        ...settings,
        customColors: { ...DEFAULT_COLORS, ...(settings.customColors || {}) }
      });
    }
  };

  const updateDraft = (key, value) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  const updateColor = (key, value) => {
    setDraft(prev => ({
      ...prev,
      customColors: {
        ...prev.customColors,
        [key]: value
      }
    }));
  };

  if (showRestart) {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <h3>Restart Required</h3>
          <p>The API port has been changed. The backend service needs to be restarted to bind to the new port.</p>
          <button className="btn btn-apply" onClick={() => {
            if (window.api && window.api.settings.restartBackend) {
              window.api.settings.restartBackend();
              setShowRestart(false);
              alert("Daemon restarted on the new port. The UI will now use the new connection.");
              // Reload page to re-initialize contexts with the new port
              window.location.reload();
            } else {
              triggerRestart();
            }
          }}>Restart Daemon</button>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <h1>Settings</h1>

      <div className="settings-section">
        <h2>Backend Configuration</h2>
        <div className="setting-row">
          <span className="setting-label">API Port</span>
          <input 
            type="number" 
            className="setting-input" 
            value={draft.port} 
            onChange={(e) => updateDraft('port', e.target.value)} 
          />
        </div>
        <div className="setting-row">
          <span className="setting-label">Keep Process in Background</span>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={draft.keepBackground !== false}
              onChange={(e) => {
                if (!e.target.checked) {
                  const confirmMsg = "Turning this off will disable data usage monitoring when the UI is closed. Do you wish to proceed?";
                  if (!window.confirm(confirmMsg)) {
                    return; // cancel toggle
                  }
                }
                updateDraft('keepBackground', e.target.checked);
              }}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <span style={{ marginLeft: '10px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Monitor usage when UI is closed
            </span>
          </label>
        </div>
      </div>

      <div className="settings-section">
        <h2>Data Usage Quota & Alerts</h2>
        <div className="setting-row">
          <span className="setting-label">Daily Quota Limit (MB)</span>
          <input 
            type="number" 
            className="setting-input" 
            placeholder="0 for unlimited"
            value={draft.dailyQuotaLimitMB || 0} 
            onChange={(e) => updateDraft('dailyQuotaLimitMB', parseInt(e.target.value) || 0)} 
          />
        </div>
        <div className="setting-row">
          <span className="setting-label">Monthly Quota Limit (MB)</span>
          <input 
            type="number" 
            className="setting-input" 
            placeholder="0 for unlimited"
            value={draft.monthlyQuotaLimitMB || 0} 
            onChange={(e) => updateDraft('monthlyQuotaLimitMB', parseInt(e.target.value) || 0)} 
          />
        </div>
      </div>

      <div className="settings-section">
        <h2>Dashboard Layout</h2>
        <div className="setting-row">
          <span className="setting-label">Top Chart Style</span>
          <select 
            className="setting-input" 
            value={draft.topChartType}
            onChange={(e) => updateDraft('topChartType', e.target.value)}
          >
            <option value="combined">Combined Bar Chart (Default)</option>
            <option value="separate">Separate Area Charts (Upload / Download)</option>
          </select>
        </div>
        <div className="setting-row">
          <span className="setting-label">Second Chart Style</span>
          <select 
            className="setting-input" 
            value={draft.bottomChartType}
            onChange={(e) => updateDraft('bottomChartType', e.target.value)}
          >
            <option value="straight_pie">Straight Pie Chart (Default)</option>
            <option value="normal_pie">Normal Pie Chart</option>
            <option value="bar">Bar Chart</option>
          </select>
        </div>
      </div>

      <div className="settings-section">
        <h2>Appearance</h2>
        <div className="setting-row">
          <span className="setting-label">Theme Mode</span>
          <select 
            className="setting-input" 
            value={draft.theme}
            onChange={(e) => updateDraft('theme', e.target.value)}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="system">System (Auto)</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        {draft.theme === 'custom' && (
          <div className="color-picker-grid">
            {Object.keys(DEFAULT_COLORS).map(colorKey => (
              <div className="color-picker-item" key={colorKey}>
                <span>{colorKey.replace(/-/g, ' ')}</span>
                <input 
                  type="color" 
                  value={draft.customColors[colorKey] || DEFAULT_COLORS[colorKey]} 
                  onChange={(e) => updateColor(colorKey, e.target.value)} 
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="settings-section">
        <h2>Data Management</h2>
        <div className="setting-row">
          <span className="setting-label">Export Historical Data</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-cancel" onClick={async () => {
              if (window.api && window.api.dialog) {
                try {
                  const apiKeyParam = `apiKey=${settings?.apiKey || ''}`;
                  const res = await fetch(`http://localhost:${settings.port}/api/export?format=json&${apiKeyParam}`);
                  const data = await res.text();
                  const success = await window.api.dialog.showSaveDialog({
                    defaultPath: 'netscope_export.json',
                    data: data
                  });
                  if (success) alert("Export saved successfully.");
                } catch (e) {
                  alert("Export failed: " + e);
                }
              }
            }}>Export JSON</button>
            <button className="btn btn-cancel" onClick={async () => {
              if (window.api && window.api.dialog) {
                try {
                  const apiKeyParam = `apiKey=${settings?.apiKey || ''}`;
                  const res = await fetch(`http://localhost:${settings.port}/api/export?format=csv&${apiKeyParam}`);
                  const data = await res.text();
                  const success = await window.api.dialog.showSaveDialog({
                    defaultPath: 'netscope_export.csv',
                    data: data
                  });
                  if (success) alert("Export saved successfully.");
                } catch (e) {
                  alert("Export failed: " + e);
                }
              }
            }}>Export CSV</button>
          </div>
        </div>
        <div className="setting-row">
          <span className="setting-label">Import Historical Data</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-apply" onClick={async () => {
              if (window.api && window.api.dialog) {
                try {
                  const content = await window.api.dialog.showOpenDialog({
                    filters: [{ name: 'JSON Files', extensions: ['json'] }]
                  });
                  if (content) {
                    const apiKeyParam = `apiKey=${settings?.apiKey || ''}`;
                    await fetch(`http://localhost:${settings.port}/api/import?${apiKeyParam}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: content
                    });
                    alert("Import successful! Refresh to see changes.");
                  }
                } catch (e) {
                  alert("Import failed: " + e);
                }
              }
            }}>Import JSON</button>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h2>API & Security</h2>
        <div className="setting-row">
          <span className="setting-label">Local API Key</span>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input 
              type="text" 
              readOnly 
              className="setting-input" 
              value={settings.apiKey || 'Not Generated'} 
              style={{ width: '250px', background: 'var(--surface-bg)', opacity: 0.8 }} 
            />
            <button className="btn btn-cancel" onClick={() => {
              navigator.clipboard.writeText(settings.apiKey || '');
              alert('API Key copied to clipboard!');
            }}>Copy</button>
          </div>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          This key is required to make requests to the local API on port {settings.port}.
        </p>
      </div>

      <div className="settings-section">
        <h2>Daemon Management</h2>
        <div className="setting-row">
          <span className="setting-label">Restart Background Server</span>
          <button className="btn" style={{ background: 'var(--accent-color)', color: '#fff', border: 'none' }} onClick={() => {
            if (window.api && window.api.settings.restartBackend) {
              window.api.settings.restartBackend();
              alert("Restart signal sent. The daemon will restart in the background.");
            }
          }}>Restart Daemon</button>
        </div>
      </div>

      <div className="settings-section" style={{ border: '1px solid var(--error-color)', backgroundColor: 'var(--error-bg)' }}>
        <h2 style={{ color: 'var(--error-color)' }}>Danger Zone</h2>
        <div className="setting-row">
          <span className="setting-label" style={{ color: 'var(--error-color)' }}>Reset to Defaults</span>
          <button className="btn btn-danger-outline" onClick={() => {
            if (window.confirm("Are you sure you want to reset all settings to their default values? This action cannot be undone.")) {
              const defaultSettings = {
                port: "8080",
                topChartType: "combined",
                bottomChartType: "straight_pie",
                theme: "dark",
                customColors: {},
                dailyQuotaLimitMB: 0,
                monthlyQuotaLimitMB: 0,
                keepBackground: true
              };
              saveSettings(defaultSettings);
              setDraft(defaultSettings);
              alert("Settings reset to default.");
              if (settings.port !== "8080") {
                setShowRestart(true);
              }
            }
          }}>Reset Settings</button>
        </div>
        <div className="setting-row">
          <span className="setting-label" style={{ color: 'var(--error-color)' }}>Clear Local Database</span>
          <button className="btn btn-danger" onClick={async () => {
            if (window.confirm("CRITICAL WARNING: Are you sure you want to permanently delete ALL your historical data usage records? This action is absolutely irreversible.")) {
              try {
                const apiKeyParam = `apiKey=${settings?.apiKey || ''}`;
                const res = await fetch(`http://localhost:${settings.port}/api/database/clear?${apiKeyParam}`, { method: 'POST' });
                if (res.ok) {
                  alert("Database cleared successfully. Refresh the dashboard to see changes.");
                } else {
                  alert("Failed to clear database.");
                }
              } catch (e) {
                alert("Error: " + e.message);
              }
            }
          }}>Delete Database</button>
        </div>
      </div>

      <div className="settings-actions">
        <button className="btn btn-cancel" onClick={handleCancel}>Cancel</button>
        <button className="btn btn-apply" onClick={handleApply}>Apply Changes</button>
      </div>
    </div>
  );
}
