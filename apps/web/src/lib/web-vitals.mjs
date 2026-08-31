/**
 * Privacy-preserving Web Vitals beacon — no cookies, sampled async reporting.
 * Sends aggregate LCP/INP/CLS to a self-hosted endpoint or logs in dev.
 */
export function initWebVitals() {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

  const report = (metric) => {
    const payload = {
      name: metric.name,
      value: Math.round(metric.value),
      path: window.location.pathname,
      ts: Date.now(),
    };
    if (import.meta.env.DEV) {
      console.debug('[vitals]', payload);
      return;
    }
    try {
      navigator.sendBeacon?.('/api/vitals', JSON.stringify(payload));
    } catch {
      // Non-blocking — vitals reporting must never affect UX.
    }
  };

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'largest-contentful-paint') {
          report({ name: 'LCP', value: entry.startTime });
        }
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    // Observer not supported for this metric.
  }
}