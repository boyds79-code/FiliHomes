const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'schema.json');
try {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const paths = Object.keys(schema.paths || {});
  console.log("=== ALL PATHS ===");
  paths.forEach(p => {
    if (p.includes('rpc')) {
      console.log("RPC:", p);
    } else {
      console.log("Path:", p);
    }
  });
} catch (e) {
  console.error("Error:", e);
}
