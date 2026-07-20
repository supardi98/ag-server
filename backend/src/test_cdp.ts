import CDP from 'chrome-remote-interface';

async function testCDP() {
  try {
    const list = await CDP.List({ port: 9000 });
    console.log(`Found ${list.length} targets:`);
    for (const t of list) {
      console.log(`- Type: ${t.type} | URL: ${t.url} | Title: ${t.title}`);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

testCDP();
