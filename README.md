# 🗺️ Route Weather Map

A beautiful web application that combines route planning with weather forecasting. Perfect for planning road trips with real-time weather insights along your route!

![Route Weather Map](https://img.shields.io/badge/status-ready-green) ![Mapbox](https://img.shields.io/badge/maps-Mapbox-blue) ![Open--Meteo](https://img.shields.io/badge/weather-Open--Meteo-orange)

## ✨ Features

- **Interactive Route Planning**: Enter start and destination locations with Google Places autocomplete
- **Weather Visualization**: Colored route segments showing weather conditions along your entire route
- **Time-based Forecasting**: Set your departure time for accurate weather predictions based on actual route duration
- **Comprehensive Weather Types**: Distinguishes between clear, cloudy, fog, drizzle, rain, snow, and thunderstorms
- **Color-coded Segments**: Visual indicators show weather conditions with intensity-based coloring
- **Clickable Route Segments**: Click any segment for detailed temperature, precipitation, wind speed, and time data
- **Auto-location**: Map automatically centers on your current location when you load the page
- **Imperial Units**: All measurements in Fahrenheit, inches, miles, and mph
- **Local Timezone Support**: Weather times displayed in the correct local timezone for each location
### Prerequisites

- Node.js (v14 or higher)
- A Mapbox API key (free tier available)
- A Google Maps API key with Places API enabled (free tier available)

### Installation

1. **Clone or download this repository**

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure your API keys**
   
   Create a `.env` file in the root directory:
   ```bash
   cp .env.example .env
   ```
   
   Then edit `.env` and add your API keys:
   ```
   MAPBOX_API_KEY=pk.your_actual_mapbox_key_here
   GOOGLE_API_KEY=your_actual_google_key_here
   ```

4. **Run locally**
   ```bash
   npm start
   ```
   
   Visit `http://localhost:3000` in your browser

## 🔑 Getting API Keys

1. Go to [mapbox.com](https://www.mapbox.com/)
2. Sign up for a free account
3. Navigate to your Account → Tokens
4. Copy your default public token (starts with `pk.`)

### Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the "Places API (New)"
4. Go to Credentials → Create Credentials → API Key
5. Copy your API key

## 🌐 Deploying to Render

1. Push your code to a GitHub repository
2. Go to [render.com](https://render.com/) and sign up
3. Click **New** → **Web Service**
4. Connect your GitHub repository
5. Configure the service:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
6. Add environment variables:
   - `MAPBOX_API_KEY`: Your Mapbox API key
   - `GOOGLE_API_KEY`: Your Google API key
7. Click **Create Web Service**

Render will automatically deploy and provide you with a live URL!

### Step 3: Configure the App

After deployment, you'll need to update the app to use the environment variable:

1. Modify `public/app.js` to load the API key from the server
2. Or manually update the key in the deployed code
## 📖 How to Use

1. **Allow Location Access** (optional): The map will automatically center on your location
## 📖 How to Use

1. **Allow Location Access** (optional): The map will automatically center on your location
2. **Enter Starting Location**: Type a city, address, or landmark. Autocomplete suggestions will appear as you type
3. **Enter Destination**: Where you want to go, with autocomplete support
4. **Set Departure Time**: Choose when you'll start your journey (defaults to current time)
5. **Click "Get Route & Weather"**: The app will:
   - Calculate your driving route using Mapbox
   - Sample weather points every 5km along the route
   - Fetch weather forecasts for each point with accurate timing
   - Display colored route segments on an interactive map

6. **Explore the Results**:
   - View the colored route segments showing weather conditions
   - Click any segment for detailed weather info (temperature, precipitation, wind, time)
   - Check the route summary in the sidebar (distance, duration, weather breakdown)
   - On mobile, tap the collapsible headers to show/hide sections

## 🎨 Weather Color Legend

- 🟢 **Green** (#4ade80): Clear/Sunny skies
- 🟢 **Light Green** (#86efac): Cloudy conditions
- ⚪ **Gray** (#9ca3af): Fog
- 🔵 **Light Blue** (#60a5fa): Drizzle or light rain
- 🔵 **Blue** (#3b82f6): Rain
- 🔵 **Dark Blue** (#1e40af): Heavy rain
- 🟣 **Light Purple** (#e9d5ff): Light snow
- 🟣 **Purple** (#a855f7): Snow
- 🟣 **Dark Purple** (#9333ea): Heavy snow
- 🔴 **Red** (#ef4444): ThunderstormaScript, HTML5, CSS3
## 🛠️ Technology Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Mapping**: Mapbox GL JS v3.0.1 (routing + geocoding + visualization)
- **Autocomplete**: Google Places API (New) with AutocompleteSuggestion API
- **Weather Data**: Open-Meteo API (free, no API key needed!)
- **Backend**: Node.js + Express + dotenv (serves API keys securely)
- **Hosting**: Render.com (free tier compatible)100,000 route requests/month
- **Google Places API**: $0 for first 100,000 requests/month (Always Free tier)
- **Open-Meteo**: Completely free, 10,000 requests/day, no API key required
- **Render Free Tier**: 750 hours/month (enough for continuous running)

This app is designed to stay within free tiers for personal use!
## 🔧 Configuration

### Adjusting Weather Sample Points
## 🔧 Configuration

### Adjusting Weather Sample Points

In `public/app.js`, modify the sampling interval:
```javascript
const routePoints = sampleRoutePoints(route.geometry.coordinates, 5); // Change 5 to your desired km
```

### Changing Map Style

In `public/app.js`, change the Mapbox style:
```javascript
style: 'mapbox://styles/mapbox/streets-v12', // Try: satellite-v9, dark-v11, light-v11
```

### Customizing Weather Colors

In the `getWeatherColor()` function in `public/app.js`, modify the color codes based on WMO weather codes:
```javascript
if (weatherCode === 0) return '#4ade80'; // Clear - customize the color
```

## 📝 Technical Details

- Weather forecasts available up to 7 days in advance
- Route calculations use driving mode by default
- Weather sampled every 5km along the route
- Time calculations based on actual route duration from Mapbox
- Weather intensity determined by WMO weather codes (not precipitation amounts)
- All weather times displayed in local timezone for each location
- Map automatically centers on user's location with zoom level 10
- Route segments: 8px width with 80% opacity for optimal visibility

## 🎯 Future Enhancement Ideas

- Add favorite locations presets
- Include traffic data integration
- Multiple route options (avoid tolls, highways, etc.)
- Save favorite routes to local storage
- Weather alerts for severe conditions
- Support for walking/cycling routes
- Export route and weather data to PDF
- Gas station or rest stop suggestions along the route
MIT License - Feel free to use and modify for personal or commercial projects!

## 🤝 Contributing

Suggestions and improvements are welcome! Feel free to fork and submit pull requests.

---

Made with ❤️ for planning the perfect road trip!
