// 3rd party modules
const _ = require('lodash');
// const sinon = require('sinon');
const {expect} = require('chai');
// module under test
const {Onkyo} = require('../lib');


describe('Onkyo', function () {
  describe('constructor', function () {
    const validate = (onkyo, obj) => {
      expect(onkyo).to.be.instanceof(Onkyo);
      if (obj) {
        if (obj.name) {
          expect(onkyo.name).to.be.equal(obj.name);
        }
        if (obj.address) {
          expect(onkyo.address).to.be.equal(obj.address);
        }
        if (obj.port) {
          expect(onkyo.port).to.be.equal(obj.port);
        }
      }
    };
    const test = (obj) => {
      const onkyo = new Onkyo(obj);
      validate(onkyo);
    };
    const options = {
      empty: undefined,
      'with logger': {logger: new Proxy({}, {get: () => () => {}})},
      'with name': {name: 'test'},
      'with address': {address: '1.2.3.4'},
      'with port': {port: 1}
    };
    _.each(options, (opt, key) => {
      it(key, function () {
        test(opt);
      });
    });
    it('init', function () {
      const onkyo = Onkyo.init();
      validate(onkyo);
    });
  });
  const customConnect = (host, cb) => {
    cb();
    return {
      on: () => {},
      end: () => {},
      write: () => {}
    };
  };
  it('connect', function () {
    const onkyo = new Onkyo({address: 'localhost'});
    const myConnect = (host, cb) => {
      expect(host).to.be.deep.eql({
        host: 'localhost',
        port: Onkyo.DEFAULT_PORT
      });
      customConnect(host, cb);
    };
    return onkyo.connect(myConnect);
  });
  // @todo
  it.skip('receive data', function () {
    const onkyo = new Onkyo({address: 'localhost'});
    return onkyo
      .connect(customConnect)
      .then(() => {
      });
  });
});
