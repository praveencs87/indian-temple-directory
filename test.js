import { CheerioCrawler } from 'crawlee';
const crawler = new CheerioCrawler({
    async requestHandler({ $, request }) {
        console.log('Tables:', $('table.wikitable').length);
        $('h2, h3').each((i, el) => console.log($(el).text()));
    }
});
crawler.run(['https://en.wikipedia.org/wiki/List_of_Hindu_temples_in_India']);
