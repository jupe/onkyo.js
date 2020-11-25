// 3rd party modules
const _ = require('lodash');
const sinon = require('sinon');
const {expect} = require('chai');
const Promise = require('bluebird');
// module under test
const {Onkyo, OnkyoError} = require('../lib');

const {stub, spy} = sinon;


describe('Onkyo', function () {
  describe('eiscpPacketExtract', function () {
    it('raises', function () {
      expect(() => Onkyo.eiscpPacketExtract('')).to.throw(OnkyoError);
      expect(() => Onkyo.eiscpPacketExtract('asd')).to.throw(OnkyoError);
      expect(() => Onkyo.eiscpPacketExtract('000000')).to.throw(OnkyoError);
    });
    it('pass', function () {
      expect(Onkyo.eiscpPacketExtract('abc\x0d')).to.be.eql('abc');
      expect(Onkyo.eiscpPacketExtract('abc\x1a')).to.be.eql('abc');
      expect(Onkyo.eiscpPacketExtract('abc\x1a\x0d')).to.be.eql('abc');
      expect(Onkyo.eiscpPacketExtract('abc\x1a\x0d\x0a')).to.be.eql('abc');
    });
  });
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
      'with address': {address: '1.2.3.4'},
      'with logger': {
        logger: new Proxy({}, {get: () => () => {}}),
        address: '1.2.3.4'
      },
      'with name': {name: 'test', address: '1.2.3.4'},
      'with port': {port: 1, address: '1.2.3.4'}
    };
    it('raises', function () {
      expect(() => new Onkyo()).to.throw(Error);
      expect(() => new Onkyo({})).to.throw(Error);
      expect(() => new Onkyo({logger: {}})).to.throw(Error);
      expect(() => new Onkyo({port: 123})).to.throw(Error);
      expect(() => new Onkyo({port: 123})).to.throw(Error);
      expect(() => Onkyo.init()).to.throw(Error);
    });
    _.each(options, (opt, key) => {
      it(key, function () {
        test(opt);
      });
    });
    it('init', function () {
      const onkyo = Onkyo.init({address: 'localhost'});
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
        expect(socket.on.callCount).to.be.equal(3);
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
        payload: {PWR: false}
      },
      {
        rx: '!1PWR01',
        event: 'PWR',
        payload: {PWR: true}
      },
      {
        rx: '!1AMT01',
        event: 'AMT',
        payload: {AMT: true}
      },
      {
        rx: '!1AMT00',
        event: 'AMT',
        payload: {AMT: false}
      }
    ];
    _.each(tests, (obj) => {
      it(obj.rx, function () {
        return new Promise((resolve) => {
          onkyo.on(obj.event, resolve);
          onEvents.data(Onkyo.createEiscpBuffer(`${obj.rx}\x1a`));
        })
          .then((data) => {
            expect(data).to.be.deep.eql(obj.payload);
          });
      });
    });
    it('unrecognize', function (done) {
      spy(onkyo, '_parseMsg');
      onEvents.data(Onkyo.createEiscpBuffer('abc01\x1a'));
      onkyo.once('error', () => {
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
        const response = Onkyo.createEiscpBuffer('!1PWR01\x1a');
        return Promise.all([
          onkyo.sendCommand('POWER', 'ON'),
          Promise.delay(1).then(() => fakeData(response))
        ]);
      })
      .then(() => {
        expect(socket.write.callCount).to.be.equal(1);
      });
  });
  describe('api', function () {
    let onkyo;
    const pypass = x => x;
    beforeEach(function () {
      onkyo = new Onkyo({address: 'localhost'});
      stub(onkyo, '_client');
      stub(onkyo, '_sendISCPpacket');
      return onkyo
        .connect(customConnect);
    });
    describe('setVolume', function () {
      it('throws when invalid input', function () {
        expect(() => onkyo.setVolume('')).to.throw(Error);
        expect(() => onkyo.setVolume(0.1)).to.throw(Error);
        expect(() => onkyo.setVolume(-1)).to.throw(Error);
        expect(() => onkyo.setVolume(101)).to.throw(Error);
      });
      it('pass', function () {
        const vol = 50;
        onkyo._sendISCPpacket.callsFake(() => {
          onkyo._parseClientPacket(`MVL${vol.toString(16)}`, pypass);
        });
        return onkyo.setVolume(vol)
          .then((volume) => {
            expect(volume).to.be.eql(vol);
          });
      });
    });
    describe('getVolume', function () {
      it('pass', function () {
        const vol = 10;
        onkyo._sendISCPpacket.callsFake(() => {
          onkyo._parseClientPacket(`MVL${vol.toString(16)}`, pypass);
        });
        return onkyo.getVolume()
          .then((volume) => {
            expect(volume).to.be.eql(vol);
          });
      });
    });
    describe('setCenterVolume', function () {
      it('throws when invalid input', function () {
        expect(() => onkyo.setCenterVolume('')).to.throw(Error);
        expect(() => onkyo.setCenterVolume(0.1)).to.throw(Error);
        expect(() => onkyo.setCenterVolume(-13)).to.throw(Error);
        expect(() => onkyo.setCenterVolume(13)).to.throw(Error);
      });
      it('pass', function () {
        const vol = 6;
        onkyo._sendISCPpacket.callsFake(() => {
          onkyo._parseClientPacket(`CTL+${vol.toString(16)}`, pypass);
        });
        return onkyo.setCenterVolume(vol)
          .then((volume) => {
            expect(volume).to.be.eql(vol);
          });
      });
    });
    describe('getCenterVolume', function () {
      it('pass', function () {
        const vol = 10;
        onkyo._sendISCPpacket.callsFake(() => {
          onkyo._parseClientPacket(`CTL+${vol.toString(16)}`, pypass);
        });
        return onkyo.getCenterVolume()
          .then((volume) => {
            expect(volume).to.be.eql(vol);
          });
      });
    });
    it('getDeviceState', function () {
      const callFakes = [
        () => onkyo._parseClientPacket('PWR01', pypass), // POWER on
        () => onkyo._parseClientPacket('SLI02', pypass), // Game
        () => onkyo._parseClientPacket('MVL01', pypass), // VOL 1
        () => onkyo._parseClientPacket('AMT00', pypass), // unmute
        () => onkyo._parseClientPacket('LMD01', pypass), // sound mode direct
        () => onkyo._parseClientPacket('PWR01', pypass), // POWER on
        () => onkyo._parseClientPacket('PWR01', pypass), // POWER on
        () => onkyo._parseClientPacket('PWR00', pypass), // POWER off
        () => onkyo._parseClientPacket('PWR00', pypass) // POWER off
      ];
      _.each(callFakes, (callFake, index) => {
        onkyo._sendISCPpacket.onCall(index).callsFake(callFake);
      });
      return onkyo.getDeviceState()
        .then((states) => {
          const shouldBe = {
            PWR: true, SLI: 'GAME', MVL: 1, AMT: false, LMD: 'DIRECT'
          };
          expect(states).to.be.deep.equal(shouldBe);
          return onkyo.isOn();
        })
        .then((on) => {
          expect(on).to.be.true;
          return onkyo.isOff();
        })
        .then((off) => {
          expect(off).to.be.false;
          return onkyo.isOn();
        })
        .then((on) => {
          expect(on).to.be.false;
          return onkyo.isOff();
        })
        .then((off) => {
          expect(off).to.be.true;
        });
    });
    // @TODO more test..
  });
});
