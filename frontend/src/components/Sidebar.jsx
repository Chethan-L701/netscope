import React, { useState, useEffect } from 'react';
import { useTheme } from './ThemeContext';
import { useSettings } from './SettingsContext';
import { Activity, Settings, Sun, Moon, Network, ChevronDown, ChevronRight } from 'lucide-react';
import './Sidebar.scss';

export default function Sidebar({ activeTab, setActiveTab, selectedNetwork, setSelectedNetwork }) {
  const { theme, toggleTheme } = useTheme();
  const { settings } = useSettings();
  const [networksOpen, setNetworksOpen] = useState(false);
  const [networks, setNetworks] = useState([]);

  useEffect(() => {
    const port = settings.port || 8080;
    fetch(`http://localhost:${port}/api/networks?apiKey=${settings.apiKey || ''}`)
      .then(res => res.json())
      .then(data => {
        if (data) setNetworks(data);
      })
      .catch(() => {});
  }, [settings]);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo-icon">
          <Activity size={24} />
        </div>
        <h2>NetScope</h2>
      </div>

      <nav className="sidebar-nav">
        <div 
          className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <Activity size={20} />
          <span>Dashboard</span>
        </div>
        
        <div 
          className={`nav-item ${activeTab === 'networks_overview' || activeTab === 'network_detail' ? 'active' : ''}`}
          onClick={() => {
            if (!networksOpen) setNetworksOpen(true);
            setActiveTab('networks_overview');
            setSelectedNetwork(null);
          }}
          style={{ justifyContent: 'space-between' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Network size={20} />
            <span>Networks</span>
          </div>
          <div 
            onClick={(e) => {
              e.stopPropagation();
              setNetworksOpen(!networksOpen);
            }}
            style={{ display: 'flex', alignItems: 'center', padding: '0.25rem' }}
          >
            {networksOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
        </div>
        
        {networksOpen && (
          <div className="nav-subitems">
            {networks.length > 0 ? networks.map(net => (
              <div 
                key={net} 
                className={`nav-subitem ${activeTab === 'network_detail' && net === selectedNetwork ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('network_detail');
                  setSelectedNetwork(net);
                }}
              >
                <span>{net}</span>
              </div>
            )) : (
              <div className="nav-subitem" style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                <span>No networks</span>
              </div>
            )}
          </div>
        )}

        <div 
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <Settings size={20} />
          <span>Settings</span>
        </div>
      </nav>

      <div className="sidebar-footer">
        <button className="theme-toggle" onClick={toggleTheme}>
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </div>
    </aside>
  );
}
