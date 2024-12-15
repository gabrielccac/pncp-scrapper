const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
    
exports.scrapeAndDownload = async (req, res) => {
    let browser;
    try {
        // Get the URL from the request body
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({
                message: 'URL is required in the request body.',
            });
        }

        console.log(`Navigating to URL: ${url}`);

        // Launch the browser
        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            headless: true, // Keep headless true in production
            ignoreDefaultArgs: ['--disable-extensions'],
        });

        // Create a new page
        const page = await browser.newPage();

        // Navigate to the URL
        await page.goto(url, {
            waitUntil: 'networkidle0',
            timeout: 60000,
        });

        // Click the "Arquivos" button
        const arquivosButtonSelector = 'button[type="button"] span.name';
        await page.waitForSelector(arquivosButtonSelector);
        await page.evaluate((selector) => {
            const button = [...document.querySelectorAll(selector)].find(el => el.textContent.includes('Arquivos'));
            if (button) button.click();
        }, arquivosButtonSelector);

        // Wait for the download link to appear
        const downloadLinkSelector = 'a[aria-label="Fazer download"]';
        await page.waitForSelector(downloadLinkSelector);

        // Extract the download link
        const downloadLink = await page.evaluate((selector) => {
            const linkElement = document.querySelector(selector);
            return linkElement ? linkElement.href : null;
        }, downloadLinkSelector);

        if (!downloadLink) {
            throw new Error('Download link not found');
        }

        // Download the file
        const response = await axios({
            url: downloadLink,
            method: 'GET',
            responseType: 'stream',
        });

        // Extract the file name from the Content-Disposition header
        let originalFileName = 'downloaded_file.pdf'; // Default name in case header is missing
        const contentDisposition = response.headers['content-disposition'];
        if (contentDisposition) {
            const fileNameMatch = contentDisposition.match(/filename="?(.+?)"?$/);
            if (fileNameMatch) {
                originalFileName = fileNameMatch[1];
            }
        }

        // Define the file path with the original file name
        const filePath = path.join(__dirname, originalFileName);
        const writer = fs.createWriteStream(filePath);

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        console.log(`File downloaded successfully: ${originalFileName}`);

        // Extract the required information
        const extractedData = await page.evaluate(() => {
            const getText = (queryText) => {
                const element = [...document.querySelectorAll('p')]
                    .find(p => p.querySelector('strong')?.textContent.includes(queryText))
                    ?.querySelector('span');
                return element ? element.textContent.trim() : null;
            };

            return {
                local: getText('Local'),
                orgao: getText('Órgão'),
                modalidade: getText('Modalidade da contratação'),
                amparoLegal: getText('Amparo legal'),
                tipo: getText('Tipo'),
                modoDisputa: getText('Modo de disputa'),
                registroPreco: getText('Registro de preço'),
                dataInicioPropostas: getText('Data de início de recebimento de propostas'),
                dataFimPropostas: getText('Data fim de recebimento de propostas'),
                idContratacao: getText('Id contratação PNCP'),
                fonte: getText('Fonte'),
                unidadeCompradora: getText('Unidade compradora'),
                objeto: (() => {
                    const element = [...document.querySelectorAll('p')]
                        .find(p => p.querySelector('strong')?.textContent.includes('Objeto'))
                        ?.nextElementSibling?.querySelector('span');
                    return element ? element.textContent.trim() : null;
                })(),
                valorTotalEstimado: (() => {
                    const element = [...document.querySelectorAll('div')]
                        .find(div => div.querySelector('strong')?.textContent.includes('VALOR TOTAL ESTIMADO DA COMPRA'))
                        ?.querySelector('span');
                    return element ? element.textContent.trim() : null;
                })(),
            };
        });

        console.log('Data extracted successfully:', extractedData);

        // Respond with the extracted data and the file
        res.json({
            data: extractedData,
            file: {
                name: originalFileName,
                content: fs.readFileSync(filePath, { encoding: 'base64' }), // Convert file to Base64
            },
        });
    } catch (error) {
        // Handle errors
        console.error('Error processing URL:', error);
        res.status(500).json({
            message: 'Error processing URL',
            error: error.message,
        });
    } finally {
        // Ensure the browser is closed
        if (browser) {
            await browser.close();
        }
    }
};