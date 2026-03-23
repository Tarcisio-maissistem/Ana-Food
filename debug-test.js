const sm = require('./stateMachine');
const C = { name: 'T', delivery_fee: 5 };

async function test() {
  let s = { 
    etapa: 'INICIO', 
    pedidoAtual: { items: [], type: null, address: null, paymentMethod: null, deliveryFee: 0 } 
  };
  
  s = (await sm.process('d','1','oi',s,C)).state;
  s = (await sm.process('d','1','3 grandes e 1 pequena',s,C)).state;
  s = (await sm.process('d','1','frango',s,C)).state;
  s = (await sm.process('d','1','costela',s,C)).state;
  s = (await sm.process('d','1','arroz',s,C)).state;
  s = (await sm.process('d','1','macarrao',s,C)).state;
  s = (await sm.process('d','1','sem',s,C)).state;
  s = (await sm.process('d','1','beterraba',s,C)).state;
  
  console.log('Items antes upsell:', s.pedidoAtual.items.length);
  console.log('Tamanhos:', s.pedidoAtual.items.map(i => i.tamanho));
  
  let r = await sm.process('d','1','3 suco e 2 refri',s,C);
  console.log('\nItems depois upsell:', r.state.pedidoAtual.items.length);
  console.log('\nResponse perguntarTipo:');
  console.log(r.response.join('\n---\n'));
  
  process.exit(0);
}

test();
