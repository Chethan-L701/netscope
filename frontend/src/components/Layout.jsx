import React from 'react';
import Sidebar from './Sidebar';
import './Layout.scss';

export default function Layout({ children, activeTab, setActiveTab, selectedNetwork, setSelectedNetwork }) {
  return (
    <div className="layout-container">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} selectedNetwork={selectedNetwork} setSelectedNetwork={setSelectedNetwork} />
      <main className="layout-main">
        <div className="content-wrapper">
          {children}
        </div>
      </main>
    </div>
  );
}
