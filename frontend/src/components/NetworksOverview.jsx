import React, { useState, useEffect } from 'react';
import { useSettings } from './SettingsContext';
import Heatmap from './Heatmap';
import NetworkComparison from './NetworkComparison';

export default function NetworksOverview() {
  const { settings } = useSettings();
  const apiBase = `http://localhost:${settings?.port || "8080"}`;
  const apiKeyParam = `apiKey=${settings?.apiKey || ''}`;
  const [networks, setNetworks] = useState([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${apiBase}/api/networks?${apiKeyParam}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then(data => {
        if (data) setNetworks(data);
        setError(false);
      })
      .catch(() => setError(true));
  }, [apiBase]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Networks Overview</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>Historical usage activity across all known interfaces</p>
        </div>
      </div>

      {error && (
        <div style={{ 
          background: 'rgba(239, 68, 68, 0.1)', 
          border: '1px solid rgba(239, 68, 68, 0.5)', 
          color: '#ef4444', 
          padding: '0.75rem 1rem', 
          borderRadius: '8px', 
          fontSize: '0.875rem', 
          fontWeight: 500, 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.5rem',
          marginBottom: '1rem'
        }}>
          Unable to connect to the backend daemon.
        </div>
      )}

      {!error && <NetworkComparison />}

      {!error && networks.length === 0 && (
        <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.875rem' }}>
          No networks recorded yet.
        </div>
      )}

      {networks.map(net => (
        <Heatmap key={net} network={net} />
      ))}
    </div>
  );
}
