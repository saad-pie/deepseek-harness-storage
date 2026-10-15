const { execSync } = require('child_process');
const cmd = process.env.COMMAND || '';
let output = '';
try {
  output = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  output = e.stdout ? e.stdout.toString() : e.message;
}
process.stdout.write(JSON.stringify({ output }));