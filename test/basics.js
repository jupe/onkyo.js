const _ = require('lodash');
const {expect} = require('chai');
const Onkyo = require('../lib');

describe('onkyo', () => {
  describe('constructor', () => {
    const test = (obj) => {
      const onkyo = new Onkyo(obj);
      expect(onkyo).to.be.instanceof(Onkyo);
      if (obj) {
        if (obj.name) {
          expect(onkyo.name).to.be.equal(obj.name);
        }
        if (obj.address) {
          expect(onkyo.address).to.be.equal(obj.address);
        }
      }
    };
    const options = {
      empty: undefined,
      'with logger': {logger: new Proxy({}, {get: () => () => {}})},
      'with name': {name: 'test'},
      'with address': {address: '1.2.3.4'},
      'with port': {port: 1}
    };
    _.each(options, (opt, key) => {
      it(key, () => test(opt));
    });
  });
});
