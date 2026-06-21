import React, { useState } from 'react';
import Layout from './components/Layout';
import { ThemeProvider } from './components/ThemeContext';
import { SettingsProvider } from './components/SettingsContext';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import NetworksOverview from './components/NetworksOverview';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedNetwork, setSelectedNetwork] = useState(null);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'settings':
        return <Settings />;
      case 'networks_overview':
        return <NetworksOverview />;
      case 'network_detail':
        return <Dashboard networkName={selectedNetwork} />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <SettingsProvider>
      <ThemeProvider>
        <Layout activeTab={activeTab} setActiveTab={setActiveTab} selectedNetwork={selectedNetwork} setSelectedNetwork={setSelectedNetwork}>
          {renderContent()}
        </Layout>
      </ThemeProvider>
    </SettingsProvider>
  );
}

export default App;
