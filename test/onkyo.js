// 3rd party modules
const _ = require('lodash');
const sinon = require('sinon');
const {expect} = require('chai');
const Promise = require('bluebird');
// module under test
const {Onkyo} = require('../lib');

const {stub, spy} = sinon;


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
  let socket;
  let onEvents;
  const customConnect = (host, cb) => {
    cb();
    return socket;
  };
  beforeEach(function () {
    onEvents = {};
    socket = {
      on: stub(),
      end: stub(),
      write: stub()
    };
    socket.on.callsFake((event, cb) => {
      onEvents[event] = cb;
    });
  });
  it('connect', function () {
    const onkyo = new Onkyo({address: 'localhost'});
    const myConnect = (host, cb) => {
      expect(host).to.be.deep.eql({
        host: 'localhost',
        port: Onkyo.DEFAULT_PORT
      });
      return customConnect(host, cb);
    };
    return onkyo.connect(myConnect)
      .then(() => {
        expect(socket.on.callCount).to.be.equal(2);
      });
  });
  describe('receive', function () {
    let onkyo;
    beforeEach(function () {
      onkyo = new Onkyo({address: 'localhost'});
      return onkyo
        .connect(customConnect);
    });
    const tests = [
      {
        rx: '!1PWR00',
        event: 'PWR',
        payload: {pwrOn: false}
      },
      {
        rx: '!1PWR01',
        event: 'PWR',
        payload: {pwrOn: true}
      },
      {
        rx: '!1AMT01',
        event: 'AMT',
        payload: {mute: true}
      },
      {
        rx: '!1AMT00',
        event: 'AMT',
        payload: {mute: false}
      }
    ];
    _.each(tests, (obj) => {
      it(obj.rx, function () {
        return new Promise((resolve) => {
          onkyo.on(obj.event, resolve);
          onEvents.data(Onkyo.createEiscpBuffer(obj.rx));
        })
          .then((data) => {
            expect(data).to.be.deep.eql(obj.payload);
          });
      });
    });
    it('unrecognize', function (done) {
      spy(onkyo, '_parseMsg');
      onEvents.data('abc01\x1a');
      onkyo.once('warning', () => {
        expect(onkyo._parseMsg.calledOnce).to.be.eql(true);
        onkyo._parseMsg.restore();
        done();
      });
    });
  });
  it('sendCommand', function () {
    const onkyo = new Onkyo({address: 'localhost'});
    return onkyo
      .connect(customConnect)
      .then(() => {
        const fakeData = onEvents.data;
        const response = Onkyo.createEiscpBuffer('!1PWR00');
        return Promise.all([
          onkyo.sendCommand('POWER', 'Power ON'),
          Promise.delay(1).then(() => fakeData(response))
        ]);
      })
      .then(() => {
        expect(socket.write.callCount).to.be.equal(1);
      });
  });
  describe('api', function () {
    let onkyo;
    beforeEach(function () {
      onkyo = new Onkyo({address: 'localhost'});
      return onkyo
        .connect(customConnect);
    });
    // @TODO more test..
  });
});
