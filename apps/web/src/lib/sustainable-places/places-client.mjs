/**
 * Client-side Sustainable Places workspace.
 * MapLibre is lazy-loaded; evidence uses progressive fetch with cache and abort.
 */
import { ARCHETYPES, METRIC_DEFINITIONS } from './catalog.mjs';
import { DEMO_SITES } from './demo-sites.mjs';
import { fetchLocationEvidenceProgressive, geocodeQuery } from './feeds.mjs';
import { calculateTea, scoreSite } from './tea.mjs';

export async function initPlacesWorkspace(root) {
  const mapElement = root?.querySelector('#places-map');
  if (!mapElement) return;

  const maplibregl = await import('maplibre-gl');
  await import('maplibre-gl/dist/maplibre-gl.css');

  const defaultCenter = [-98.5, 39.5];
  const basemapStyle = 'https://tiles.openfreemap.org/styles/dark';

  const overlayIds = ['opportunity', 'solar', 'geothermal', 'hydro', 'wind', 'storage', 'hazards', 'grid'];
  let activeFeature = DEMO_SITES.features[0];
  let activeArchetype = ARCHETYPES[0];
  let selectionMarker;
  let drawMode = false;
  let drawPoints = [];
  let evidenceAbort;
  let minCandidateScore = 0;

  const map = new maplibregl.Map({
    container: mapElement,
    style: basemapStyle,
    center: defaultCenter,
    zoom: 3.2,
    attributionControl: false,
    maxPitch: 70,
  });

  map.addControl(new maplibregl.AttributionControl({
    compact: true,
    customAttribution: 'OpenStreetMap · OpenFreeMap',
  }), 'bottom-left');

  const bySelector = (selector) => root.querySelector(selector);
  const allBySelector = (selector) => [...root.querySelectorAll(selector)];
  const number = (value) => Number(value) || 0;
  const compactCurrency = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  });

  function layerPaint(id) {
    if (id === 'hazards') {
      return {
        'heatmap-weight': ['/', ['get', 'hazards'], 100],
        'heatmap-radius': 50,
        'heatmap-intensity': 1.1,
        'heatmap-opacity': 0.54,
        'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(255,123,117,0)', 0.45, 'rgba(255,123,117,.32)', 1, 'rgba(255,123,117,.85)'],
      };
    }
    const property = id === 'opportunity' ? 'overall' : id;
    return {
      'heatmap-weight': ['/', ['get', property], 100],
      'heatmap-radius': id === 'opportunity' ? 72 : 54,
      'heatmap-intensity': id === 'opportunity' ? 1.35 : 1,
      'heatmap-opacity': id === 'opportunity' ? 0.64 : 0.48,
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(67,216,208,0)', 0.35, 'rgba(67,216,208,.24)', 0.68, 'rgba(86,185,164,.52)', 1, 'rgba(244,194,102,.88)'],
    };
  }

  function applyCandidateFilter() {
    allBySelector('[data-candidate]').forEach((button) => {
      const score = Number(button.querySelector('.candidate-score')?.textContent ?? 0);
      button.hidden = score < minCandidateScore;
    });
    const filterPanel = bySelector('[data-candidate-filter]');
    if (filterPanel) filterPanel.hidden = true;
  }

  function renderEvidenceSkeleton() {
    const container = bySelector('[data-live-evidence]');
    if (!container) return;
    container.replaceChildren(...['Solar resource', '7-day forecast', 'PV production', 'Energy price'].map((label) => {
      const article = document.createElement('article');
      article.className = 'evidence-skeleton';
      article.innerHTML = `<span>${label}</span><strong>—</strong><small>Loading…</small>`;
      return article;
    }));
    const healthLabel = bySelector('[data-feed-health]');
    if (healthLabel) healthLabel.textContent = 'Connecting';
    const statusBadge = bySelector('[data-workspace-feed-count]');
    if (statusBadge) statusBadge.innerHTML = '<b>0</b> live feeds';
  }

  function renderEvidence(records, health, energyPrice) {
    const recordByKey = Object.fromEntries(records.map((record) => [record.key, record]));
    if (energyPrice > 0) {
      recordByKey['energy-price'] = {
        key: 'energy-price',
        label: 'Average energy price',
        value: energyPrice,
        unit: '¢/kWh',
        status: 'cached',
        source: 'EIA state example',
      };
    }
    const keys = ['solar-resource', 'forecast-high', 'pv-production', 'energy-price'];
    const container = bySelector('[data-live-evidence]');
    if (!container) return;
    container.replaceChildren(...keys.map((key) => {
      const record = recordByKey[key];
      const article = document.createElement('article');
      const label = document.createElement('span');
      const value = document.createElement('strong');
      const detail = document.createElement('small');
      label.textContent = record?.label ?? key;
      value.textContent = record ? `${record.value}` : 'Unavailable';
      detail.textContent = record ? `${record.unit} · ${record.status} · ${record.source}` : 'No source response';
      article.append(label, value, detail);
      return article;
    }));

    const liveCount = Object.values(health).filter((status) => status === 'live').length;
    const healthLabel = bySelector('[data-feed-health]');
    if (healthLabel) healthLabel.textContent = `${liveCount} of 3 feeds live`;
    const statusBadge = bySelector('[data-workspace-feed-count]');
    if (statusBadge) statusBadge.innerHTML = `<b>${liveCount}</b> live feeds`;
    const time = bySelector('[data-evidence-time]');
    if (time) time.textContent = `Evidence checked · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  async function loadEvidence(feature) {
    evidenceAbort?.abort();
    evidenceAbort = new AbortController();
    const signal = evidenceAbort.signal;
    renderEvidenceSkeleton();
    const [longitude, latitude] = feature.geometry.coordinates;

    try {
      await fetchLocationEvidenceProgressive({
        latitude,
        longitude,
        signal,
        onUpdate: (result) => {
          if (feature !== activeFeature || signal.aborted) return;
          renderEvidence(result.evidence, result.health, number(feature.properties.energyPrice));
        },
      });
    } catch {
      if (feature === activeFeature) {
        const healthLabel = bySelector('[data-feed-health]');
        if (healthLabel) healthLabel.textContent = 'Modeled fallback';
      }
    }
  }

  function fallbackSite(latitude, longitude, label = 'Custom site') {
    const solarLatitudeFactor = Math.max(0, 1 - Math.abs(latitude) / 100);
    const resource = Math.round(52 + solarLatitudeFactor * 34);
    const infrastructure = 58;
    const climate = Math.round(74 - Math.min(26, Math.abs(latitude) * 0.18));
    const policy = latitude >= 24 && latitude <= 50 && longitude >= -125 && longitude <= -66 ? 72 : 55;
    const confidence = 42;
    const scored = scoreSite({ resource, infrastructure, climate, policy, confidence });

    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [longitude, latitude] },
      properties: {
        id: 'custom',
        name: label,
        subtitle: `${latitude.toFixed(4)}, ${longitude.toFixed(4)} · Custom screening point`,
        detail: 'Custom location · live resource check',
        ...scored,
        solar: resource,
        geothermal: 55,
        hydro: 50,
        wind: Math.round(resource * 0.78),
        storage: 70,
        hazards: 50,
        grid: infrastructure,
        energyPrice: 0,
      },
    };
  }

  function updateSitePanel(feature) {
    const properties = feature.properties;
    const score = scoreSite(properties);
    const [longitude, latitude] = feature.geometry.coordinates;
    const setText = (selector, value) => {
      const element = bySelector(selector);
      if (element) element.textContent = value;
    };

    setText('[data-site-name]', properties.name);
    setText('[data-site-subtitle]', properties.subtitle);
    setText('[data-map-site]', properties.name);
    setText('[data-overall-score]', score.overall);
    setText('[data-score-resource]', score.resource);
    setText('[data-score-infrastructure]', score.infrastructure);
    setText('[data-score-climate]', score.climate);
    setText('[data-score-policy]', score.policy);
    setText('[data-coordinates]', `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
    setText('[data-confidence-label]', `${score.confidence >= 75 ? 'High' : score.confidence >= 55 ? 'Medium' : 'Low'} confidence`);

    const calloutCoordinates = bySelector('[data-map-callout] div span');
    if (calloutCoordinates) {
      calloutCoordinates.textContent = `${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? 'N' : 'S'} · ${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? 'E' : 'W'}`;
    }
    const calloutScore = bySelector('[data-map-callout] > b');
    if (calloutScore) calloutScore.textContent = String(score.overall);

    for (const [key, value] of Object.entries({
      resource: score.resource,
      infrastructure: score.infrastructure,
      climate: score.climate,
      policy: score.policy,
    })) {
      const bar = bySelector(`[data-score-${key}]`)?.previousElementSibling?.querySelector('b');
      if (bar) bar.style.setProperty('--value', `${value}%`);
    }

    allBySelector('[data-candidate]').forEach((button) => {
      button.classList.toggle('active', button.dataset.candidate === properties.id);
    });
  }

  function currentTeaInput() {
    const values = { ...activeArchetype.defaults };
    for (const input of allBySelector('[data-tea-input]')) {
      values[input.dataset.teaInput] = number(input.value);
    }
    values.discountRate /= 100;
    return values;
  }

  function renderTea() {
    const result = calculateTea(currentTeaInput());
    const displays = {
      npv: compactCurrency.format(result.npv),
      irr: result.irrPercent === null ? 'No return' : `${result.irrPercent.toFixed(1)}%`,
      payback: result.paybackYears === null ? 'No payback' : `${result.paybackYears.toFixed(1)} yr`,
      lcoe: result.levelizedCostPerMWh === null ? 'N/A' : `$${Math.round(result.levelizedCostPerMWh)}/MWh`,
    };
    for (const [key, value] of Object.entries(displays)) {
      const element = bySelector(`[data-tea-metric="${key}"]`);
      if (element) element.textContent = value;
    }
  }

  function applyArchetype(archetype) {
    activeArchetype = archetype;
    const description = bySelector('[data-archetype-description]');
    if (description) description.textContent = archetype.description;
    for (const input of allBySelector('[data-tea-input]')) {
      const key = input.dataset.teaInput;
      const rawValue = archetype.defaults[key];
      if (rawValue !== undefined) input.value = key === 'discountRate' ? String(rawValue * 100) : String(rawValue);
    }
    renderTea();
  }

  function selectFeature(feature, { fly = false, loadFeeds = true } = {}) {
    activeFeature = feature;
    const [longitude, latitude] = feature.geometry.coordinates;
    updateSitePanel(feature);
    renderTea();

    selectionMarker?.remove();
    selectionMarker = new maplibregl.Marker({ color: '#f4c266', scale: 0.78 })
      .setLngLat([longitude, latitude])
      .addTo(map);

    if (fly) map.flyTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), 7), essential: true });
    if (loadFeeds) loadEvidence(feature);
  }

  function applyLayerVisibility() {
    for (const input of allBySelector('[data-map-layer]')) {
      const layerId = `overlay-${input.value}`;
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', input.checked ? 'visible' : 'none');
      }
    }
  }

  function addMapData() {
    map.addSource('candidate-sites', { type: 'geojson', data: DEMO_SITES });
    for (const id of overlayIds) {
      map.addLayer({
        id: `overlay-${id}`,
        type: 'heatmap',
        source: 'candidate-sites',
        layout: { visibility: ['opportunity', 'solar', 'hazards'].includes(id) ? 'visible' : 'none' },
        paint: layerPaint(id),
      });
    }

    map.addLayer({
      id: 'candidate-rings',
      type: 'circle',
      source: 'candidate-sites',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 5, 7, 9],
        'circle-color': '#f4c266',
        'circle-stroke-color': '#071014',
        'circle-stroke-width': 2,
        'circle-opacity': 0.95,
      },
    });

    map.addSource('drawn-site', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addLayer({ id: 'drawn-site-fill', type: 'fill', source: 'drawn-site', paint: { 'fill-color': '#43d8d0', 'fill-opacity': 0.18 } });
    map.addLayer({ id: 'drawn-site-line', type: 'line', source: 'drawn-site', paint: { 'line-color': '#43d8d0', 'line-width': 2, 'line-dasharray': [2, 1] } });

    applyLayerVisibility();
    selectFeature(activeFeature, { fly: true, loadFeeds: true });
  }

  function updateDrawnSite() {
    const source = map.getSource('drawn-site');
    if (!source) return;
    const closed = drawPoints.length >= 3 ? [...drawPoints, drawPoints[0]] : drawPoints;
    source.setData({
      type: 'FeatureCollection',
      features: drawPoints.length >= 2 ? [{
        type: 'Feature',
        geometry: drawPoints.length >= 3
          ? { type: 'Polygon', coordinates: [closed] }
          : { type: 'LineString', coordinates: drawPoints },
        properties: {},
      }] : [],
    });
  }

  function finishDrawing() {
    const drawButton = bySelector('[data-map-draw]');
    if (drawPoints.length >= 3) {
      const longitude = drawPoints.reduce((total, point) => total + point[0], 0) / drawPoints.length;
      const latitude = drawPoints.reduce((total, point) => total + point[1], 0) / drawPoints.length;
      selectFeature(fallbackSite(latitude, longitude, 'Drawn development area'), { loadFeeds: true });
    } else {
      drawPoints = [];
      updateDrawnSite();
    }
    drawMode = false;
    map.getCanvas().style.cursor = '';
    drawButton?.setAttribute('aria-pressed', 'false');
    drawButton?.classList.remove('active');
  }

  function toggleMobileSheet(target) {
    const panel = bySelector(`[data-mobile-sheet="${target}"]`);
    if (!panel) return;
    const expanded = panel.dataset.expanded === 'true';
    panel.dataset.expanded = String(!expanded);
    const trigger = bySelector(`[data-mobile-toggle="${target}"]`);
    trigger?.setAttribute('aria-expanded', String(!expanded));
  }

  map.on('load', addMapData);
  map.on('zoom', () => {
    const zoom = bySelector('[data-map-zoom]');
    if (zoom) zoom.textContent = `ZOOM ${map.getZoom().toFixed(1)}`;
  });
  map.on('click', (event) => {
    if (drawMode) {
      drawPoints.push([event.lngLat.lng, event.lngLat.lat]);
      updateDrawnSite();
      const time = bySelector('[data-evidence-time]');
      if (time) time.textContent = `${drawPoints.length} vertices · press △ to finish`;
      return;
    }
    const candidates = map.queryRenderedFeatures(event.point, { layers: ['candidate-rings'] });
    if (candidates[0]) {
      const feature = DEMO_SITES.features.find((item) => item.properties.id === candidates[0].properties.id);
      if (feature) selectFeature(feature, { fly: true, loadFeeds: true });
      return;
    }
    selectFeature(fallbackSite(event.lngLat.lat, event.lngLat.lng), { loadFeeds: true });
  });
  map.on('mouseenter', 'candidate-rings', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'candidate-rings', () => { if (!drawMode) map.getCanvas().style.cursor = ''; });

  allBySelector('[data-candidate]').forEach((button) => {
    button.addEventListener('click', () => {
      const feature = DEMO_SITES.features.find((item) => item.properties.id === button.dataset.candidate);
      if (feature) selectFeature(feature, { fly: true, loadFeeds: true });
    });
  });
  allBySelector('[data-map-layer]').forEach((input) => input.addEventListener('change', applyLayerVisibility));
  allBySelector('[data-tea-input]').forEach((input) => input.addEventListener('input', renderTea));

  bySelector('[data-clear-layers]')?.addEventListener('click', () => {
    allBySelector('[data-map-layer]').forEach((input) => { input.checked = false; });
    applyLayerVisibility();
  });
  bySelector('[data-archetype]')?.addEventListener('change', (event) => {
    const selected = ARCHETYPES.find((item) => item.id === event.currentTarget.value) ?? ARCHETYPES[0];
    applyArchetype(selected);
  });
  bySelector('[data-reset-assumptions]')?.addEventListener('click', () => applyArchetype(activeArchetype));
  bySelector('[data-map-zoom-in]')?.addEventListener('click', () => map.zoomIn());
  bySelector('[data-map-zoom-out]')?.addEventListener('click', () => map.zoomOut());
  bySelector('[data-map-reset]')?.addEventListener('click', () => map.flyTo({ center: defaultCenter, zoom: 3.2, essential: true }));
  bySelector('[data-map-draw]')?.addEventListener('click', (event) => {
    if (drawMode) {
      finishDrawing();
      return;
    }
    drawMode = true;
    drawPoints = [];
    updateDrawnSite();
    map.getCanvas().style.cursor = 'crosshair';
    event.currentTarget.setAttribute('aria-pressed', 'true');
    event.currentTarget.classList.add('active');
    const time = bySelector('[data-evidence-time]');
    if (time) time.textContent = 'Draw mode · add at least 3 vertices';
  });

  bySelector('[data-candidate-filter-trigger]')?.addEventListener('click', () => {
    const panel = bySelector('[data-candidate-filter]');
    if (panel) panel.hidden = !panel.hidden;
  });
  bySelector('[data-candidate-filter-apply]')?.addEventListener('click', () => {
    minCandidateScore = number(bySelector('[data-candidate-filter-min]')?.value);
    applyCandidateFilter();
  });

  allBySelector('[data-mobile-toggle]').forEach((button) => {
    button.addEventListener('click', () => toggleMobileSheet(button.dataset.mobileToggle));
  });

  bySelector('[data-location-search]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = new FormData(event.currentTarget).get('location')?.toString().trim();
    if (!query) return;
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    const errorEl = bySelector('[data-search-error]');
    if (errorEl) errorEl.hidden = true;
    if (submit) submit.textContent = 'Searching';

    try {
      const result = await geocodeQuery(query);
      if (!result) {
        if (errorEl) {
          errorEl.textContent = 'No location found. Try coordinates like 39.5296, -119.8138';
          errorEl.hidden = false;
        }
        return;
      }
      selectFeature(fallbackSite(result.latitude, result.longitude, result.label), { fly: true, loadFeeds: true });
    } catch {
      if (errorEl) {
        errorEl.textContent = 'Search failed. Check your connection and try again.';
        errorEl.hidden = false;
      }
    } finally {
      if (submit) submit.textContent = 'Evaluate';
    }
  });

  allBySelector('[data-definition]').forEach((button) => {
    button.addEventListener('click', () => {
      const definition = METRIC_DEFINITIONS[button.dataset.definition];
      const popover = bySelector('[data-definition-popover]');
      if (!definition || !popover) return;
      bySelector('[data-definition-title]').textContent = definition.label;
      bySelector('[data-definition-short]').textContent = definition.short;
      bySelector('[data-definition-detail]').textContent = definition.detail;
      popover.hidden = false;
    });
  });
  bySelector('[data-definition-close]')?.addEventListener('click', () => {
    bySelector('[data-definition-popover]').hidden = true;
  });

  const sourceDrawer = bySelector('[data-source-drawer]');
  function setSourceDrawer(open) {
    sourceDrawer.hidden = !open;
    bySelector('[data-source-trigger]')?.setAttribute('aria-expanded', String(open));
  }
  bySelector('[data-source-trigger]')?.addEventListener('click', () => setSourceDrawer(sourceDrawer.hidden));
  bySelector('[data-source-close]')?.addEventListener('click', () => setSourceDrawer(false));
  bySelector('[data-methodology-trigger]')?.addEventListener('click', () => setSourceDrawer(true));

  applyArchetype(activeArchetype);
  mapElement.dataset.mapStyle = 'loaded';
}
