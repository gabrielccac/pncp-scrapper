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
            headless: true,
            ignoreDefaultArgs: ['--disable-extensions'],
        });

        // Create a new page
        const page = await browser.newPage();

        // Navigate to the URL
        await page.goto(url, {
            waitUntil: 'networkidle0',
            timeout: 60000,
        });

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
                unidadeCompradora: (() => {
                    const element = [...document.querySelectorAll('p')]
                        .find(p => p.querySelector('strong')?.textContent.includes('Unidade compradora'));
                    const span = element?.querySelectorAll('span')[1]; // Select the second <span>
                    return span ? span.textContent.trim() : null;
                })(),
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

        // Extract all download links
        const downloadLinks = await page.evaluate(() => {
            return [...document.querySelectorAll('a[aria-label="Fazer download"]')]
                .map(link => link.href)
                .filter(href => href)
                .filter(link => {
                    const url = new URL(link);
                    return url.searchParams.get('ignorarExclusao') !== 'false';
                });
        });

        if (downloadLinks.length === 0) {
            throw new Error('No download links found');
        }

        console.log(`Found ${downloadLinks.length} files to download.`);

        // Download all files
        const downloadedFiles = [];
        for (const [index, downloadLink] of downloadLinks.entries()) {
            console.log(`Downloading file ${index + 1} from: ${downloadLink}`);

            const response = await axios({
                url: downloadLink,
                method: 'GET',
                responseType: 'stream',
            });

            // Extract the file name
            let originalFileName = `downloaded_file_${index + 1}.pdf`; // Default name if no header
            const contentDisposition = response.headers['content-disposition'];
            if (contentDisposition) {
                const fileNameMatch = contentDisposition.match(/filename="?(.+?)"?$/);
                if (fileNameMatch) {
                    originalFileName = fileNameMatch[1];
                }
            }

            // Define the file path
            const filePath = path.join(__dirname, originalFileName);
            const writer = fs.createWriteStream(filePath);

            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            console.log(`File downloaded successfully: ${originalFileName}`);
            downloadedFiles.push({
                name: originalFileName,
                path: filePath,
            });
        }

        // Respond with the extracted data and downloaded files
        res.json({
            data: extractedData,
            message: `Successfully downloaded ${downloadedFiles.length} files.`,
            files: downloadedFiles.map(file => ({
                name: file.name,
                content: fs.readFileSync(file.path, { encoding: 'base64' }), // Convert file to Base64
            })),
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
