// Native modules
const {EOL} = require('os');
const readline = require('readline');
// 3rd party modules
const ansiEscapes = require('ansi-escapes');
const _ = require('lodash');
const Promise = require('bluebird');
// internal modules
const OnkyoDiscover = require('./OnkyoDiscover');

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
    cb: () => onkyo.audioVolumeUp()
  },
  '-': {
    title: 'volDown',
    cb: () => onkyo.audioVolumeDown()
  },
  p: {
    title: 'pwrToggle',
    cb: () => onkyo.pwrToggle()
  },
  1: {
    title: 'set FM',
    cb: () => onkyo.sourceSelectFm()
  },
  2: {
    title: 'set CBL/SAT',
    cb: () => onkyo.sourceSelectCblSat()
  },
  3: {
    title: 'set BD/DVD',
    cb: () => onkyo.sourceSelectBdDvd()
  },
  5: {
    title: 'set CD',
    cb: () => onkyo.sourceSelectCd()
  },
  6: {
    title: 'set NET',
    cb: () => onkyo.sourceSelectNet()
  },
  c: {
    title: 'set ÇD',
    cb: () => onkyo.sourceSelectCd()
  },
  s: {
    title: 'set Stereo',
    cb: () => onkyo.soundModeStereo()
  },
  d: {
    title: 'set direct',
    cb: () => onkyo.soundModeDirect()
  },
  t: {
    title: 'set Thx',
    cb: () => onkyo.soundModeThx()
  },
  m: {
    title: 'toggle Mute',
    cb: () => onkyo.muteToggle()
  }
};

const connect = () => OnkyoDiscover.DiscoverFirst()
  .then((onkyoInstance) => {
    onkyo = onkyoInstance;
    onkyo.on('error', print);
  });

function listKeys() {
  print(`${EOL}Keys`);
  _.each(keyMap, (value, key) => {
    print(`${key} - ${value.title}`);
  });
  print('ctrl+c - Exit');
}
function start() {
  const keyPress = (str, key) => {
    if (key.ctrl && key.name === 'c') {
      process.exit(); // eslint-disable-line no-process-exit
    } else if (key.name === 'l') {
      listKeys();
    } else if (keyMap[str]) {
      printRaw(ansiEscapes.eraseScreen);
      printRaw(`${keyMap[str].title}..`);
      Promise.try(keyMap[str].cb)
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
  };
  connect()
    .then(() => {
      listKeys();
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
      process.stdin.on('keypress', keyPress);
    })
    .catch((error) => {
      print(error);
      process.exit(1);
    });
}
module.exports = start;
