import fs from 'fs';
fetch('http://localhost:3000/api/analyze-form', { method: 'POST' })
  .then(r => {
    console.log(r.status, r.headers.get('content-type'));
    return r.text();
  })
  .then(console.log).catch(console.error);
