import { armKillSwitch, disarmKillSwitch } from './utils/timeoutManager.js';
import { Actor, log } from 'apify';
import { CheerioCrawler } from 'crawlee';

await Actor.init();

try {
    const input = await Actor.getInput();
    const { states = [], maxTemples = 500 } = input || {};

    log.info(`Starting Indian Temple Directory Scraper via Wikipedia...`);
    if (states.length > 0) {
        log.info(`Filtering by states: ${states.join(', ')}`);
    }

    await Actor.charge({ eventName: 'apify-actor-start', count: 1 });

    let extractedCount = 0;

    const crawler = new CheerioCrawler({
        maxConcurrency: 2,
        async requestHandler({ request, $, enqueueLinks, log }) {
            
            if (request.url === 'https://en.wikipedia.org/wiki/List_of_Hindu_temples_in_India') {
                log.info('Parsing main list to find state-specific temple pages...');
                
                // Enqueue state pages
                await enqueueLinks({
                    selector: 'a[href^="/wiki/List_of_Hindu_temples_in_"]',
                    strategy: 'same-domain'
                });
            } else {
                // We are on a state page
                const stateMatch = request.url.match(/List_of_Hindu_temples_in_(.*)/);
                const currentState = stateMatch ? stateMatch[1].replace(/_/g, ' ') : 'Unknown';

                // Skip if state doesn't match filter
                if (states.length > 0 && !states.some(s => currentState.toLowerCase().includes(s.toLowerCase()))) {
                    return;
                }

                log.info(`Scraping tables for state: ${currentState}`);

                $('table.wikitable').each((i, table) => {
                    if (extractedCount >= maxTemples) return false;

                    $(table).find('tr').each((j, row) => {
                        if (j === 0) return true; // skip header
                        if (extractedCount >= maxTemples) return false;

                        const cols = $(row).find('td, th');
                        if (cols.length >= 3) {
                            const name = $(cols[0]).text().trim();
                            if (!name) return true;

                            const location = $(cols[1]).text().trim();
                            const deity = $(cols[2]).text().trim();
                            const image_url = $(cols).find('img').first().attr('src') || '';
                            
                            // Clean up citation brackets like [1]
                            const cleanName = name.replace(/\[\d+\]/g, '');
                            const cleanLocation = location.replace(/\[\d+\]/g, '');
                            const cleanDeity = deity.replace(/\[\d+\]/g, '');

                            const record = {
                                name: cleanName,
                                deity: cleanDeity,
                                location: cleanLocation,
                                state: currentState,
                                image_url: image_url ? `https:${image_url}` : '',
                                source_url: request.url,
                                scrapedAt: new Date().toISOString()
                            };

                            Actor.pushData(record).catch(() => {});
                            Actor.charge({ eventName: 'temple-extracted', count: 1 }).catch(() => {});
                            extractedCount++;

                            log.info(`🛕 Extracted: ${cleanName} in ${currentState} (${extractedCount}/${maxTemples})`);
                        }
                    });
                });
            }
        },
        async failedRequestHandler({ request, log }) {
            log.warning(`Failed to scrape: ${request.url}`);
        }
    });

    await crawler.addRequests([{ url: 'https://en.wikipedia.org/wiki/List_of_Hindu_temples_in_India' }]);
    armKillSwitch(crawler);
    await crawler.run();
    disarmKillSwitch();

    log.info(`🎉 Done! Extracted ${extractedCount} temples.`);
} catch (error) {
    console.error('CRASH:', error);
    throw error;
} finally {
    await Actor.exit();
}
