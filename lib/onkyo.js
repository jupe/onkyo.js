/**
*
* options:
*   logger (e.g wiston)
*   destinationPort || 60128
*   broadcastPort || 60128
*   ip (optional)
*   port (optional)
*
* Events:
*   -unregonizeMsg
*   -disconnect
*   -error
*   -detected
*   -msg
**/

const util = require('util')
  , net = require('net')
  , dgram = require('dgram')
  , fs = require('fs')
  , EventEmitter = require('events').EventEmitter;

const OnkyoCmds = require('./onkyo.commands.js');
const consoleLogger = require('./consoleLogger');


class Onkyo extends EventEmitter
{
  constructor(options)
  {
    super();
    this.options = {}
    this.logger = options.logger || new consoleLogger();
    this.destinationPort = options.destinationPort || 60128;
    this.broadcastPort = options.broadcastPort || 60128;
    this.broadcastAddress = options.broadcastAddress || "192.168.1.255";
    this.detectedDevice = undefined;
    if(options.ip)
    {
      this.detectedDevice = {
        address: options.ip,
        port: options.port || 60128
       };
    }
    this._client = null;
    this.deviceState = {};
    this._reqCallback = ()=>{}; // @todo need better approach
    this._server = this._createListenServer();
  }

  getDeviceState() {
    return this.deviceState;
  }

  _createListenServer()
  {
    let server = dgram.createSocket("udp4");
    server.on("error", (err) => {
      this.logger.error("server error:\n" + err.stack);
      server.close();
      this.emit("error", err);
    });
    server.on("message", (msg, rinfo) => {
      this.detectedDevice = this._parseDetectionResponse(msg);
      if( this.detectedDevice ){
        this.detectedDevice.address = rinfo.address;
        this.detectedDevice.port = rinfo.port;
        this.emit("detected", this.detectedDevice);
        this._reqCallback(null, this.detectedDevice);
        this.logger.info(`Detected: ${this.detectedDevice.address}:${this.detectedDevice.port}`)
      }
      else {
        //self.emit("error", {error: 'detection error'});
      }
    });
    server.on("listening", () => {
      server.setBroadcast(true);
      let address = server.address();
      this.logger.info("server listening " + address.address + ":" + address.port);
    });

    server.bind(this.broadcastPort);
    return server;
  }

  _doBuffer(msg) {
    //msg += "\x1A";
    let buffer = new Buffer("ISCP\x00\x00\x00\x10\x00\x00\x00\x00\x01\x00\x00\x00"+msg+"\x0D\x0A");
    buffer.writeUInt8(msg.length, 11);
    return buffer;
  }

  _parseDetectionResponse(msg) {
    try{
      msg = msg.slice(16).toString().trim();
      msg = msg.split("/");
      let areas = {DX: "North American model", XX: "European or Asian model", JJ: "Japanese model"}
      return {
        category: msg[0][1],
        modelName: msg[0].slice(5),
        ISCPport: msg[1],
        area:  areas[msg[2]],
        identifier: msg[3].slice(0,12)
      };
    } catch( e ){
      return false;
    }
  }

  _parsePacket(packetstring) {
    let obj;
    let group = packetstring.slice(18, 21).toString();
    let command = packetstring.slice(21).toString();
    if( !command || !command.match ) return false;
    command = command.match(/[^\x1a\x0d\x0a]{1,}/);
    if( !command || !command[0] ) {
      return false;
    }
    command = command[0];
    this.logger.debug('RX: '+JSON.stringify({group: group, cmd: command}));
    switch (group) {
      case "MVL":
        if((obj=command.match(/([0-9A-F]{2})/)))
        {
          let volume = parseInt(obj[1], 16);
          this.deviceState['masterVolume'] = volume;
          this.logger.debug("masterVolume: "+this.deviceState['masterVolume'] );
          this.emit("msg", {MVL: volume});
          this._reqCallback(null, {MVL: volume});
          return true;
        }
        return MasterVolume._parsePacket(command);
      case "PWR":
        if((obj=command.match(/([0-1]{2})/)))
        {
          let pwrOn = parseInt(obj[1])==1;
          this.deviceState['power'] = pwrOn
          this.logger.debug("Power: "+pwrOn);
          this.emit("msg", {PWR: pwrOn});
          this._reqCallback(null, {PWR: pwrOn});
          return true;
        }
      case "AMT":
        if((obj=command.match(/([0-1]{2})/)))
        {
          let mute = parseInt(obj[1])==1;
          this.deviceState['mute'] = mute
          this.logger.debug("Mute: "+mute);
          this.emit("msg", {MUTE: mute});
          this._reqCallback(null, {MUTE: mute});
          return true;
        }
      case "IFA":
        return false;
        //return Audio._parsePacket(command);
      case "SLI":
        if((obj=command.match(/([0-1]{2})/)))
        {
          let source = parseInt(obj[1])==1;
          this.logger.debug("Source Set: "+source);
          this.emit("msg", {SLI: source});
          this._reqCallback(null, {SLI: source});
          return true;
        }
        //return Input._parsePacket(packetstring);
      default: return false;
    }
  }

  _parseEventMessage(data) {
    if(!this._parsePacket(data))
    {
      let msg = "RX: unknown event: "+data.slice(16).toString();
      this.emit("unregonizeMsg", msg);
      fs.appendFile('unknown_msgs.txt', msg+"\n", (err) => {
        this.logger.error(err);
      });
    }
    /*
    data = data.slice(16).toString();
    let obj;

    else if((obj=data.match(/NLSC-P/))){
      console.logger.debug("NLSC-P?");
    }*/
    // !1IFAHDMI 3,PCM,48 kHz,2.0 ch,All Ch Stereo,5.1 ch,
    // !1IFVHDMI 3,1280 x 720p   50 Hz,RGB,24 bit,HDMI Main,1280 x 720p   50 Hz,RGB,24 bit,Custom,
  }


  _SendISCPpacket(packet)
  {
    if(!this._client)
      throw Error("Client is not connected");
    this.logger.debug(`Packet: ${packet}`);
    this._client.write(packet);
  }

  Discover(callback)
  {
    if(!this._server)
      throw Error("Server is not alive!");
    this._reqCallback = callback;
    let buf = this._doBuffer(OnkyoCmds.DISCOVER);
    this._server.send(
      buf, 0, buf.length, this.broadcastPort,
      this.broadcastAddress,
      (err, bytes) => {
      if (err) {
        if(callback)callback(err)
        this.emit("error", err);
      } else {
        //callback(bytes);
      }
    });
  }

  Connect(callback){
    let host = {
      port: this.destinationPort,
      host: this.detectedDevice.address
    };
    if(this._client)
      throw Error("Client is already connected");
    this._client = net.connect(host, () => {
      this.emit("connected", host)
      if(callback){
        callback(null, "Connected")
      }
    });
    this._client.on('data', (data) => {
      this._parseEventMessage(data);
    });
    this._client.on('end', () => {
      this.emit("disconnect");
      this._client = null;
    });
  }

  Disconnect()
  {
    this._server.close();
    if(this._client)
      this._client.end();
  }
  Close()
  {
    this.Disconnect();
  }
  SendCommand(group, cmd, callback)
  {
    this._reqCallback = callback;
    if( !OnkyoCmds[group] || !OnkyoCmds[group][cmd]) {
      return false;
    }
    let data = OnkyoCmds[group][cmd];
    if( !data.match(/^\!1/) ) {
      data = "!1"+cmd;
    }
    this.logger.debug("TX: "+data);
    let buffer = this._doBuffer(data);
    this._SendISCPpacket(buffer);
  }
  PwrOn(callback)
  {
    this.SendCommand("POWER", "Power STATUS", (err, status) => {
      if( !status.Power ) this.SendCommand('POWER', 'Power ON', callback);
      else if(callback)callback(null, status);
    });
  }
  PwrOff(callback)
  {
    this.SendCommand("POWER", "Power STATUS", (err, status) => {
      if( status.PWR ) this.SendCommand('POWER', 'Power OFF', callback);
      else if(callback)callback(null, status);
    });
  }
  PwrState(callback)
  {
    this.SendCommand('POWER', "Power STATUS", callback);
  }
  Mute(callback)
  {
    this.SendCommand('AUDIO', "Mute", callback);
  }
  UnMute(callback)
  {
    this.SendCommand('AUDIO', "UnMute", callback);
  }
  VolUp(callback)
  {
    this.SendCommand('AUDIO', "Volume Up", callback)
  }
  VolDown(callback)
  {
    this.SendCommand('AUDIO', "Volume Down", callback)
  }
  SetSource(source, callback)
  {
    this.SendCommand('SOURCE_SELECT', source, callback)
  }
}

exports.init = function(opts) {
  return new Onkyo(opts);
}
