const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'schema.json');
try {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  console.log("=== STAFF_PROFILES PROPERTIES ===");
  console.log(JSON.stringify(schema.definitions.staff_profiles, null, 2));
} catch (e) {
  console.error("Error:", e);
}
