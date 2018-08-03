/* eslint-disable */
const {EOL} = require('os');
const readline = require('readline');

const Onkyo = require('./Onkyo');

readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

const keyMap = new Map();
keyMap.set('+', 'volUp');
keyMap.set('-', 'volDown');
keyMap.set('p', 'pwrToggle');
keyMap.set('f', 'setFM');

let onkyo;

function connect(ip = '192.168.1.9') {
  onkyo = new Onkyo({ip});
  onkyo.on('error', error => console.error(error));
  return Promise.resolve(onkyo);
}

connect();

function control(api) {
  return onkyo[api]();
}

function listKeys() {
  console.log(`${EOL}keys`);
  keyMap.forEach((value, key) => {
    console.log(`${key} - ${value}`);
  });
  console.log();
}
process.stdin.on('keypress', (str, key) => {
  if (key.ctrl && key.name === 'c') {
    process.exit(); // eslint-disable-line no-process-exit
  } else if (key.name === 'l') {
    listKeys();
  } else if (keyMap.has(str)) {
    control(keyMap.get(str))
      .then(() => console.log('ok'))
      .then(listKeys)
      .catch((error) => {
        console.log(error);
      });
  } else {
    console.log(`No symbol defined for "${str}" key.`);
  }
});
console.log('Press a key to retrieve a stock price');
listKeys();
