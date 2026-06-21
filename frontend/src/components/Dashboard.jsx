import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';
import { formatBytes } from '../utils/format';
import { 
  subHours, subDays, startOfDay, endOfDay, startOfYear, endOfYear, format, isAfter, getMonth, parseISO,
  eachMinuteOfInterval, eachHourOfInterval, eachDayOfInterval, startOfMonth, endOfMonth,
  startOfHour, endOfHour, setMonth
} from 'date-fns';
import { ArrowLeft } from 'lucide-react';
import Heatmap from './Heatmap';

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

import { useSettings } from './SettingsContext';

export default function Dashboard({ networkName }) {
  const { settings } = useSettings();
  const apiBase = `http://localhost:${settings?.port || "8080"}`;
  const [activeNetwork, setActiveNetwork] = useState(networkName || '');
  const [connectedNetworks, setConnectedNetworks] = useState([]);
  const [allNetworks, setAllNetworks] = useState([]);

  const [topMode, setTopMode] = useState('realtime');
  const [topData, setTopData] = useState([]);
  
  const [drilldownHistory, setDrilldownHistory] = useState([]);
  const [activeDrilldown, setActiveDrilldown] = useState(null);

  const [connectionError, setConnectionError] = useState(false);

  useEffect(() => {
    fetch(`${apiBase}/api/networks/active`)
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        setConnectionError(false);
        return res.json();
      })
      .then(data => {
        if (data && data.length > 0) {
          const names = data.map(n => n.Name);
          setConnectedNetworks(names);
          if (!networkName) {
            const net = data.find(n => n.Name !== 'lo') || data[0];
            setActiveNetwork(net.Name);
          }
        }
      })
      .catch(() => setConnectionError(true));

    fetch(`${apiBase}/api/networks`)
      .then(res => res.json())
      .then(data => {
        if (data) setAllNetworks(data);
      })
      .catch(() => setConnectionError(true));
  }, [apiBase, networkName]);

  useEffect(() => {
    if (networkName) {
      setActiveNetwork(networkName);
      setDrilldownHistory([]);
      setActiveDrilldown(null);
    }
  }, [networkName]);

  useEffect(() => {
    if (activeNetwork && connectedNetworks.length > 0) {
      if (!connectedNetworks.includes(activeNetwork) && topMode === 'realtime') {
        setTopMode('hourly');
      }
    }
  }, [activeNetwork, connectedNetworks, topMode]);

  // Top Chart Logic
  useEffect(() => {
    if (!activeNetwork) return;

    if (topMode === 'realtime') {
      setTopData([]);
      const sse = new EventSource(`${apiBase}/api/realtime?network=${activeNetwork}`);
      
      sse.onmessage = (e) => {
        setConnectionError(false);
        const parsed = JSON.parse(e.data);
        const point = {
          time: format(new Date(parsed.timestamp), 'HH:mm:ss'),
          rx: parsed.rx_bytes,
          tx: -parsed.tx_bytes,
          total: parsed.rx_bytes + parsed.tx_bytes,
        };
        setTopData(prev => {
          const newData = [...prev, point];
          if (newData.length > 300) return newData.slice(newData.length - 300);
          return newData;
        });
      };
      
      sse.onerror = () => {
        setConnectionError(true);
      };

      return () => sse.close();
    } else {
      // Historical fetch
      let period = 'daily';
      if (topMode === 'hourly') period = 'minute';
      if (topMode === 'daily') period = 'hour';

      fetch(`${apiBase}/api/usage?network=${activeNetwork}&period=${period}`)
        .then(res => res.json())
        .then(data => {
          const now = new Date();
          let intervals = [];
          let timeFormat = '';
          let keyFormat = '';
          
          const anchorDate = activeDrilldown ? new Date(activeDrilldown) : null;

          if (topMode === 'hourly') {
            intervals = anchorDate 
              ? eachMinuteOfInterval({ start: startOfHour(anchorDate), end: endOfHour(anchorDate) })
              : eachMinuteOfInterval({ start: subHours(now, 1), end: now });
            timeFormat = 'HH:mm';
            keyFormat = 'yyyy-MM-dd HH:mm';
          } else if (topMode === 'daily') {
            intervals = anchorDate
              ? eachHourOfInterval({ start: startOfDay(anchorDate), end: endOfDay(anchorDate) })
              : eachHourOfInterval({ start: startOfDay(now), end: endOfDay(now) });
            timeFormat = 'HH:mm';
            keyFormat = 'yyyy-MM-dd HH';
          } else if (topMode === 'weekly') {
            intervals = eachDayOfInterval({ start: subDays(now, 6), end: now });
            timeFormat = 'MMM dd';
            keyFormat = 'yyyy-MM-dd';
          } else if (topMode === 'monthly') {
            intervals = anchorDate
              ? eachDayOfInterval({ start: startOfMonth(anchorDate), end: endOfMonth(anchorDate) })
              : eachDayOfInterval({ start: subDays(now, 29), end: now });
            timeFormat = 'MMM dd';
            keyFormat = 'yyyy-MM-dd';
          }

          if (topMode !== 'yearly') {
            // Initialize empty buckets
            const bucketMap = {};
            const formattedData = intervals.map(date => {
              const time = format(date, timeFormat);
              const key = format(date, keyFormat);
              const bucket = { time, rx: 0, tx: 0, total: 0, _rawDate: date };
              bucketMap[key] = bucket;
              return bucket;
            });

            // Populate with DB data
            data.forEach(d => {
              const dbDate = parseISO(d.timestamp);
              const timeKey = format(dbDate, keyFormat);
              if (bucketMap[timeKey]) {
                bucketMap[timeKey].rx += d.rx_bytes;
                bucketMap[timeKey].tx -= d.tx_bytes;
                bucketMap[timeKey].total += (d.rx_bytes + d.tx_bytes);
              }
            });

            setTopData(formattedData);
          } else {
            // Yearly logic
            const targetYear = activeDrilldown ? new Date(activeDrilldown) : now;
            const threshold = startOfYear(targetYear).getTime();
            const endThreshold = endOfYear(targetYear).getTime();
            
            const yearData = data.filter(d => {
              const t = parseISO(d.timestamp).getTime();
              return t >= threshold && t <= endThreshold;
            });
            const monthlySums = Array(12).fill(0).map(() => ({rx: 0, tx: 0, total: 0}));
            yearData.forEach(d => {
              const m = getMonth(parseISO(d.timestamp));
              monthlySums[m].rx += d.rx_bytes;
              monthlySums[m].tx -= d.tx_bytes;
              monthlySums[m].total += (d.rx_bytes + d.tx_bytes);
            });
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const formattedData = monthlySums.map((sums, i) => {
              const dDate = setMonth(startOfYear(targetYear), i);
              return {
                time: monthNames[i],
                rx: sums.rx,
                tx: sums.tx,
                total: sums.total,
                _rawDate: dDate
              };
            });
            setTopData(formattedData);
          }
        })
        .catch(() => setConnectionError(true));
    }
  }, [activeNetwork, topMode, activeDrilldown, apiBase]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: 'var(--surface-bg)', border: '1px solid var(--surface-border)', padding: '10px', borderRadius: '8px', color: 'var(--text-primary)', boxShadow: 'var(--shadow-md)', zIndex: 100 }}>
          <p style={{ marginBottom: '0.5rem', fontWeight: 500 }}>{label}</p>
          {payload.map(p => (
            <p key={p.name || p.dataKey} style={{ color: p.fill || p.stroke || 'var(--accent-color)', fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem' }}>
              {p.name === 'total' ? 'Total' : p.name === 'rx' ? 'Download' : p.name === 'tx' ? 'Upload' : p.name}: {formatBytes(Math.abs(p.value || 0))}
            </p>
          ))}
          {payload[0]?.payload?._rawDate && topMode !== 'hourly' && (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem', fontStyle: 'italic' }}>Click to zoom in</p>
          )}
        </div>
      );
    }
    return null;
  };

  const handleChartClick = (dataOrState) => {
    try {
      let payload = null;
      
      // The most reliable way in Recharts: use the activeIndex to pull from our local topData
      if (dataOrState && dataOrState.activeIndex !== undefined && topData[dataOrState.activeIndex]) {
        payload = topData[dataOrState.activeIndex];
      } else if (dataOrState && dataOrState.activePayload && dataOrState.activePayload.length > 0) {
        payload = dataOrState.activePayload[0].payload;
      } else if (dataOrState && dataOrState.payload) {
        payload = dataOrState.payload;
      } else if (dataOrState && dataOrState._rawDate) {
        payload = dataOrState;
      }

      if (!payload || !payload._rawDate) {
        return;
      }

      if (topMode === 'yearly' || topMode === 'monthly' || topMode === 'daily' || topMode === 'weekly') {
        setDrilldownHistory(prev => [...prev, { mode: topMode, anchor: activeDrilldown }]);
        setActiveDrilldown(payload._rawDate);
        
        if (topMode === 'yearly') setTopMode('monthly');
        else if (topMode === 'monthly' || topMode === 'weekly') setTopMode('daily');
        else if (topMode === 'daily') setTopMode('hourly');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBack = () => {
    if (drilldownHistory.length === 0) return;
    const last = drilldownHistory[drilldownHistory.length - 1];
    setTopMode(last.mode);
    setActiveDrilldown(last.anchor);
    setDrilldownHistory(prev => prev.slice(0, prev.length - 1));
  };

  const displayTopData = settings?.topChartType === 'separate' 
    ? topData.map(d => ({ ...d, tx: Math.abs(d.tx) }))
    : topData;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Error Banner */}
      {connectionError && (
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
          gap: '0.5rem' 
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          Unable to connect to the NetScope backend daemon. Realtime and historical data may be unavailable.
        </div>
      )}

      {/* Heatmap Section */}
      {networkName && activeNetwork && <Heatmap network={activeNetwork} />}

      {/* Top Chart Section */}
      <div style={{ background: 'var(--surface-bg)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--surface-border)', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {drilldownHistory.length > 0 && (
                <button 
                  onClick={handleBack}
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.25rem', borderRadius: '6px' }}
                  title="Go back"
                >
                  <ArrowLeft size={18} />
                </button>
              )}
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                Network Usage {activeDrilldown ? `(${format(new Date(activeDrilldown), topMode === 'monthly' ? 'MMMM yyyy' : topMode === 'daily' ? 'MMM dd, yyyy' : topMode === 'hourly' ? 'MMM dd, yyyy HH:mm' : 'yyyy')})` : 'Overview'}
              </h3>
            </div>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem', marginLeft: drilldownHistory.length > 0 ? '1.75rem' : '0' }}>
              Current Network: <span style={{ color: 'var(--accent-color)', fontWeight: 500 }}>{activeNetwork}</span>
            </span>
          </div>
          <select 
            value={topMode} 
            onChange={(e) => {
              setTopMode(e.target.value);
              setDrilldownHistory([]);
              setActiveDrilldown(null);
            }} 
            style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'var(--bg-gradient-start)', color: 'var(--text-primary)', outline: 'none' }}
          >
            {connectedNetworks.includes(activeNetwork) && <option value="realtime">Realtime</option>}
            <option value="hourly">Last Hour</option>
            <option value="daily">Today (Hourly)</option>
            <option value="weekly">Last 7 Days</option>
            <option value="monthly">Last 30 Days</option>
            <option value="yearly">This Year</option>
          </select>
        </div>

        <div style={{ height: settings?.topChartType === 'separate' ? 500 : 350, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {settings?.topChartType === 'separate' ? (
            <>
              <div style={{ flex: 1 }}>
                <ResponsiveContainer width="100%" height="100%">
                  {topMode === 'realtime' ? (
                    <AreaChart data={displayTopData}>
                      <defs>
                        <linearGradient id="colorRx" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--accent-color)" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="var(--accent-color)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                      <XAxis dataKey="time" stroke="var(--text-secondary)" fontSize={12} tickMargin={10} minTickGap={30} />
                      <YAxis tickFormatter={(val) => formatBytes(Math.abs(val), 0)} stroke="var(--text-secondary)" fontSize={12} width={80} />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="rx" name="Download" stroke="var(--accent-color)" strokeWidth={2} fillOpacity={1} fill="url(#colorRx)" isAnimationActive={false} />
                    </AreaChart>
                  ) : (
                    <BarChart data={displayTopData} onClick={handleChartClick} style={{ cursor: topMode !== 'hourly' ? 'pointer' : 'default' }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                      <XAxis dataKey="time" stroke="var(--text-secondary)" fontSize={12} tickMargin={10} minTickGap={30} />
                      <YAxis tickFormatter={(val) => formatBytes(Math.abs(val), 0)} stroke="var(--text-secondary)" fontSize={12} width={80} />
                      <RechartsTooltip content={<CustomTooltip />} cursor={{fill: 'var(--accent-bg)'}} />
                      <Bar dataKey="rx" name="rx" fill="var(--accent-color)" radius={[4, 4, 0, 0]} onClick={handleChartClick} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1 }}>
                <ResponsiveContainer width="100%" height="100%">
                  {topMode === 'realtime' ? (
                    <AreaChart data={displayTopData}>
                      <defs>
                        <linearGradient id="colorTx" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#b47a98" stopOpacity={0}/>
                          <stop offset="95%" stopColor="#b47a98" stopOpacity={0.4}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                      <XAxis dataKey="time" stroke="var(--text-secondary)" fontSize={12} tickMargin={10} minTickGap={30} />
                      <YAxis tickFormatter={(val) => formatBytes(Math.abs(val), 0)} stroke="var(--text-secondary)" fontSize={12} width={80} />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="tx" name="Upload" stroke="#b47a98" strokeWidth={2} fillOpacity={1} fill="url(#colorTx)" isAnimationActive={false} />
                    </AreaChart>
                  ) : (
                    <BarChart data={displayTopData} onClick={handleChartClick} style={{ cursor: topMode !== 'hourly' ? 'pointer' : 'default' }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                      <XAxis dataKey="time" stroke="var(--text-secondary)" fontSize={12} tickMargin={10} minTickGap={30} />
                      <YAxis tickFormatter={(val) => formatBytes(Math.abs(val), 0)} stroke="var(--text-secondary)" fontSize={12} width={80} />
                      <RechartsTooltip content={<CustomTooltip />} cursor={{fill: 'var(--accent-bg)'}} />
                      <Bar dataKey="tx" name="tx" fill="#b47a98" radius={[4, 4, 0, 0]} onClick={handleChartClick} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {topMode === 'realtime' ? (
                <AreaChart data={displayTopData}>
                  <defs>
                    <linearGradient id="colorRx" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent-color)" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="var(--accent-color)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorTx" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#b47a98" stopOpacity={0}/>
                      <stop offset="95%" stopColor="#b47a98" stopOpacity={0.4}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                  <XAxis dataKey="time" stroke="var(--text-secondary)" fontSize={12} tickMargin={10} minTickGap={30} />
                  <YAxis tickFormatter={(val) => formatBytes(Math.abs(val), 0)} stroke="var(--text-secondary)" fontSize={12} width={80} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="rx" name="Download" stroke="var(--accent-color)" strokeWidth={2} fillOpacity={1} fill="url(#colorRx)" isAnimationActive={false} />
                  <Area type="monotone" dataKey="tx" name="Upload" stroke="#b47a98" strokeWidth={2} fillOpacity={1} fill="url(#colorTx)" isAnimationActive={false} />
                </AreaChart>
              ) : (
                <BarChart data={displayTopData} stackOffset="sign" onClick={handleChartClick} style={{ cursor: topMode !== 'hourly' ? 'pointer' : 'default' }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                  <XAxis dataKey="time" stroke="var(--text-secondary)" fontSize={12} tickMargin={10} minTickGap={30} />
                  <YAxis tickFormatter={(val) => formatBytes(Math.abs(val), 0)} stroke="var(--text-secondary)" fontSize={12} width={80} />
                  <RechartsTooltip content={<CustomTooltip />} cursor={{fill: 'var(--accent-bg)'}} />
                  <Bar dataKey="rx" name="rx" stackId="a" fill="var(--accent-color)" radius={[4, 4, 0, 0]} onClick={handleChartClick} />
                  <Bar dataKey="tx" name="tx" stackId="a" fill="var(--error-color)" radius={[4, 4, 0, 0]} onClick={handleChartClick} />
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </div>

    </div>
  );
}
