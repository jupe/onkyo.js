// native modules
const os = require('os');
const dgram = require('dgram');
const {EventEmitter} = require('events');
// 3rd party modules
const _ = require('lodash');
const Promise = require('bluebird');

// application modules
const defautLogger = require('./logger');
const Onkyo = require('./Onkyo');
const OnkyoError = require('./OnkyoError');
const OnkyoCmds = require('./onkyo.commands.js');


class OnkyoDiscover extends EventEmitter {
  constructor(options = {
    logger: defautLogger,
    broadcastPort: Onkyo.DEFAULT_PORT
  }) {
    super();
    this.logger = options.logger;
    this.broadcastPort = _.get(options, 'broadcastPort', Onkyo.DEFAULT_PORT);
    this.broadcastAddress = _.get(
      options, 'broadcastAddress',
      OnkyoDiscover.DEFAULT_ADDRESS
    );
    console.log(this.broadcastAddress);
    this._server = undefined;
    this._onkyoCache = {};
    this.on('_detected', this._detected.bind(this));
  }
  _detected(data) {
    let onkyo = this._onkyoCache[data.address];
    if (!onkyo) {
      this.logger.info('New onkyo..');
      const index = Object.keys(this._onkyoCache).length;
      _.set(data, 'name', `${data.info.modelName}#${index}`);
      this._onkyoCache[data.address] = new Onkyo(data);
      onkyo = this._onkyoCache[data.address];
      this.logger.silly(`detected new: ${onkyo.toString()}`);
    } else {
      this.logger.silly(`detected again: ${onkyo.toString()}`);
    }
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
      this._server.removeAllListeners();
      this._server.close();
      this._server = undefined;
      this.logger.debug('socket closed');
    } else {
      this.logger.debug('socket was closed already');
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
    return this._retryUntilSuccess();
  }
  _retryUntilSuccess(retries = 5) {
    let callback;
    const detects = new Promise((resolve) => {
      callback = resolve;
      this.once('detected', resolve);
    }).timeout(1000)
      .catch(Promise.TimeoutError, (error) => {
        this.removeListener('detected', callback);
        this.logger.warn('Did not detect any device');
        if (retries > 0) {
          this.logger.debug(`retrying, retries left: ${retries - 1}..`);
          return this._retryUntilSuccess(retries - 1);
        }
        throw error;
      });
    return Promise.all([detects, this._sendDiscover()]);
  }
  _sendDiscover() {
    return new Promise((resolve, reject) => {
      const buf = Onkyo.createEiscpBuffer(OnkyoCmds.DISCOVER);
      this.logger.debug(`TX: ${escape(buf)}`);
      this._server.send(
        buf, 0, buf.length, this.broadcastPort,
        this.broadcastAddress,
        (err, bytes) => { // eslint-ignore-line no-unused-vars
          if (err) {
            this.emit('error', err);
            this.logger.error('err: ', err);
            reject(err);
            return;
          }
          if (bytes !== buf.length) {
            reject(new OnkyoError('socket write failed'));
          } else {
            this.logger.debug('Write ok');
            resolve();
          }
        }
      );
    });
  }
  /**
   * Detect first Onkyo
   * @return {Promise<Onkyo>} Resolves first detected Onkyo object
   */
  discoverFirst() {
    let callback;
    return Promise.all([
      this.discover(),
      new Promise((resolve) => {
        callback = resolve;
        this.once('detected', resolve);
      })
        .timeout(40000, 'did not detect any onkyo')
        .catch(Promise.TimeoutError, () => {
          this.removeListener('detected', callback);
        })
    ]).then(results => results[1]);
  }
  _createListenServer() {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      socket.on('error', (err) => {
        this.logger.error(`socket error:\n${err.stack}`);
        socket.close();
        this.emit('error', err);
        reject(err);
      });
      socket.on('message', this._handle.bind(this));
      socket.on('listening', () => {
        socket.setBroadcast(true);
        const {address, port} = socket.address();
        this.logger.info(`server listening ${address}:${port}`);
        resolve(socket);
      });
      socket.bind(this.broadcastPort);
    });
  }
  _handle(packet, rinfo) {
    const message = Onkyo.eiscpPacketExtract(packet);
    this.logger.debug(`RX: ${escape(message)}`);
    if (OnkyoCmds.DISCOVER.indexOf(message) === 2) {
      this.logger.debug('ignore ECNQS');
      return;
    }
    this.logger.debug(`Parse DISCOVER msg: ${escape(message)}`);
    const info = OnkyoDiscover.parseDetectionResponse(message);
    if (info) {
      const detectedDevice = {
        address: rinfo.address,
        port: rinfo.port,
        info
      };
      this.emit('_detected', detectedDevice);
    } else {
      this.logger.error(`detection error: ${escape(packet)}, ${JSON.stringify(rinfo)}`);
      this.emit('error', new OnkyoError(`detection error: ${escape(message)}`));
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
        modelName: msg[0].slice(3),
        ISCPport: msg[1],
        area: areas[msg[2]],
        identifier: msg[3].slice(0, 12)
      };
    } catch (error) {
      return false;
    }
  }
  static _toBroadcastAddress(address) {
    const parts = address.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.255`;
  }
  static _getInterfaceAddresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    _.each(interfaces, (iface) => {
      _.each(iface, (address) => {
        if (address.family === 'IPv4' && !address.internal) {
          addresses.push(OnkyoDiscover._toBroadcastAddress(address.address));
        }
      });
    });
    return addresses;
  }
}
OnkyoDiscover.DEFAULT_ADDRESS = _.get(OnkyoDiscover._getInterfaceAddresses(), '0');

module.exports = OnkyoDiscover;
