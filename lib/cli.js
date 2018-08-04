// Native modules
const {EOL} = require('os');
const readline = require('readline');
// 3rd party modules
// const ansiEscapes = require('ansi-escapes');
const _ = require('lodash');
const Promise = require('bluebird');
// internal modules
const Onkyo = require('./Onkyo');


readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

const print = (...args) => {
  console.log(...args); // eslint-disable-line no-console
};
const printRaw = (...args) => {
  process.stdout.write(...args);
};

let onkyo;
const keyMap = {
  '+': {
    title: 'volUp',
    cb: () => onkyo.setVolumeUp()
  },
  '-': {
    title: 'volDown',
    cb: () => onkyo.setVolumeDown()
  },
  p: {
    title: 'pwrToggle',
    cb: () => onkyo.pwrToggle()
  },
  1: {
    title: 'set FM',
    cb: () => onkyo.setFM()
  },
  2: {
    title: 'set CBL/SAT',
    cb: () => onkyo.setCblSat()
  }
};

function connect(ip = '192.168.1.9') {
  onkyo = new Onkyo({ip});
  onkyo.on('error', print);
  return Promise.resolve(onkyo);
}

connect();


function listKeys() {
  // printRaw(ansiEscapes.eraseScreen);
  print(`${EOL}keys`);
  _.each(keyMap, (value, key) => {
    print(`${key} - ${value.title}`);
  });
  print();
}
process.stdin.on('keypress', (str, key) => {
  if (key.ctrl && key.name === 'c') {
    process.exit(); // eslint-disable-line no-process-exit
  } else if (key.name === 'l') {
    listKeys();
  } else if (keyMap[str]) {
    printRaw(`${keyMap[str].title}..`);
    keyMap[str].cb()
      .then(() => printRaw('ok\n'))
      .then(() => Promise.delay(700))
      .then(listKeys)
      .catch(() => {
        printRaw('fail\n');
        print();
      });
  } else {
    print(`No symbol defined for "${str}" key.`);
    listKeys();
  }
});
print('Press a key to retrieve a stock price');
listKeys();
