// Debug v6 - simula exatamente o fluxo do teste manual que falhou
const sm = require('./stateMachine');
const C = { 
  name: 'Marmitas Caseiras', 
  delivery_fee: 5,
  opening_hours: '10h às 22h'
};

async function test() {
  let s = { 
    etapa: 'INICIO', 
    pedidoAtual: { items: [], type: null, address: null, paymentMethod: null, deliveryFee: 0 } 
  };
  
  console.log('=== INÍCIO ===');
  s = (await sm.process('d','1','oi',s,C)).state;
  console.log('Etapa:', s.etapa);
  
  console.log('\n=== 3 grandes e uma pequena ===');
  s = (await sm.process('d','1','3 grandes e uma pequena',s,C)).state;
  console.log('Etapa:', s.etapa);
  console.log('_grupos:', JSON.stringify(s._grupos, null, 2));
  
  console.log('\n=== churras ===');
  s = (await sm.process('d','1','churras',s,C)).state;
  console.log('Etapa:', s.etapa);
  console.log('_grupos[0].proteinas:', s._grupos?.[0]?.proteinas);
  
  console.log('\n=== costela ===');
  s = (await sm.process('d','1','costela',s,C)).state;
  console.log('Etapa:', s.etapa);
  console.log('_grupos[1].proteinas:', s._grupos?.[1]?.proteinas);
  
  console.log('\n=== macarrao ===');
  s = (await sm.process('d','1','macarrao',s,C)).state;
  console.log('Etapa:', s.etapa);
  
  console.log('\n=== pure ===');
  s = (await sm.process('d','1','pure',s,C)).state;
  console.log('Etapa:', s.etapa);
  
  console.log('\n=== beterraba e alface ===');
  s = (await sm.process('d','1','beterraba e alface',s,C)).state;
  console.log('Etapa:', s.etapa);
  
  console.log('\n=== repolho ===');
  s = (await sm.process('d','1','repolho',s,C)).state;
  console.log('Etapa:', s.etapa);
  console.log('Items após saladas:', s.pedidoAtual.items.length);
  console.log('_grupos após saladas:', s._grupos);
  
  console.log('\n=== 2 sucos e 3 refri ===');
  let r = await sm.process('d','1','2 sucos e 3 refri',s,C);
  s = r.state;
  console.log('Etapa:', s.etapa);
  console.log('Items TOTAIS:', s.pedidoAtual.items.length);
  console.log('\nItems detalhados:');
  s.pedidoAtual.items.forEach((item, i) => {
    if (item.tipo === 'marmita') {
      console.log(`  ${i}: MARMITA ${item.tamanho} qty=${item.quantity}`);
    } else {
      console.log(`  ${i}: ${item.name} qty=${item.quantity}`);
    }
  });
  
  console.log('\n=== RESPONSE perguntarTipo ===');
  console.log(r.response.join('\n---\n'));
  
  process.exit(0);
}

test().catch(e => { console.error(e); process.exit(1); });
