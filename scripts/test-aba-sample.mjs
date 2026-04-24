// test-isolation-na: read-only CourtListener fetch, no Supabase writes
import fetch from 'node:fetch';

const token = '630618c7a695b509d452eaa39b17ecfc33c4cb5a';
const baseUrl = 'https://www.courtlistener.com/api/rest/v4';

async function fetchSample() {
  try {
    const url = `${baseUrl}/aba-ratings/?format=json&limit=5`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Token ${token}`,
        'User-Agent': 'INAA-Legal-Research/1.0'
      }
    });

    if (!response.ok) {
      console.error(`API error: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error(text);
      return;
    }

    const data = await response.json();
    console.log('Sample ABA ratings response:');
    console.log(JSON.stringify(data, null, 2));

    if (data.results && data.results.length > 0) {
      console.log('\nFirst result structure:');
      console.log(JSON.stringify(data.results[0], null, 2));
    }
  } catch (error) {
    console.error('Fetch error:', error.message);
  }
}

fetchSample();
