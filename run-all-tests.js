// run-all-tests.js - Roda todos os testes e gera um resumo limpo
const { execSync } = require('child_process');
const fs = require('fs');

// Silenciar logs durante os testes
process.env.LOG_LEVEL = 'silent';

try {
  execSync('npx jest --json --outputFile=final-results.json --forceExit --silent', {
    stdio: ['ignore', 'ignore', 'ignore'],
    env: { ...process.env, LOG_LEVEL: 'silent' }
  });
} catch (e) {
  // Jest retorna exit code != 0 se houver falhas, mas ainda cria o arquivo
}

// Ler resultados
const results = JSON.parse(fs.readFileSync('final-results.json', 'utf-8'));

// Gerar resumo
const summary = {
  total: results.numTotalTests,
  passed: results.numPassedTests,
  failed: results.numFailedTests,
  success: results.success,
  failedTests: results.testResults
    .flatMap(suite => suite.assertionResults)
    .filter(test => test.status === 'failed')
    .map(test => ({
      name: test.fullName,
      message: test.failureMessages.join('\n').slice(0, 500)
    }))
};

fs.writeFileSync('test-summary.json', JSON.stringify(summary, null, 2));

console.log('\n═══════════════════════════════════════════════════════════');
console.log('RESUMO DOS TESTES');
console.log('═══════════════════════════════════════════════════════════');
console.log(`Total: ${summary.total}`);
console.log(`Passaram: ${summary.passed} ✅`);
console.log(`Falharam: ${summary.failed} ❌`);
console.log(`Sucesso: ${summary.success ? 'SIM 🎉' : 'NÃO'}`);

if (summary.failedTests.length > 0) {
  console.log('\nTestes que falharam:');
  summary.failedTests.forEach((t, i) => {
    console.log(`\n${i + 1}. ${t.name}`);
    console.log(`   ${t.message.slice(0, 200)}...`);
  });
}

console.log('\nResumo salvo em test-summary.json');
