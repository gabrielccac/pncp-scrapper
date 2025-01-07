const axios = require('axios');

const testFunction = async () => {
  try {
    const response = await axios.post('http://localhost:3000/scrape-and-download', {
      url: 'https://pncp.gov.br/app/editais/23086176000103/2024/51',
    });

    console.log('Response:', response.data);
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
  }
};

testFunction();