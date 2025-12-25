// Configuration - API keys loaded from server
let MAPBOX_API_KEY = '';
let GOOGLE_API_KEY = '';

// Load configuration from server
async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        MAPBOX_API_KEY = config.mapboxApiKey;
        GOOGLE_API_KEY = config.googleApiKey;
        
        // Initialize map after keys are loaded
        initializeMap();
        
        // Load Google Places API
        loadGooglePlacesAPI();
    } catch (error) {
        console.error('Failed to load configuration:', error);
    }
}

// Call loadConfig on page load
loadConfig();

// Load Google Places API dynamically
function loadGooglePlacesAPI() {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&libraries=places&loading=async&callback=initGooglePlaces`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
}

// Google Places will be initialized when the API loads
let googlePlacesReady = false;

// Callback for when Google Places API loads
window.initGooglePlaces = function() {
    googlePlacesReady = true;
    console.log('Google Places API loaded');
    // Initialize autocomplete after Google is ready
    setupAutocomplete('startLocation', 'startSuggestions');
    setupAutocomplete('endLocation', 'endSuggestions');
    setupAutocomplete('startLocationMobile', 'startSuggestionsMobile');
    setupAutocomplete('endLocationMobile', 'endSuggestionsMobile');
};

// Initialize the map
function initializeMap() {
    mapboxgl.accessToken = MAPBOX_API_KEY;

    // Detect system color scheme preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const mapStyle = prefersDark 
        ? 'mapbox://styles/mapbox/navigation-night-v1' 
        : 'mapbox://styles/mapbox/navigation-day-v1';

    map = new mapboxgl.Map({
        container: 'map',
        style: mapStyle,
        center: [-98.5795, 39.8283], // Center of USA
        zoom: 4
    });

    // Add navigation controls
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    
    // Add fullscreen control (only if supported by browser)
    if (document.documentElement.requestFullscreen) {
        map.addControl(new mapboxgl.FullscreenControl({
            container: document.querySelector('body')
        }), 'top-right');
    }
    
    // Listen for system color scheme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        const newStyle = e.matches 
            ? 'mapbox://styles/mapbox/navigation-night-v1' 
            : 'mapbox://styles/mapbox/navigation-day-v1';
        map.setStyle(newStyle);
    });
    
    // Resize map after initialization to ensure proper sizing
    map.on('load', () => {
        setTimeout(() => {
            map.resize();
        }, 100);
        
        // Restore cached route when map loads
        console.log('Map loaded, attempting restore...');
        restoreRouteFromCache();
    });
    
    // Also restore when map style finishes loading (happens on app resume)
    map.on('styledata', () => {
        // Check if this is a style reload (not initial load) and we have cached data
        const cached = sessionStorage.getItem('cachedRoute');
        if (cached && map.isStyleLoaded()) {
            // Check if route layers are missing
            const hasRoute = map.getSource('route-segment-0');
            if (!hasRoute) {
                console.log('Map style reloaded, route layers missing, restoring...');
                // Wait a bit for style to fully settle
                setTimeout(() => {
                    restoreRouteFromCache();
                }, 300);
            }
        }
    });
    
    // Get user location after map is initialized
    getUserLocation();
}

// State management
let map = null;
let weatherMarkers = [];
let currentRouteAddresses = { start: '', end: '', startCoords: null, endCoords: null };
let isRestoringRoute = false;

// Set default departure time to now (in local timezone)
function setDefaultDepartureTime() {
    const now = new Date();
    const localDateTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    
    const departureInput = document.getElementById('departureTime');
    if (departureInput) {
        departureInput.value = localDateTime;
    }
    
    const departureInputMobile = document.getElementById('departureTimeMobile');
    if (departureInputMobile) {
        departureInputMobile.value = localDateTime;
    }
}

// Autocomplete setup
let autocompleteTimeout = null;
let userLocation = null;

// Try to get user's location for better autocomplete results
function getUserLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                userLocation = {
                    longitude: position.coords.longitude,
                    latitude: position.coords.latitude
                };
                console.log('User location detected:', userLocation);
                
                // Center the map on user's location
                if (map) {
                    map.flyTo({
                        center: [position.coords.longitude, position.coords.latitude],
                        zoom: 10,
                        essential: true
                    });
                }
            },
            (error) => {
                console.log('Location access denied, using default proximity (USA)');
                // Default to center of USA if location denied
                userLocation = { longitude: -98.5795, latitude: 39.8283 };
            }
        );
    } else {
        // Default to center of USA
        userLocation = { longitude: -98.5795, latitude: 39.8283 };
    }
}

function setupAutocomplete(inputId, suggestionsId) {
    if (!googlePlacesReady) {
        console.log('Google Places not ready yet, will retry...');
        return;
    }
    
    const input = document.getElementById(inputId);
    const suggestionsDiv = document.getElementById(suggestionsId);
    
    input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        
        // Clear previous timeout
        if (autocompleteTimeout) {
            clearTimeout(autocompleteTimeout);
        }
        
        // Hide suggestions if query is too short
        if (query.length < 3) {
            suggestionsDiv.classList.remove('active');
            return;
        }
        
        // Debounce API calls
        autocompleteTimeout = setTimeout(async () => {
            try {
                const request = {
                    input: query,
                    includedPrimaryTypes: ['street_address', 'establishment', 'locality', 'postal_code'],
                    language: 'en',
                    region: 'us'
                };
                
                // Add location bias if available (simpler format)
                if (userLocation) {
                    request.locationBias = {
                        lat: userLocation.latitude,
                        lng: userLocation.longitude
                    };
                }
                
                const { suggestions } = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
                
                if (suggestions && suggestions.length > 0) {
                    displaySuggestions(suggestions, suggestionsDiv, input);
                } else {
                    suggestionsDiv.classList.remove('active');
                }
            } catch (error) {
                console.error('Autocomplete error:', error);
                suggestionsDiv.classList.remove('active');
            }
        }, 300);
    });
    
    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !suggestionsDiv.contains(e.target)) {
            suggestionsDiv.classList.remove('active');
        }
    });
}

async function displaySuggestions(suggestions, suggestionsDiv, input) {
    if (!suggestions || suggestions.length === 0) {
        suggestionsDiv.classList.remove('active');
        return;
    }
    
    suggestionsDiv.innerHTML = suggestions.map(suggestion => {
        const mainText = suggestion.placePrediction.text.text;
        const secondaryText = suggestion.placePrediction.structuredFormat?.secondaryText?.text || '';
        
        return `
            <div class="suggestion-item" data-place-id="${suggestion.placePrediction.placeId}">
                <div class="place-name">${mainText}</div>
                <div class="place-address">${secondaryText}</div>
            </div>
        `;
    }).join('');
    
    suggestionsDiv.classList.add('active');
    
    // Add click handlers to suggestions
    suggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', async () => {
            const placeId = item.dataset.placeId;
            
            try {
                // Use new Place API to get details
                const place = new google.maps.places.Place({
                    id: placeId
                });
                
                await place.fetchFields({
                    fields: ['displayName', 'formattedAddress']
                });
                
                // Use the formatted address for routing
                input.value = place.formattedAddress;
                suggestionsDiv.classList.remove('active');
            } catch (error) {
                console.error('Error fetching place details:', error);
                // Fallback to the text from the suggestion
                input.value = item.querySelector('.place-name').textContent + ', ' + item.querySelector('.place-address').textContent;
                suggestionsDiv.classList.remove('active');
            }
        });
    });
}

// Initialize autocomplete for both inputs (will be called when Google API loads)
// setupAutocomplete('startLocation', 'startSuggestions');
// setupAutocomplete('endLocation', 'endSuggestions');

// Form submission handlers
document.getElementById('routeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const startLocation = document.getElementById('startLocation').value;
    const endLocation = document.getElementById('endLocation').value;
    const departureTime = document.getElementById('departureTime').value;
    
    await getRouteWithWeather(startLocation, endLocation, departureTime, false);
});

// Mobile form handler
const mobileForm = document.getElementById('routeFormMobile');
if (mobileForm) {
    mobileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const startLocation = document.getElementById('startLocationMobile').value;
        const endLocation = document.getElementById('endLocationMobile').value;
        const departureTime = document.getElementById('departureTimeMobile').value;
        
        await getRouteWithWeather(startLocation, endLocation, departureTime, true);
    });
}

// Main function to get route and weather
async function getRouteWithWeather(start, end, departureTime, isMobile = false) {
    showLoading(true, isMobile);
    hideError(isMobile);
    hideRouteInfo(isMobile);
    clearMap();
    
    try {
        // Step 1: Geocode locations
        const startCoords = await geocodeLocation(start);
        const endCoords = await geocodeLocation(end);
        
        // Store route addresses for navigation
        currentRouteAddresses = {
            start: start,
            end: end,
            startCoords: startCoords,
            endCoords: endCoords
        };
        
        // Step 2: Get route from Mapbox
        const route = await getRoute(startCoords, endCoords);
        
        // Step 3: Sample points along the route
        const routePoints = sampleRoutePoints(route.geometry.coordinates, 5); // Every 5km
        
        // Step 4: Get weather for each point
        const weatherData = await getWeatherForRoute(routePoints, departureTime, route.duration);
        
        // Step 5: Visualize on map
        displayRouteWithWeather(route, weatherData);
        
        // Step 6: Show route information
        displayRouteInfo(route, weatherData, isMobile);
        
        // Store current route data for saving
        currentRouteData = {
            route,
            distance: `${(route.distance / 1609.34).toFixed(1)} miles`
        };
        
        // Save route to sessionStorage for persistence
        saveRouteToCache({
            route,
            weatherData,
            addresses: currentRouteAddresses,
            departureTime
        });
        
        showLoading(false, isMobile);
        
        // Navigate to results on mobile
        if (isMobile) {
            navigateToResultsSlide();
        }
        
        // Close drawer on mobile after route is calculated
        if (window.innerWidth <= 768) {
            const sidebar = document.querySelector('.sidebar');
            sidebar.classList.add('closed');
        }
    } catch (error) {
        showLoading(false, isMobile);
        showError(error.message, isMobile);
        console.error('Error:', error);
    }
}

// Geocode a location string to coordinates
async function geocodeLocation(location) {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(location)}.json?access_token=${MAPBOX_API_KEY}`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to geocode location');
    
    const data = await response.json();
    if (!data.features || data.features.length === 0) {
        throw new Error(`Could not find location: ${location}`);
    }
    
    return data.features[0].center; // [longitude, latitude]
}

// Get route from Mapbox Directions API
async function getRoute(start, end) {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start[0]},${start[1]};${end[0]},${end[1]}?geometries=geojson&access_token=${MAPBOX_API_KEY}`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to get route');
    
    const data = await response.json();
    if (!data.routes || data.routes.length === 0) {
        throw new Error('No route found');
    }
    
    return data.routes[0];
}

// Sample points along the route at regular intervals
function sampleRoutePoints(coordinates, intervalKm) {
    const points = [];
    const R = 6371; // Earth's radius in km
    
    let accumulatedDistance = 0;
    points.push({
        coords: coordinates[0],
        distance: 0
    });
    
    for (let i = 1; i < coordinates.length; i++) {
        const [lon1, lat1] = coordinates[i - 1];
        const [lon2, lat2] = coordinates[i];
        
        // Haversine formula for distance
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const segmentDistance = R * c;
        
        accumulatedDistance += segmentDistance;
        
        // Add point if we've traveled enough distance
        if (accumulatedDistance >= intervalKm) {
            points.push({
                coords: coordinates[i],
                distance: accumulatedDistance
            });
            accumulatedDistance = 0;
        }
    }
    
    // Always add the last point
    if (coordinates.length > 0) {
        const lastCoord = coordinates[coordinates.length - 1];
        if (points[points.length - 1].coords !== lastCoord) {
            points.push({
                coords: lastCoord,
                distance: points[points.length - 1].distance + accumulatedDistance
            });
        }
    }
    
    return points;
}

// Get weather data from Open-Meteo for route points
async function getWeatherForRoute(routePoints, departureTime, totalDurationSeconds) {
    const departureDate = new Date(departureTime);
    const totalPoints = routePoints.length;
    
    const weatherPromises = routePoints.map(async (point, index) => {
        const [lon, lat] = point.coords;
        
        // Calculate time based on actual route duration and point index
        const progressRatio = index / (totalPoints - 1); // 0 to 1
        const secondsOffset = totalDurationSeconds * progressRatio;
        const pointTime = new Date(departureDate.getTime() + secondsOffset * 1000);
        
        // Format dates for API - need both start and potentially end date if crossing midnight
        const startDate = pointTime.toISOString().split('T')[0];
        const endDate = new Date(pointTime.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Next day
        
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,weathercode,windspeed_10m&timezone=auto&temperature_unit=fahrenheit&precipitation_unit=inch&windspeed_unit=mph&start_date=${startDate}&end_date=${endDate}`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch weather data');
        
        const data = await response.json();
        
        // Find the correct hour index in the returned data
        // Open-Meteo returns hours starting from midnight of start_date
        const dataStartTime = new Date(data.hourly.time[0]);
        const hoursSinceStart = Math.floor((pointTime - dataStartTime) / (1000 * 60 * 60));
        const hourIndex = Math.max(0, Math.min(hoursSinceStart, data.hourly.time.length - 1));
        
        return {
            coords: point.coords,
            temperature: data.hourly.temperature_2m[hourIndex],
            precipitation: data.hourly.precipitation[hourIndex],
            weatherCode: data.hourly.weathercode[hourIndex],
            windSpeed: data.hourly.windspeed_10m[hourIndex],
            time: pointTime
        };
    });
    
    return await Promise.all(weatherPromises);
}

// Helper function to find closest point index in route
function findClosestPointIndex(coords, targetCoord) {
    let minDist = Infinity;
    let closestIdx = 0;
    
    for (let i = 0; i < coords.length; i++) {
        const [lon, lat] = coords[i];
        const [targetLon, targetLat] = targetCoord;
        
        // Simple distance calculation
        const dist = Math.sqrt(
            Math.pow(lon - targetLon, 2) + Math.pow(lat - targetLat, 2)
        );
        
        if (dist < minDist) {
            minDist = dist;
            closestIdx = i;
        }
    }
    
    return closestIdx;
}

// Get color based on weather conditions
function getWeatherColor(weatherCode, precipitation) {
    // WMO Weather codes: https://open-meteo.com/en/docs
    
    // Clear sky (0)
    if (weatherCode === 0) return '#4ade80'; // Green - Clear
    
    // Cloudy (1-3)
    if (weatherCode >= 1 && weatherCode <= 3) return '#86efac'; // Light green - Cloudy
    
    // Fog (45, 48)
    if (weatherCode === 45 || weatherCode === 48) return '#9ca3af'; // Gray - Fog
    
    // Drizzle (51, 53, 55, 56, 57)
    if (weatherCode >= 51 && weatherCode <= 57) return '#60a5fa'; // Light blue - Drizzle
    
    // Rain - using weather codes to determine intensity
    if (weatherCode === 61 || weatherCode === 80) return '#60a5fa'; // Light blue - Light rain
    if (weatherCode === 63 || weatherCode === 81) return '#3b82f6'; // Blue - Rain
    if (weatherCode === 65 || weatherCode === 66 || weatherCode === 67 || weatherCode === 82) return '#1e40af'; // Dark blue - Heavy rain
    
    // Snow - using weather codes to determine intensity
    if (weatherCode === 71 || weatherCode === 85) return '#e9d5ff'; // Light purple - Light snow
    if (weatherCode === 73) return '#a855f7'; // Medium purple - Snow
    if (weatherCode === 75 || weatherCode === 77 || weatherCode === 86) return '#9333ea'; // Dark purple - Heavy snow
    
    // Thunderstorm (95, 96, 99)
    if (weatherCode >= 95) return '#ef4444'; // Red - Thunderstorm
    
    // Default
    return '#6b7280'; // Gray - Unknown

}

// Get weather description
function getWeatherDescription(weatherCode) {
    const descriptions = {
        0: 'Clear sky',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Foggy',
        48: 'Foggy',
        51: 'Light drizzle',
        53: 'Drizzle',
        55: 'Heavy drizzle',
        61: 'Light rain',
        63: 'Rain',
        65: 'Heavy rain',
        71: 'Light snow',
        73: 'Snow',
        75: 'Heavy snow',
        77: 'Snow grains',
        80: 'Light rain showers',
        81: 'Rain showers',
        82: 'Heavy rain showers',
        85: 'Light snow showers',
        86: 'Snow showers',
        95: 'Thunderstorm',
        96: 'Thunderstorm with hail',
        99: 'Severe thunderstorm'
    };
    return descriptions[weatherCode] || 'Unknown';
}

// Display route with weather visualization on map
function displayRouteWithWeather(route, weatherData) {
    // Remove old route layers
    for (let i = 0; i < 100; i++) {
        if (map.getLayer(`route-segment-${i}`)) {
            map.removeLayer(`route-segment-${i}`);
        }
        if (map.getSource(`route-segment-${i}`)) {
            map.removeSource(`route-segment-${i}`);
        }
    }
    
    // Create colored segments based on weather
    const routeCoords = route.geometry.coordinates;
    
    // For each weather point, create a colored segment
    for (let i = 0; i < weatherData.length - 1; i++) {
        const startWeather = weatherData[i];
        const endWeather = weatherData[i + 1];
        
        // Find the indices in route coordinates
        const startCoord = startWeather.coords;
        const endCoord = endWeather.coords;
        
        // Find closest points in the route
        const startIdx = findClosestPointIndex(routeCoords, startCoord);
        const endIdx = findClosestPointIndex(routeCoords, endCoord);
        
        // Get segment coordinates
        const segmentCoords = routeCoords.slice(startIdx, endIdx + 1);
        
        // Use the starting weather for the segment color
        const color = getWeatherColor(startWeather.weatherCode, startWeather.precipitation);
        
        // Calculate midpoint for popup
        const midIdx = Math.floor(segmentCoords.length / 2);
        const midpoint = segmentCoords[midIdx];
        
        // Add segment as a layer
        map.addSource(`route-segment-${i}`, {
            type: 'geojson',
            data: {
                type: 'Feature',
                properties: {
                    weatherCode: startWeather.weatherCode,
                    temperature: startWeather.temperature,
                    precipitation: startWeather.precipitation,
                    windSpeed: startWeather.windSpeed,
                    time: startWeather.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    description: getWeatherDescription(startWeather.weatherCode)
                },
                geometry: {
                    type: 'LineString',
                    coordinates: segmentCoords
                }
            }
        });
        
        map.addLayer({
            id: `route-segment-${i}`,
            type: 'line',
            source: `route-segment-${i}`,
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': color,
                'line-width': 8,
                'line-opacity': 0.8
            }
        });
        
        // Make segment clickable
        map.on('click', `route-segment-${i}`, (e) => {
            const properties = e.features[0].properties;
            
            const popup = new mapboxgl.Popup()
                .setLngLat(e.lngLat)
                .setHTML(`
                    <div style="padding: 8px;">
                        <strong>${properties.description}</strong><br>
                        🌡️ ${Math.round(properties.temperature)}°F<br>
                        🌧️ ${parseFloat(properties.precipitation).toFixed(2)}"<br>
                        💨 ${Math.round(properties.windSpeed)} mph<br>
                        🕐 ${properties.time}
                    </div>
                `)
                .addTo(map);
            
            // Fix accessibility warning by removing aria-hidden from close button
            popup.on('open', () => {
                const closeButton = document.querySelector('.mapboxgl-popup-close-button');
                if (closeButton) {
                    closeButton.removeAttribute('aria-hidden');
                }
            });
        });
        
        // Change cursor on hover
        map.on('mouseenter', `route-segment-${i}`, () => {
            map.getCanvas().style.cursor = 'pointer';
        });
        
        map.on('mouseleave', `route-segment-${i}`, () => {
            map.getCanvas().style.cursor = '';
        });
    }
    
    // Remove the marker code - segments are now clickable instead
    /*
    */
    
    // Fit map to route
    const coordinates = route.geometry.coordinates;
    const bounds = coordinates.reduce((bounds, coord) => {
        return bounds.extend(coord);
    }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));
    
    map.fitBounds(bounds, { padding: 100 });
}

// Display route information in sidebar
function displayRouteInfo(route, weatherData, isMobile = false) {
    const distanceMiles = (route.distance / 1609.34).toFixed(1);
    const durationMin = Math.round(route.duration / 60);
    const hours = Math.floor(durationMin / 60);
    const minutes = durationMin % 60;
    
    const distanceText = `${distanceMiles} mi`;
    const durationText = hours > 0 
        ? `${hours}h ${minutes}m` 
        : `${minutes}m`;
    
    // Weather summary - smart display
    const totalDistance = route.distance / 1609.34; // Convert to miles
    const badWeatherCodes = [45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];
    
    // Check if all weather is good (clear or cloudy only)
    const allGood = weatherData.every(w => w.weatherCode <= 3);
    
    let summaryHTML = '';
    
    if (allGood) {
        summaryHTML = '<div style="color: #4ade80; font-weight: 500;">✓ Good conditions throughout route</div>';
    } else {
        // Categorize weather types
        const getWeatherCategory = (code) => {
            if (code >= 95) return 'Thunderstorm';
            if (code >= 85 || (code >= 71 && code <= 77)) {
                // Heavy snow codes: 75, 77, 86
                if (code === 75 || code === 77 || code === 86) return 'Heavy snow';
                return 'Snow';
            }
            if (code >= 61 || (code >= 51 && code <= 57) || (code >= 80 && code <= 82)) {
                // Heavy rain codes: 65, 67, 82
                if (code === 65 || code === 67 || code === 82) return 'Heavy rain';
                return 'Rain';
            }
            if (code === 45 || code === 48) return 'Fog';
            return null;
        };
        
        // Find bad weather segments and merge same categories
        const alerts = [];
        let currentBadWeather = null;
        
        weatherData.forEach((w, index) => {
            const category = getWeatherCategory(w.weatherCode);
            const isBad = category !== null;
            const distanceAtPoint = (index / (weatherData.length - 1)) * totalDistance;
            
            if (isBad && !currentBadWeather) {
                // Start of bad weather segment
                currentBadWeather = {
                    condition: category,
                    startMile: distanceAtPoint,
                    startTime: w.time
                };
            } else if (!isBad && currentBadWeather) {
                // End of bad weather segment
                currentBadWeather.endMile = distanceAtPoint;
                currentBadWeather.endTime = weatherData[index - 1].time;
                alerts.push(currentBadWeather);
                currentBadWeather = null;
            } else if (isBad && currentBadWeather && category !== currentBadWeather.condition) {
                // Weather category changed
                currentBadWeather.endMile = distanceAtPoint;
                currentBadWeather.endTime = weatherData[index - 1].time;
                alerts.push(currentBadWeather);
                currentBadWeather = {
                    condition: category,
                    startMile: distanceAtPoint,
                    startTime: w.time
                };
            }
        });
        
        // Close final segment if needed
        if (currentBadWeather) {
            currentBadWeather.endMile = totalDistance;
            currentBadWeather.endTime = weatherData[weatherData.length - 1].time;
            alerts.push(currentBadWeather);
        }
        
        // Format alerts
        if (alerts.length === 0) {
            summaryHTML = '<div style="color: #4ade80; font-weight: 500;">✓ Good conditions throughout route</div>';
        } else {
            summaryHTML = alerts.map(alert => {
                const startMile = alert.startMile.toFixed(0);
                const endMile = alert.endMile.toFixed(0);
                const startTime = alert.startTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                const endTime = alert.endTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                
                // Choose emoji based on condition
                let emoji = '⚠️';
                if (alert.condition.toLowerCase().includes('rain')) {
                    emoji = '🌧️';
                } else if (alert.condition.toLowerCase().includes('snow')) {
                    emoji = '❄️';
                } else if (alert.condition.toLowerCase().includes('fog')) {
                    emoji = '🌫️';
                } else if (alert.condition.toLowerCase().includes('thunder')) {
                    emoji = '⛈️';
                }
                
                return `<div style="margin: 4px 0;">${emoji} ${alert.condition} from mile ${startMile} (${startTime}) to mile ${endMile} (${endTime})</div>`;
            }).join('');
        }
    }
    
    // Update desktop route info
    const distance = document.getElementById('distance');
    const duration = document.getElementById('duration');
    const weatherModalContent = document.getElementById('weatherModalContent');
    const routeInfo = document.getElementById('routeInfo');
    const navigateSection = document.getElementById('navigateSection');
    const saveRouteBtn = document.getElementById('saveRouteBtn');
    const clearRouteBtn = document.getElementById('clearRouteBtn');
    
    if (distance) distance.textContent = distanceText;
    if (duration) duration.textContent = durationText;
    if (weatherModalContent) weatherModalContent.innerHTML = summaryHTML;
    if (routeInfo) routeInfo.classList.remove('hidden');
    if (navigateSection) navigateSection.classList.remove('hidden');
    if (saveRouteBtn) saveRouteBtn.classList.remove('hidden');
    if (clearRouteBtn) clearRouteBtn.classList.remove('hidden');
    
    // Update mobile route info (shares same weather modal)
    const distanceMobile = document.getElementById('distanceMobile');
    const durationMobile = document.getElementById('durationMobile');
    const routeInfoMobile = document.getElementById('routeInfoMobile');
    const navigateSectionMobile = document.getElementById('navigateSectionMobile');
    const saveRouteBtnMobile = document.getElementById('saveRouteBtnMobile');
    const clearRouteBtnMobile = document.getElementById('clearRouteBtnMobile');
    
    if (distanceMobile) distanceMobile.textContent = distanceText;
    if (durationMobile) durationMobile.textContent = durationText;
    if (routeInfoMobile) routeInfoMobile.classList.remove('hidden');
    if (navigateSectionMobile) navigateSectionMobile.classList.remove('hidden');
    if (saveRouteBtnMobile) saveRouteBtnMobile.classList.remove('hidden');
    if (clearRouteBtnMobile) clearRouteBtnMobile.classList.remove('hidden');
}

// Clear map of route and markers
function clearMap() {
    weatherMarkers.forEach(marker => marker.remove());
    weatherMarkers = [];
    
    // Remove old route segments
    for (let i = 0; i < 100; i++) {
        if (map.getLayer(`route-segment-${i}`)) {
            map.removeLayer(`route-segment-${i}`);
        }
        if (map.getSource(`route-segment-${i}`)) {
            map.removeSource(`route-segment-${i}`);
        }
    }
    
    // Remove old single route layer (legacy)
    if (map.getLayer('route')) {
        map.removeLayer('route');
    }
    if (map.getSource('route')) {
        map.removeSource('route');
    }
}

// UI helper functions
function showLoading(show, isMobile = false) {
    const loadingId = isMobile ? 'loadingMobile' : 'loading';
    const btnId = isMobile ? 'submitBtnMobile' : 'submitBtn';
    
    const loadingEl = document.getElementById(loadingId);
    const btnEl = document.getElementById(btnId);
    
    if (loadingEl) loadingEl.classList.toggle('hidden', !show);
    if (btnEl) btnEl.disabled = show;
}

function showError(message, isMobile = false) {
    const errorId = isMobile ? 'errorMobile' : 'error';
    const errorDiv = document.getElementById(errorId);
    
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
    }
}

function hideError(isMobile = false) {
    const errorId = isMobile ? 'errorMobile' : 'error';
    const errorDiv = document.getElementById(errorId);
    
    if (errorDiv) errorDiv.classList.add('hidden');
}

function hideRouteInfo(isMobile = false) {
    const routeInfoId = isMobile ? 'routeInfoMobile' : 'routeInfo';
    const navigateSectionId = isMobile ? 'navigateSectionMobile' : 'navigateSection';
    
    const routeInfo = document.getElementById(routeInfoId);
    const navigateSection = document.getElementById(navigateSectionId);
    
    if (routeInfo) routeInfo.classList.add('hidden');
    if (navigateSection) navigateSection.classList.add('hidden');
}


// Toggle collapsible sections (mobile only)
function toggleSection(contentId) {
    // Only work on mobile
    if (window.innerWidth > 768) return;
    
    const content = document.getElementById(contentId);
    const header = content.previousElementSibling;
    
    if (header.classList.contains('collapsed')) {
        // Open
        header.classList.remove('collapsed');
        content.style.maxHeight = content.scrollHeight + 'px';
    } else {
        // Close
        header.classList.add('collapsed');
        content.style.maxHeight = '0';
    }
}

// Initialize collapsible sections on page load
window.addEventListener('DOMContentLoaded', () => {
    setDefaultDepartureTime();
    
    if (window.innerWidth <= 768) {
        // Start with sections collapsed on mobile
        const sections = ['routeInfoContent', 'legendContent'];
        sections.forEach(id => {
            const content = document.getElementById(id);
            if (content) {
                const header = content.previousElementSibling;
                header.classList.add('collapsed');
                content.style.maxHeight = '0';
            }
        });
    }
});

// Reset collapse state when window is resized
window.addEventListener('resize', () => {
    const sections = ['routeInfoContent', 'legendContent'];
    sections.forEach(id => {
        const content = document.getElementById(id);
        if (!content) return; // Skip if element doesn't exist
        
        const header = content.previousElementSibling;
        if (!header) return; // Skip if no header found
        
        if (window.innerWidth > 768) {
            // Desktop: remove collapsed state and clear inline styles
            header.classList.remove('collapsed');
            content.style.maxHeight = '';
        } else if (!header.classList.contains('collapsed')) {
            // Mobile and currently open: set max-height
            content.style.maxHeight = content.scrollHeight + 'px';
        }
    });
});

// Toggle drawer for mobile
function toggleDrawer() {
    if (window.innerWidth <= 768) {
        const sidebar = document.querySelector('.sidebar');
        sidebar.classList.toggle('closed');
    }
}

// Swipe gesture support for drawer
let touchStartY = 0;
let touchEndY = 0;
let isDragging = false;

function initDrawerSwipe() {
    const sidebar = document.querySelector('.sidebar');
    const sidebarHeader = document.querySelector('.sidebar-header');
    
    if (!sidebar || !sidebarHeader) return;
    
    // Only enable on mobile
    if (window.innerWidth > 768) return;
    
    sidebarHeader.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
        isDragging = true;
        sidebar.style.transition = 'none';
    }, { passive: true });
    
    sidebarHeader.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        
        touchEndY = e.touches[0].clientY;
        const deltaY = touchEndY - touchStartY;
        
        const isClosed = sidebar.classList.contains('closed');
        
        if (!isClosed) {
            // When open (at translateY(0)), allow dragging down
            if (deltaY > 0) {
                sidebar.style.transform = `translateY(${deltaY}px)`;
            }
        } else {
            // When closed (at translateY(calc(100% - 100px))), allow dragging up
            if (deltaY < 0) {
                // Start from closed position and move up as user drags
                const sidebarHeight = sidebar.offsetHeight;
                const closedOffset = sidebarHeight - 100; // The "100% - 100px" in pixels
                const dragAmount = Math.abs(deltaY);
                const newOffset = Math.max(0, closedOffset - dragAmount);
                sidebar.style.transform = `translateY(${newOffset}px)`;
            }
        }
    }, { passive: true });
    
    const handleTouchEnd = () => {
        if (!isDragging) return;
        
        isDragging = false;
        sidebar.style.transition = '';
        sidebar.style.transform = '';
        
        const swipeDistance = Math.abs(touchEndY - touchStartY);
        const deltaY = touchEndY - touchStartY;
        const threshold = 50; // Minimum swipe distance in pixels
        
        const isClosed = sidebar.classList.contains('closed');
        
        if (deltaY < 0 && isClosed && swipeDistance > threshold) {
            // Swipe up when closed - open drawer
            sidebar.classList.remove('closed');
        } else if (deltaY > 0 && !isClosed && swipeDistance > threshold) {
            // Swipe down when open - close drawer
            sidebar.classList.add('closed');
        }
        
        // Reset
        touchStartY = 0;
        touchEndY = 0;
    };
    
    sidebarHeader.addEventListener('touchend', handleTouchEnd, { passive: true });
    sidebarHeader.addEventListener('touchcancel', handleTouchEnd, { passive: true });
}

// Initialize drawer swipe on load
if (window.innerWidth <= 768) {
    initDrawerSwipe();
}

// Re-initialize on resize
window.addEventListener('resize', () => {
    if (window.innerWidth <= 768) {
        initDrawerSwipe();
    }
});

// Toggle legend modal
function toggleLegendModal() {
    const modal = document.getElementById('legendModal');
    modal.classList.toggle('hidden');
}

// Toggle weather modal
function toggleWeatherModal() {
    const modal = document.getElementById('weatherModal');
    modal.classList.toggle('hidden');
}

// Toggle navigate menu
function toggleNavigateMenu() {
    const menu = document.getElementById('navigateMenu');
    const menuMobile = document.getElementById('navigateMenuMobile');
    
    if (menu) menu.classList.toggle('hidden');
    if (menuMobile) menuMobile.classList.toggle('hidden');
}

// Open route in Apple Maps
function openInAppleMaps() {
    const { start, end } = currentRouteAddresses;
    const url = `https://maps.apple.com/?saddr=${encodeURIComponent(start)}&daddr=${encodeURIComponent(end)}`;
    window.open(url, '_blank');
}

// Open route in Waze
function openInWaze() {
    const { endCoords } = currentRouteAddresses;
    const url = `https://waze.com/ul?ll=${endCoords[1]},${endCoords[0]}&navigate=yes`;
    window.open(url, '_blank');
}

// Open route in Google Maps
function openInGoogleMaps() {
    const { start, end } = currentRouteAddresses;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(start)}&destination=${encodeURIComponent(end)}`;
    window.open(url, '_blank');
}

// Clear input field
function clearInput(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
        input.value = '';
        input.focus();
        // Trigger input event to hide autocomplete if open
        input.dispatchEvent(new Event('input'));
    }
}

// Save route to sessionStorage
function saveRouteToCache(data) {
    try {
        sessionStorage.setItem('cachedRoute', JSON.stringify(data));
    } catch (e) {
        console.error('Failed to cache route:', e);
    }
}

// Restore route from sessionStorage
function restoreRouteFromCache() {
    // Prevent multiple simultaneous restore attempts
    if (isRestoringRoute) {
        console.log('Restore already in progress, skipping...');
        return;
    }
    
    try {
        const cached = sessionStorage.getItem('cachedRoute');
        if (!cached) {
            console.log('No cached route found');
            return;
        }
        
        // Check if map is ready
        if (!map) {
            console.log('Map not initialized, cannot restore');
            return;
        }
        
        // Check if route is already displayed
        if (map.getSource('route-segment-0')) {
            console.log('Route already displayed, skipping restore');
            return;
        }
        
        if (!map.loaded() || !map.isStyleLoaded()) {
            console.log('Map not ready, will retry...');
            setTimeout(restoreRouteFromCache, 300);
            return;
        }
        
        isRestoringRoute = true;
        console.log('Starting route restoration...');
        
        const { route, weatherData, addresses, departureTime } = JSON.parse(cached);
        
        // Convert time strings back to Date objects
        weatherData.forEach(w => {
            w.time = new Date(w.time);
        });
        
        // Restore addresses
        currentRouteAddresses = addresses;
        
        // Restore form values
        const startInput = document.getElementById('startLocation');
        const endInput = document.getElementById('endLocation');
        const departureInput = document.getElementById('departureTime');
        const startInputMobile = document.getElementById('startLocationMobile');
        const endInputMobile = document.getElementById('endLocationMobile');
        const departureInputMobile = document.getElementById('departureTimeMobile');
        
        if (startInput) startInput.value = addresses.start;
        if (endInput) endInput.value = addresses.end;
        if (departureInput) departureInput.value = departureTime;
        if (startInputMobile) startInputMobile.value = addresses.start;
        if (endInputMobile) endInputMobile.value = addresses.end;
        if (departureInputMobile) departureInputMobile.value = departureTime;
        
        // Clear existing route layers first
        try {
            clearMap();
        } catch (e) {
            console.warn('Error clearing map:', e);
        }
        
        // Wait a frame for map to be ready
        requestAnimationFrame(() => {
            try {
                // Restore map and UI
                displayRouteWithWeather(route, weatherData);
                displayRouteInfo(route, weatherData, false);
                
                // Set currentRouteData for saving functionality
                currentRouteData = {
                    route,
                    distance: `${(route.distance / 1609.34).toFixed(1)} miles`
                };
                
                console.log('✓ Route successfully restored from cache');
            } catch (e) {
                console.error('Error displaying route:', e);
            } finally {
                isRestoringRoute = false;
            }
        });
        
    } catch (e) {
        console.error('Failed to restore route:', e);
        sessionStorage.removeItem('cachedRoute');
        isRestoringRoute = false;
    }
}

// Listen for page visibility changes to restore route
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && map) {
        // Page became visible - wait a bit for map to be ready, then restore
        setTimeout(() => {
            restoreRouteFromCache();
        }, 100);
    }
});

// Restore route on initial page load
window.addEventListener('load', () => {
    // Check if there's a cached route and close drawer if so
    if (window.innerWidth <= 768) {
        const cached = sessionStorage.getItem('cachedRoute');
        const sidebar = document.querySelector('.sidebar');
        
        if (cached && sidebar) {
            // There's a cached route, start with drawer closed
            sidebar.classList.add('closed');
        }
        // If no cached route, drawer stays open (default state)
    }
    
    // Wait for map to be fully initialized
    const checkMapReady = setInterval(() => {
        if (map && map.loaded()) {
            clearInterval(checkMapReady);
            restoreRouteFromCache();
        }
    }, 100);
});

// Clear route, cache, and inputs
function clearRoute() {
    // Clear sessionStorage
    sessionStorage.removeItem('cachedRoute');
    
    // Clear all inputs
    const inputs = [
        'startLocation',
        'endLocation',
        'departureTime',
        'startLocationMobile',
        'endLocationMobile',
        'departureTimeMobile'
    ];
    
    inputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = '';
    });
    
    // Clear map
    clearMap();
    
    // Hide route info and navigation sections
    const routeInfo = document.getElementById('routeInfo');
    const routeInfoMobile = document.getElementById('routeInfoMobile');
    const navigateSection = document.getElementById('navigateSection');
    const navigateSectionMobile = document.getElementById('navigateSectionMobile');
    const saveRouteBtn = document.getElementById('saveRouteBtn');
    const saveRouteBtnMobile = document.getElementById('saveRouteBtnMobile');
    const clearRouteBtn = document.getElementById('clearRouteBtn');
    const clearRouteBtnMobile = document.getElementById('clearRouteBtnMobile');
    
    if (routeInfo) routeInfo.classList.add('hidden');
    if (routeInfoMobile) routeInfoMobile.classList.add('hidden');
    if (navigateSection) navigateSection.classList.add('hidden');
    if (navigateSectionMobile) navigateSectionMobile.classList.add('hidden');
    if (saveRouteBtn) saveRouteBtn.classList.add('hidden');
    if (saveRouteBtnMobile) saveRouteBtnMobile.classList.add('hidden');
    if (clearRouteBtn) clearRouteBtn.classList.add('hidden');
    if (clearRouteBtnMobile) clearRouteBtnMobile.classList.add('hidden');
    
    // Clear addresses
    currentRouteAddresses = null;
    
    console.log('Route cleared');
}

// Toggle map menu
function toggleMapMenu() {
    const mapMenu = document.getElementById('mapMenu');
    if (mapMenu) {
        mapMenu.classList.toggle('hidden');
    }
}

// Saved Routes Management
let currentRouteData = null; // Store current route for saving
let inputModalCallback = null; // Callback for input modal

// Custom input modal functions
function showInputModal(title, placeholder, defaultValue, callback) {
    const modal = document.getElementById('inputModal');
    const titleEl = document.getElementById('inputModalTitle');
    const inputField = document.getElementById('inputModalField');
    
    titleEl.textContent = title;
    inputField.placeholder = placeholder;
    inputField.value = defaultValue || '';
    inputModalCallback = callback;
    
    modal.classList.remove('hidden');
    inputField.focus();
    inputField.select();
}

function closeInputModal() {
    const modal = document.getElementById('inputModal');
    const inputField = document.getElementById('inputModalField');
    
    modal.classList.add('hidden');
    inputField.value = '';
    inputModalCallback = null;
}

function confirmInputModal() {
    const inputField = document.getElementById('inputModalField');
    const value = inputField.value.trim();
    
    if (value && inputModalCallback) {
        inputModalCallback(value);
    }
    
    closeInputModal();
}

// Handle Enter key in input modal
document.addEventListener('DOMContentLoaded', () => {
    const inputField = document.getElementById('inputModalField');
    if (inputField) {
        inputField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                confirmInputModal();
            }
        });
    }
});

// Save current route to localStorage
function saveCurrentRoute() {
    if (!currentRouteAddresses || !currentRouteData) {
        alert('No route to save!');
        return;
    }
    
    const defaultName = `${currentRouteAddresses.start} → ${currentRouteAddresses.end}`;
    
    showInputModal(
        'Save Route',
        'Enter a name for this route',
        defaultName,
        (routeName) => {
            const savedRoute = {
                id: Date.now(),
                name: routeName,
                startAddress: currentRouteAddresses.start,
                endAddress: currentRouteAddresses.end,
                distance: currentRouteData.distance,
                route: currentRouteData.route
            };
            
            const savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
            savedRoutes.push(savedRoute);
            localStorage.setItem('savedRoutes', JSON.stringify(savedRoutes));
            
            // Show success feedback
            const saveBtn = document.getElementById('saveRouteBtn');
            const saveBtnMobile = document.getElementById('saveRouteBtnMobile');
            const originalText = saveBtn?.textContent;
            
            if (saveBtn) saveBtn.textContent = '✓ Saved!';
            if (saveBtnMobile) saveBtnMobile.textContent = '✓ Saved!';
            
            setTimeout(() => {
                if (saveBtn) saveBtn.textContent = originalText;
                if (saveBtnMobile) saveBtnMobile.textContent = originalText;
            }, 2000);
        }
    );
}

// Load a saved route
async function loadSavedRoute(routeId) {
    const savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
    const route = savedRoutes.find(r => r.id === routeId);
    
    if (!route) {
        alert('Route not found!');
        return;
    }
    
    // Close the modal
    toggleSavedRoutesModal();
    
    // Set the form inputs
    const startInput = document.getElementById('startLocation');
    const endInput = document.getElementById('endLocation');
    const startInputMobile = document.getElementById('startLocationMobile');
    const endInputMobile = document.getElementById('endLocationMobile');
    
    if (startInput) startInput.value = route.startAddress;
    if (endInput) endInput.value = route.endAddress;
    if (startInputMobile) startInputMobile.value = route.startAddress;
    if (endInputMobile) endInputMobile.value = route.endAddress;
    
    // Set departure time to now
    const now = new Date();
    const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const departureInput = document.getElementById('departureTime');
    const departureInputMobile = document.getElementById('departureTimeMobile');
    if (departureInput) departureInput.value = localDateTime;
    if (departureInputMobile) departureInputMobile.value = localDateTime;
    
    // Trigger route calculation
    document.getElementById('routeForm').dispatchEvent(new Event('submit'));
}

// Delete a saved route
function deleteSavedRoute(routeId) {
    if (!confirm('Are you sure you want to delete this route?')) return;
    
    const savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
    const filteredRoutes = savedRoutes.filter(r => r.id !== routeId);
    localStorage.setItem('savedRoutes', JSON.stringify(filteredRoutes));
    
    // Refresh the modal
    displaySavedRoutes();
}

// Display saved routes in modal
function displaySavedRoutes() {
    const savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
    const content = document.getElementById('savedRoutesContent');
    
    if (savedRoutes.length === 0) {
        content.innerHTML = '<p style="color: #9ca3af; text-align: center; padding: 20px;">No saved routes yet. Save a route to see it here!</p>';
        return;
    }
    
    content.innerHTML = savedRoutes.map(route => `
        <div class="saved-route-item">
            <div class="saved-route-info">
                <div class="saved-route-name">${route.name}</div>
                <div class="saved-route-details">
                    <span>${route.startAddress}</span>
                    <span style="color: #9ca3af; margin: 0 8px;">→</span>
                    <span>${route.endAddress}</span>
                </div>
                <div class="saved-route-distance">${route.distance}</div>
            </div>
            <div class="saved-route-actions">
                <button class="saved-route-btn load-btn" onclick="loadSavedRoute(${route.id})">Load</button>
                <button class="saved-route-btn delete-btn" onclick="deleteSavedRoute(${route.id})">Delete</button>
            </div>
        </div>
    `).join('');
}

// Toggle saved routes modal
function toggleSavedRoutesModal() {
    const modal = document.getElementById('savedRoutesModal');
    if (modal) {
        const isHidden = modal.classList.toggle('hidden');
        if (!isHidden) {
            displaySavedRoutes();
        }
    }
}

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    const legendModal = document.getElementById('legendModal');
    const weatherModal = document.getElementById('weatherModal');
    const savedRoutesModal = document.getElementById('savedRoutesModal');
    const inputModal = document.getElementById('inputModal');
    const mapMenu = document.getElementById('mapMenu');
    const menuButton = document.getElementById('menuButton');
    
    if (e.target === legendModal) {
        legendModal.classList.add('hidden');
    }
    
    if (e.target === weatherModal) {
        weatherModal.classList.add('hidden');
    }
    
    if (e.target === savedRoutesModal) {
        savedRoutesModal.classList.add('hidden');
    }
    
    if (e.target === inputModal) {
        closeInputModal();
    }
    
    // Close map menu when clicking outside
    if (mapMenu && !mapMenu.contains(e.target) && !menuButton.contains(e.target)) {
        mapMenu.classList.add('hidden');
    }
});

// Mobile carousel functionality
let currentSlide = 0;
const carouselContainer = document.querySelector('.mobile-carousel-container');
const carouselDots = document.querySelectorAll('.carousel-dot');

if (carouselContainer && carouselDots.length > 0) {
    // Handle scroll snap and update dots
    carouselContainer.addEventListener('scroll', () => {
        const slideWidth = carouselContainer.offsetWidth;
        const scrollLeft = carouselContainer.scrollLeft;
        const newSlide = Math.round(scrollLeft / slideWidth);
        
        if (newSlide !== currentSlide) {
            currentSlide = newSlide;
            updateCarouselDots();
        }
    });
    
    // Handle dot clicks
    carouselDots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            const slideWidth = carouselContainer.offsetWidth;
            carouselContainer.scrollTo({
                left: slideWidth * index,
                behavior: 'smooth'
            });
            currentSlide = index;
            updateCarouselDots();
        });
    });
    
    function updateCarouselDots() {
        carouselDots.forEach((dot, index) => {
            if (index === currentSlide) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
            }
        });
    }
}

// Navigate to results slide after calculation
function navigateToResultsSlide() {
    if (window.innerWidth <= 768 && carouselContainer) {
        const slideWidth = carouselContainer.offsetWidth;
        carouselContainer.scrollTo({
            left: slideWidth * 1,
            behavior: 'smooth'
        });
        currentSlide = 1;
        updateCarouselDots();
    }
}
