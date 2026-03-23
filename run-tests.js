const { execSync } = require('child_process');
process.env.LOG_LEVEL = 'silent';
try {
  const r = execSync('npx jest --no-coverage 2>&1', { encoding: 'utf8', maxBuffer: 50*1024*1024, cwd: __dirname });
  const lines = r.split('\n');
  const relevant = lines.filter(l => /Tests:|FAIL |at Object|Expected|Received|> \d+/.test(l));
  console.log(relevant.join('\n'));
} catch(e) {
  const lines = (e.stdout || '').split('\n');
  const relevant = lines.filter(l => /Tests:|FAIL |at Object|Expected|Received|> \d+/.test(l));
  console.log(relevant.join('\n'));
}
