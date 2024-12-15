const express = require('express');
const bodyParser = require('body-parser');
const { scrapeAndDownload } = require('./scrapeAndDownload');

const app = express();

// Middleware
app.use(bodyParser.json());

// Route for scraping and downloading
app.post('/scrape-and-download', scrapeAndDownload);

// Health check route
app.get('/', (req, res) => {
    res.send('API is up and running!');
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
