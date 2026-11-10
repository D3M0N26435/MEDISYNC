const OSRM_ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving';

function createElement(tag, className = '', text = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    return element;
}

function formatDistance(meters) {
    if (!Number.isFinite(meters) || meters < 0) return '';
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '';
    const minutes = Math.max(1, Math.round(seconds / 60));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    return remaining ? `${hours} h ${remaining} min` : `${hours} h`;
}

function modifierText(modifier) {
    return ({
        left: 'a la izquierda',
        right: 'a la derecha',
        'slight left': 'ligeramente a la izquierda',
        'slight right': 'ligeramente a la derecha',
        'sharp left': 'pronunciadamente a la izquierda',
        'sharp right': 'pronunciadamente a la derecha',
        straight: 'recto',
        uturn: 'en U'
    })[modifier] || '';
}

function describeStep(step) {
    const type = step?.maneuver?.type || 'continue';
    const modifier = step?.maneuver?.modifier || '';
    const road = step?.name || '';
    if (type === 'depart') return `Sal de ${road || 'tu ubicación'}`;
    if (type === 'arrive') return `Llega a ${road || 'tu destino'}`;
    if (type === 'turn') {
        const direction = modifierText(modifier);
        return `${direction ? `Gira ${direction}` : 'Gira'}${road ? ` hacia ${road}` : ''}`;
    }
    if (type === 'new name' || type === 'continue') return `Continúa${road ? ` por ${road}` : ''}`;
    if (type === 'merge') return `Incorpórate${modifier ? ` ${modifierText(modifier)}` : ''}${road ? ` a ${road}` : ''}`;
    if (type === 'fork') return `Mantente ${modifierText(modifier) || 'recto'}${road ? ` en ${road}` : ''}`;
    if (type === 'end of road') {
        const direction = modifierText(modifier);
        return `Al final de la vía, gira${direction ? ` ${direction}` : ''}${road ? ` hacia ${road}` : ''}`;
    }
    if (type === 'roundabout' || type === 'rotary' || type === 'roundabout turn') return `Toma la rotonda${road ? ` y sal hacia ${road}` : ''}`;
    if (type === 'exit roundabout' || type === 'exit rotary') return `Sal de la rotonda${road ? ` hacia ${road}` : ''}`;
    if (type === 'on ramp') return `Incorpórate a la vía${road ? ` ${road}` : ''}`;
    if (type === 'off ramp') return `Toma la salida${road ? ` hacia ${road}` : ''}`;
    if (type === 'highway') return `Continúa por la autopista${road ? ` ${road}` : ''}`;
    if (type === 'use lane') return `Usa el carril${modifier ? ` ${modifierText(modifier)}` : ''}`;
    return `Continúa${road ? ` por ${road}` : ''}`;
}

function validDestination(destination) {
    const lat = Number(destination?.lat);
    const lng = Number(destination?.lng);
    return Number.isFinite(lat) && lat >= -90 && lat <= 90
        && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

function requestCurrentPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Este navegador no permite obtener tu ubicación.'));
            return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 12000,
            maximumAge: 60000
        });
    });
}

export function attachMapTools({ map, getDestination }) {
    if (!map || !window.L) return null;

    const container = createElement('div', 'map-tools');
    const actions = createElement('div', 'map-tools-actions');
    const locateButton = createElement('button', 'map-tools-button', '📍 Mi ubicación');
    locateButton.type = 'button';
    const routeButton = createElement('button', 'map-tools-button', '🧭 Cómo llegar');
    routeButton.type = 'button';
    actions.append(locateButton, routeButton);
    const info = createElement('div', 'map-tools-info');
    info.setAttribute('role', 'status');
    info.setAttribute('aria-live', 'polite');
    container.append(actions, info);

    // Los controles viven fuera del mapa para no tapar la cartografía.
    map.getContainer().insertAdjacentElement('afterend', container);

    let currentPosition = null;
    let currentMarker = null;
    let accuracyCircle = null;
    let routeLine = null;
    let routeRequestId = 0;

    function setInfo(message, type = 'message') {
        info.replaceChildren(createElement('p', `map-tools-${type}`, message));
    }

    function showRouteSummary(route, destination) {
        info.replaceChildren();
        const summary = createElement('p', 'map-tools-summary');
        const distance = formatDistance(route.distance);
        const duration = formatDuration(route.duration);
        summary.textContent = [distance, duration].filter(Boolean).join(' · ');
        info.append(summary);
        info.append(createElement('p', 'map-tools-message', `Ruta hacia ${destination.name || 'el destino'}`));
        const steps = route.legs?.[0]?.steps || [];
        if (steps.length) {
            const details = createElement('details', 'map-tools-directions');
            details.append(createElement('summary', '', 'Ver indicaciones'));
            const list = createElement('ol', 'map-tools-steps');
            steps.forEach((step) => {
                const item = document.createElement('li');
                item.textContent = describeStep(step);
                const stepDistance = formatDistance(step.distance);
                if (stepDistance) item.append(` · ${stepDistance}`);
                list.append(item);
            });
            details.append(list);
            info.append(details);
        }
    }

    function clearRoute() {
        routeRequestId += 1;
        if (routeLine) {
            map.removeLayer(routeLine);
            routeLine = null;
            setInfo('Pulsa «Cómo llegar» para calcular la ruta al destino seleccionado.');
        }
    }

    async function locate() {
        locateButton.disabled = true;
        locateButton.textContent = '📍 Buscando…';
        setInfo('Obteniendo tu ubicación…');
        try {
            const position = await requestCurrentPosition();
            currentPosition = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
            if (currentMarker) map.removeLayer(currentMarker);
            if (accuracyCircle) map.removeLayer(accuracyCircle);
            currentMarker = L.circleMarker([currentPosition.lat, currentPosition.lng], {
                radius: 8,
                color: '#1d4ed8',
                weight: 3,
                fillColor: '#3b82f6',
                fillOpacity: 1
            }).addTo(map).bindPopup('Tu ubicación actual');
            if (Number.isFinite(position.coords.accuracy) && position.coords.accuracy > 0) {
                accuracyCircle = L.circle([currentPosition.lat, currentPosition.lng], {
                    radius: position.coords.accuracy,
                    color: '#2563eb',
                    weight: 1,
                    fillColor: '#3b82f6',
                    fillOpacity: 0.08
                }).addTo(map);
            }
            map.setView([currentPosition.lat, currentPosition.lng], Math.max(map.getZoom(), 14));
            setInfo('Ubicación encontrada. Pulsa «Cómo llegar» para trazar la ruta al destino seleccionado.');
            return currentPosition;
        } catch (error) {
            console.error(error);
            const message = error?.code === 1
                ? 'No diste permiso para usar tu ubicación. Actívalo en el navegador e inténtalo de nuevo.'
                : 'No se pudo obtener tu ubicación. Revisa tu conexión e inténtalo de nuevo.';
            setInfo(message, 'error');
            return null;
        } finally {
            locateButton.disabled = false;
            locateButton.textContent = '📍 Mi ubicación';
        }
    }

    async function showRoute() {
        const destination = getDestination?.();
        if (!destination || !validDestination(destination)) {
            setInfo('Selecciona un destino en el mapa o en el listado para calcular la ruta.', 'error');
            return;
        }
        if (!currentPosition) {
            const position = await locate();
            if (!position) return;
        }
        clearRoute();
        const requestId = routeRequestId;
        routeButton.disabled = true;
        setInfo('Calculando la ruta…');
        try {
            const url = `${OSRM_ROUTE_URL}/${currentPosition.lng},${currentPosition.lat};`
                + `${Number(destination.lng)},${Number(destination.lat)}`
                + '?overview=full&geometries=geojson&steps=true&alternatives=false';
            const response = await fetch(url);
            if (!response.ok) throw new Error(`OSRM respondió ${response.status}.`);
            const data = await response.json();
            if (requestId !== routeRequestId) return;
            const route = data.routes?.[0];
            if (!route?.geometry?.coordinates?.length) throw new Error('OSRM no devolvió una ruta válida.');
            routeLine = L.polyline(
                route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
                { color: '#0f766e', weight: 6, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }
            ).addTo(map);
            map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
            showRouteSummary(route, destination);
        } catch (error) {
            if (requestId !== routeRequestId) return;
            console.error(error);
            setInfo('No se pudo calcular la ruta. Revisa tu conexión e inténtalo de nuevo.', 'error');
        } finally {
            if (requestId === routeRequestId) routeButton.disabled = false;
        }
    }

    locateButton.addEventListener('click', locate);
    routeButton.addEventListener('click', showRoute);

    return { clearRoute, locate, showRoute };
}
