// native modules
const dgram = require('dgram');
const {EventEmitter} = require('events');
// 3rd party modules
const _ = require('lodash');
const Promise = require('bluebird');

// application modules
const defautLogger = require('./logger');
const Onkyo = require('./Onkyo');
// const OnkyoError = require('./OnkyoError');
const OnkyoCmds = require('./onkyo.commands.js');

const DEFAULT_BROADCAST_ADDRESS = '192.168.0.255';

class OnkyoDiscover extends EventEmitter {
  constructor(options = {
    logger: defautLogger,
    broadcastPort: Onkyo.DEFAULT_PORT,
    broadcastAddress: DEFAULT_BROADCAST_ADDRESS
  }) {
    super();
    this.logger = options.logger;
    this.broadcastPort = _.get(options, 'broadcastPort', Onkyo.DEFAULT_PORT);
    this.broadcastAddress = _.get(
      options, 'broadcastAddress',
      DEFAULT_BROADCAST_ADDRESS
    );
    this._server = undefined;
    this._onkyoCache = {};
    this.on('_detected', this._detected.bind(this));
  }
  _detected(data) {
    this.logger.debug('detected:', data);
    if (!this._onkyoCache[data.address]) {
      this.logger.info('New onkyo..');
      const index = Object.keys(this._onkyoCache).length;
      _.set(data, 'name', `onkyo#${index}`);
      this._onkyoCache[data.address] = new Onkyo(data);
      const onkyo = this._onkyoCache[data.address];
      this.logger.info(`Detected: ${onkyo.toString()}`);
    }
    const onkyo = this._onkyoCache[data.address];
    this.emit('detected', onkyo);
  }

  listen() {
    this.logger.debug('created listen server');
    return this._createListenServer()
      .then((server) => {
        this._server = server;
      });
  }
  get connected() {
    return this._server !== undefined;
  }
  get detected() {
    const list = _.reduce(
      this._onkyoCache,
      (result, onkyo, address) => {
        this.logger.debug(`detected: ${address}`);
        result.push(onkyo);
        return result;
      }, []
    );
    return list;
  }
  /**
   * Close listening new devices
   * @return {Promise} resolves
   */
  close() {
    if (this.connected) {
      this._server.close();
      this._server = undefined;
    }
    return Promise.resolve();
  }
  /**
   * Start listening if not already and send discover request
   * Remember to close listening when not needed anymore.
   * @return {Promise} resolves when discover request is sent
   */
  discover() {
    if (!this.connected) {
      return this.listen()
        .then(() => this.discover());
    }
    return this._sendDiscover();
  }
  _sendDiscover() {
    return new Promise((resolve, reject) => {
      const buf = Onkyo.createEiscpBuffer(OnkyoCmds.DISCOVER);
      this.logger.debug(`Send discover message: ${escape(buf)}`);
      this._server.send(
        buf, 0, buf.length, this.broadcastPort,
        this.broadcastAddress,
        (err, bytes) => {
          if (err) {
            this.emit('error', err);
            this.logger.error('err: ', err);
            _.set(err, 'bytes', bytes);
            reject(err);
          }
          resolve();
        }
      );
    });
  }
  /**
   * Detect first Onkyo
   * @return {Promise<Onkyo>} Resolves first detected Onkyo object
   */
  discoverFirst() {
    return Promise.all([
      this.discover(),
      new Promise((resolve) => {
        this.once('detected', resolve);
      }).timeout(8000, 'did not detect any onkyo')
    ]).then(results => results[1]);
  }
  _createListenServer() {
    const server = dgram.createSocket('udp4');
    server.on('error', (err) => {
      this.logger.error(`server error:\n${err.stack}`);
      server.close();
      this.emit('error', err);
    });
    server.on('message', this._handle.bind(this));
    return new Promise((resolve) => {
      server.on('listening', () => {
        server.setBroadcast(true);
        const address = server.address();
        this.logger.info(`server listening ${address.address}:${address.port}`);
        resolve(server);
      });
      server.bind(this.broadcastPort);
    });
  }
  _handle(packet, rinfo) {
    const message = Onkyo.eiscpPacketExtract(packet);
    this.logger.debug(`RX: ${escape(message)}`);
    if (OnkyoCmds.DISCOVER.indexOf(message) !== 2) {
      this.logger.error(`received non discover msg: ${escape(message)}`);
      return;
    }
    this.logger.debug(`Parse DISCOVER msg: ${escape(message)}`);
    const info = OnkyoDiscover.parseDetectionResponse(message);
    if (info) {
      const detectedDevice = {
        address: rinfo.address,
        port: rinfo.port,
        model: rinfo
      };
      this.emit('_detected', detectedDevice);
    } else {
      this.logger.error(`detection error: ${packet}, ${rinfo}`);
      this.emit('error', new Error(`detection error: ${escape(message)}`));
    }
  }

  static parseDetectionResponse(response) {
    try {
      // msg: ECNTX-NR809/60128/XX/0009B04530D1
      const msg = response.split('/');
      const areas = {
        DX: 'North American model',
        XX: 'European or Asian model',
        JJ: 'Japanese model'
      };
      return {
        category: msg[0][1],
        modelName: msg[0].slice(5),
        ISCPport: msg[1],
        area: areas[msg[2]],
        identifier: msg[3].slice(0, 12)
      };
    } catch (error) {
      return false;
    }
  }
}

module.exports = OnkyoDiscover;
