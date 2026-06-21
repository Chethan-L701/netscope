import React, { useState, useEffect } from 'react';
import { useSettings } from './SettingsContext';
import { format, subDays, startOfDay, parseISO, startOfWeek, subWeeks, addDays } from 'date-fns';
import { formatBytes } from '../utils/format';
import './Heatmap.scss';

export default function Heatmap({ network }) {
  const { settings } = useSettings();
  const apiBase = `http://localhost:${settings?.port || "8080"}`;
  const [data, setData] = useState([]);
  const [maxUsage, setMaxUsage] = useState(1);

  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, content: null });

  useEffect(() => {
    if (!network) return;

    fetch(`${apiBase}/api/usage?network=${network}&period=daily`)
      .then(res => res.json())
      .then(usageData => {
        const now = startOfDay(new Date());
        // Align to Sunday, 25 weeks ago
        const startDate = startOfWeek(subWeeks(now, 25), { weekStartsOn: 0 });
        const daysCount = 182; // 26 weeks * 7 days
        
        const map = new Map();
        for (let i = 0; i < daysCount; i++) {
          const d = addDays(startDate, i);
          map.set(format(d, 'yyyy-MM-dd'), { date: d, usage: 0, isFuture: d > now });
        }

        let max = 1;
        usageData.forEach(d => {
          const dateStr = format(parseISO(d.timestamp), 'yyyy-MM-dd');
          if (map.has(dateStr)) {
            const total = d.rx_bytes + d.tx_bytes;
            map.get(dateStr).usage += total;
            if (map.get(dateStr).usage > max) {
              max = map.get(dateStr).usage;
            }
          }
        });

        setMaxUsage(max);
        setData(Array.from(map.values()));
      })
      .catch(console.error);
  }, [network, apiBase]);

  const handleMouseEnter = (e, cell) => {
    const rect = e.target.getBoundingClientRect();
    setTooltip({
      show: true,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
      content: `${format(cell.date, 'MMM dd, yyyy')}: ${cell.isFuture ? 'No Data (Future)' : formatBytes(cell.usage)}`
    });
  };

  const handleMouseLeave = () => {
    setTooltip(prev => ({ ...prev, show: false }));
  };

  return (
    <div className="heatmap-container">
      <div className="heatmap-header">
        <h3>{network} Usage (Last 6 Months)</h3>
      </div>
      <div className="heatmap-wrapper">
        <div className="heatmap-y-axis">
          <span style={{ gridRow: 1 }}>Sun</span>
          <span style={{ gridRow: 2 }}>Mon</span>
          <span style={{ gridRow: 3 }}>Tue</span>
          <span style={{ gridRow: 4 }}>Wed</span>
          <span style={{ gridRow: 5 }}>Thu</span>
          <span style={{ gridRow: 6 }}>Fri</span>
          <span style={{ gridRow: 7 }}>Sat</span>
        </div>
        <div className="heatmap-main">
          <div className="heatmap-x-axis">
            {Array.from({ length: 26 }).map((_, i) => (
              <span key={i}>W{i + 1}</span>
            ))}
          </div>
          <div className="heatmap-grid" onMouseLeave={handleMouseLeave}>
            {data.map((cell, i) => {
              // Calculate intensity from 20% to 100%
              const intensity = cell.usage > 0 ? Math.max(20, Math.round((cell.usage / maxUsage) * 100)) : 0;
              return (
                <div 
                  key={i} 
                  className={`heatmap-cell ${cell.usage === 0 ? 'empty' : ''} ${cell.isFuture ? 'future' : ''}`}
                  style={cell.usage > 0 ? { backgroundColor: `color-mix(in srgb, var(--accent-color) ${intensity}%, transparent)` } : {}}
                  onMouseEnter={(e) => handleMouseEnter(e, cell)}
                />
              );
            })}
          </div>
        </div>
      </div>
      
      {tooltip.show && (
        <div style={{
          position: 'fixed',
          top: tooltip.y,
          left: tooltip.x,
          transform: 'translate(-50%, -100%)',
          backgroundColor: 'var(--surface-bg)',
          color: 'var(--text-primary)',
          padding: '0.5rem 0.75rem',
          borderRadius: '6px',
          boxShadow: 'var(--shadow-md)',
          border: '1px solid var(--surface-border)',
          fontSize: '0.75rem',
          fontWeight: 500,
          pointerEvents: 'none',
          zIndex: 1000,
          whiteSpace: 'nowrap'
        }}>
          {tooltip.content}
        </div>
      )}
      <div className="heatmap-legend">
        <span>Less</span>
        <div className="legend-scale">
          <div className="heatmap-cell empty" />
          <div className="heatmap-cell" style={{ backgroundColor: `color-mix(in srgb, var(--accent-color) 20%, transparent)` }} />
          <div className="heatmap-cell" style={{ backgroundColor: `color-mix(in srgb, var(--accent-color) 40%, transparent)` }} />
          <div className="heatmap-cell" style={{ backgroundColor: `color-mix(in srgb, var(--accent-color) 60%, transparent)` }} />
          <div className="heatmap-cell" style={{ backgroundColor: `color-mix(in srgb, var(--accent-color) 80%, transparent)` }} />
          <div className="heatmap-cell" style={{ backgroundColor: `color-mix(in srgb, var(--accent-color) 100%, transparent)` }} />
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
