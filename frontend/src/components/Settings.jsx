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
    monthlyQuotaLimitMB: 0
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
          <p>The API port has been changed. You must completely restart NetScope for the backend service to bind to the new port.</p>
          <button className="btn btn-apply" onClick={triggerRestart}>Close NetScope</button>
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
                  const res = await fetch(`http://localhost:${settings.port}/api/export?format=json`);
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
                  const res = await fetch(`http://localhost:${settings.port}/api/export?format=csv`);
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
                    await fetch(`http://localhost:${settings.port}/api/import`, {
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

      <div className="settings-actions">
        <button className="btn btn-cancel" onClick={handleCancel}>Cancel</button>
        <button className="btn btn-apply" onClick={handleApply}>Apply Changes</button>
      </div>
    </div>
  );
}
