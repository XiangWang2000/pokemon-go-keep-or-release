const fs = require('fs');
const file = process.argv[2];
const d = fs.readFileSync(file, 'utf8');

// script/css references
const refs = [...d.matchAll(/(?:src|href)="([^"]+\.(?:js|css)[^"]*)"/g)].map(x => x[1]);
console.log('JS/CSS refs:');
[...new Set(refs)].forEach(x => console.log(' ', x));

// any .json path references
const jsons = [...d.matchAll(/["'\/]([\w\/\-\.]+\.json)/g)].map(x => x[1]);
console.log('\nJSON path mentions:');
[...new Set(jsons)].slice(0, 30).forEach(x => console.log(' ', x));

// ajax/fetch snippets
const snippets = [...d.matchAll(/(?:\$\.ajax|fetch|getJSON|loadData|rankingsData)[^;]{0,200}/g)];
console.log('\nfetch-like snippets (first 10):');
snippets.slice(0, 10).forEach(x => console.log('  ', x[0].replace(/\s+/g, ' ').slice(0, 180)));
