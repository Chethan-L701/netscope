import React, { useState, useEffect } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Cell, PieChart, Pie } from 'recharts';
import { formatBytes } from '../utils/format';
import { subDays, startOfDay, parseISO } from 'date-fns';
import { useSettings } from './SettingsContext';

const NETWORK_COLORS = [
  '#7a98b4', // accent blue
  '#8bb49c', // muted sage
  '#b4987a', // muted sand
  '#b47a98', // muted plum
  '#987ab4', // muted lavender
  '#7ab498', // muted teal
  '#e2a87a', // muted apricot
  '#7aa8e2', // muted sky
];

export default function NetworkComparison() {
  const { settings } = useSettings();
  const apiBase = `http://localhost:${settings?.port || "8080"}`;
  const apiKeyParam = `apiKey=${settings?.apiKey || ''}`;
  const [allNetworks, setAllNetworks] = useState([]);
  const [bottomMode, setBottomMode] = useState('today');
  const [bottomData, setBottomData] = useState([]);

  useEffect(() => {
    fetch(`${apiBase}/api/networks?${apiKeyParam}`)
      .then(res => res.json())
      .then(data => {
        if (data) setAllNetworks(data);
      })
      .catch(console.error);
  }, [apiBase]);

  useEffect(() => {
    if (allNetworks.length === 0) return;

    const fetchPromises = allNetworks.map(net => 
      fetch(`${apiBase}/api/usage?network=${net}&period=daily&${apiKeyParam}`)
        .then(res => res.json())
        .then(data => ({ network: net, data }))
    );

    Promise.all(fetchPromises).then(results => {
      const now = new Date();
      let threshold;
      if (bottomMode === 'today') threshold = startOfDay(now).getTime();
      else if (bottomMode === 'week') threshold = subDays(now, 7).getTime();
      else if (bottomMode === 'month') threshold = subDays(now, 30).getTime();

      const aggregated = results.map(res => {
        const filtered = (res.data || []).filter(d => parseISO(d.timestamp).getTime() >= threshold);
        const total = filtered.reduce((acc, curr) => acc + curr.rx_bytes + curr.tx_bytes, 0);
        return {
          network: res.network,
          total: total
        };
      }).filter(d => d.total > 0).sort((a, b) => b.total - a.total);

      setBottomData(aggregated);
    });
  }, [allNetworks, bottomMode, apiBase]);

  return (
    <div style={{ background: 'var(--surface-bg)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--surface-border)', boxShadow: 'var(--shadow-sm)', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Network Comparison</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Data usage across all known networks</p>
          </div>
          <select 
            value={bottomMode} 
            onChange={e => setBottomMode(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'var(--bg-gradient-start)', color: 'var(--text-primary)', outline: 'none' }}
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
        </div>

        <div style={{ padding: '1rem 0' }}>
          {bottomData.length > 0 ? (() => {
            const totalUsage = bottomData.reduce((acc, curr) => acc + curr.total, 0);
            return (
              <>
                  {settings?.bottomChartType === 'normal_pie' ? (
                    <div style={{ height: 300, width: '100%', marginBottom: '1rem' }}>
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie
                            data={bottomData}
                            dataKey="total"
                            nameKey="network"
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={2}
                          >
                            {bottomData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={NETWORK_COLORS[index % NETWORK_COLORS.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip formatter={(value) => formatBytes(value)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : settings?.bottomChartType === 'bar' ? (
                    <div style={{ height: 300, width: '100%', marginBottom: '1rem' }}>
                      <ResponsiveContainer>
                        <BarChart data={bottomData} layout="vertical" margin={{ left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" horizontal={false} />
                          <XAxis type="number" tickFormatter={(val) => formatBytes(val, 0)} stroke="var(--text-secondary)" fontSize={12} />
                          <YAxis dataKey="network" type="category" stroke="var(--text-secondary)" fontSize={12} />
                          <RechartsTooltip formatter={(value) => formatBytes(value)} cursor={{fill: 'var(--accent-bg)'}} />
                          <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                            {bottomData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={NETWORK_COLORS[index % NETWORK_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', height: '14px', borderRadius: '8px', overflow: 'hidden', marginBottom: '2rem', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)' }}>
                      {bottomData.map((d, i) => (
                        <div 
                          key={d.network} 
                          style={{ 
                            width: `${(d.total / totalUsage) * 100}%`, 
                            backgroundColor: NETWORK_COLORS[i % NETWORK_COLORS.length],
                            transition: 'width 0.3s ease'
                          }} 
                          title={`${d.network}: ${formatBytes(d.total)}`}
                        />
                      ))}
                    </div>
                  )}
                  
                  {/* The Legend */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
                    {bottomData.map((d, i) => {
                      const percentage = totalUsage > 0 ? ((d.total / totalUsage) * 100).toFixed(1) : 0;
                      return (
                        <div key={d.network} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: NETWORK_COLORS[i % NETWORK_COLORS.length] }} />
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{d.network}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              {percentage}% <span style={{ opacity: 0.5 }}>•</span> {formatBytes(d.total)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
              </>
            );
          })() : (
            <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.875rem' }}>No data available for this period.</div>
          )}
        </div>
      </div>
  );
}
