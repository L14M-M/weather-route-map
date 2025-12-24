const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the public directory
app.use(express.static('public'));

// API endpoint to get configuration
app.get('/api/config', (req, res) => {
    res.json({
        mapboxApiKey: process.env.MAPBOX_API_KEY,
        googleApiKey: process.env.GOOGLE_API_KEY
    });
});

// Main route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`🗺️  Route Weather Map server running on port ${PORT}`);
    console.log(`📍 Visit: http://localhost:${PORT}`);
});
