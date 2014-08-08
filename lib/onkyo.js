/**
*
* Events:
*   -unregonizeMsg
*   -disconnect
*   -error
*   -detected
*   -msg
**/

var util = require('util')
  , net = require('net')
  , dgram = require('dgram')
  , fs = require('fs')
  , events = require('events');


var Onkyo = function(options)
{
  this.options = (options == null) ? {log: false} : options;
  this.destinationPort = 60128;
  this.broadcastPort = 60128;
  this.broadcastAddress =
    (typeof this.options.broadcastAddress != "undefined") ? this.options.broadcastAddress : "192.168.1.255";
  this.reqCallback;
  this.detectedDevice;
  if( typeof( this.options.ip) != 'undefined' )
     this.detectedDevice  = {
      address:  this.options.ip,
      port: 60128
     };
  this.client;
  this.server = dgram.createSocket("udp4");
  this.cmds = require('./onkyo.commands.js');
  this.deviceState = {}
  var self = this;

  this.server.on("error", function (err) {
    //console.log("server error:\n" + err.stack);
    self.server.close();
    self.emit("error", err.stack);
  });

  this.server.on("message", function (msg, rinfo) {
    self.detectedDevice = self.parseDetectionResponse(msg);
    if( self.detectedDevice ){
      self.detectedDevice.address = rinfo.address;
      self.detectedDevice.port = rinfo.port;
      self.reqCallback(null, self.detectedDevice);
      self.emit("detected", self.detectedDevice);
    }
    else {
      //self.emit("error", {error: 'detection error'});
    }
  });

  this.server.on("listening", function () {
    self.server.setBroadcast(true);
    var address = self.server.address();
    self.log("server listening " + address.address + ":" + address.port);
  });

  this.server.bind(this.broadcastPort);

};

util.inherits(Onkyo, events.EventEmitter);

Onkyo.prototype.log = function(str){
    if( this.options.log )
        console.log(str)
}

Onkyo.prototype.doBuffer = function(msg) {
    //msg += "\x1A";
    var buffer = new Buffer("ISCP\x00\x00\x00\x10\x00\x00\x00\x00\x01\x00\x00\x00"+msg+"\x0D\x0A");
    buffer.writeUInt8(msg.length, 11);
    return buffer;
}

Onkyo.prototype.parseDetectionResponse = function(msg){
    try{
      msg = msg.slice(16).toString().trim();
      msg = msg.split("/");
      areas = {DX: "North American model", XX: "European or Asian model", JJ: "Japanese model"}
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

Onkyo.prototype.ParsePacket = function(packetstring) {
    var obj;
    var group = packetstring.slice(18, 21).toString();
    var command = packetstring.slice(21).toString();
    if( !command || !command.match ) return false;
    command = command.match(/[^\x1a\x0d\x0a]{1,}/);
    if( !command || !command[0] ) return false;
    command = command[0];
    this.log('RX: '+JSON.stringify({group: group, cmd: command}));
    switch (group) {
      case "MVL":
        if((obj=command.match(/([0-9A-F]{2})/)))
        {
          var volume = parseInt(obj[1], 16);
          this.deviceState['masterVolume'] = volume;
          this.log("masterVolume: "+this.deviceState['masterVolume'] );
          var js = {MVL: volume};
          if(this.reqCallback) this.reqCallback(null, js);
          this.emit("msg", js);
          return true;
        }return MasterVolume.ParsePacket(command);
      case "PWR":
        if((obj=command.match(/([0-1]{2})/)))
        {
          var pwrOn = parseInt(obj[1])==1;
          this.deviceState['power'] = pwrOn
          this.log("Power: "+pwrOn);
          var js = {PWR: pwrOn};
          if(this.reqCallback) this.reqCallback(null, js);
          this.emit("msg", js);
          return true;
        }
      case "AMT":
        if((obj=command.match(/([0-1]{2})/)))
        {
          var mute = parseInt(obj[1])==1;
          this.deviceState['mute'] = mute
          this.log("Mute: "+mute);
          var js = {MUTE: mute};
          if(this.reqCallback) this.reqCallback(null, js);
          this.emit("msg", js);
          return true;
        }
      case "IFA":
        return false;
        //return Audio.ParsePacket(command);
      case "SLI":
        if((obj=command.match(/([0-1]{2})/)))
        {
          var source = parseInt(obj[1])==1;
          this.log("Source Set: "+source);
          var js = {SLI: source};
          if(this.reqCallback) this.reqCallback(null, js);
          this.emit("msg", js);
          return true;
        }
        //return Input.ParsePacket(packetstring);
      default: return false;
    }
  }

Onkyo.prototype.parseEventMessage = function(data) {
    if(!this.ParsePacket(data))
    {
      var msg = "RX: unknown event: "+data.slice(16).toString();
      this.emit("unregonizeMsg", msg);
      fs.appendFile('unknown_msgs.txt', msg+"\n", function (err) {
      });
    }
    /*
    data = data.slice(16).toString();
    var obj;

    else if((obj=data.match(/NLSC-P/))){
      console.log("NLSC-P?");
    }*/
    // !1IFAHDMI 3,PCM,48 kHz,2.0 ch,All Ch Stereo,5.1 ch,
    // !1IFVHDMI 3,1280 x 720p   50 Hz,RGB,24 bit,HDMI Main,1280 x 720p   50 Hz,RGB,24 bit,Custom,

}


Onkyo.prototype.SendeISCPpacket = function(packet)
  {
    this.log(packet);
    this.client.write(packet);
  }

Onkyo.prototype.Discover = function(callback)
  {
    this.reqCallback = callback;
    var buf = this.doBuffer(this.cmds.DISCOVER);
    this.server.send(buf, 0, buf.length, this.broadcastPort,
      this.broadcastAddress, function(err, bytes) {
      if (err) {
        if(callback)callback(err)
        this.emit("error", err);
      } else {

        //callback(bytes);
      }
    });
  }

Onkyo.prototype.Connect = function(callback){
    var host = {port: this.destinationPort, host: this.detectedDevice.address},
        self = this;

    this.client = net.connect(host, function() { //'connect' listener
      self.emit("connected", host)
      if(callback){
        callback(null, "Connected")
      }
    });
    this.client.on('data', function(data) {
      self.parseEventMessage(data);
    });
    this.client.on('end', function() {
      self.emit("disconnect");
    });
  }

Onkyo.prototype.Disconnect = function()
  {
    this.server.close();
    this.client.end();
  }
Onkyo.prototype.Close = function()
  {
    this.Disconnect();
  }
Onkyo.prototype.SendCommand = function(group, cmd, callback)
  {
    this.reqCallback = callback;
    if( !this.cmds[group] || !this.cmds[group][cmd]) return false;
    var cmd = this.cmds[group][cmd];
    if( !cmd.match(/^\!1/) ) cmd = "!1"+cmd;
    this.log("TX: "+cmd);
    var buffer = this.doBuffer(cmd);
    this.SendeISCPpacket(buffer);
  }
Onkyo.prototype.PwrOn = function(callback)
  {
    this.SendCommand("POWER", "Power STATUS", function(err, status)
    {
      if( !status.Power ) this.SendCommand('POWER', 'Power ON', callback);
      else if(callback)callback(null, status);
    });
  }
Onkyo.prototype.PwrOff = function(callback)
  {
    this.SendCommand("POWER", "Power STATUS", function(err, status)
    {
      if( status.PWR ) this.SendCommand('POWER', 'Power OFF', callback);
      else if(callback)callback(null, status);
    });
  }
Onkyo.prototype.PwrState = function(callback)
  {
    this.SendCommand('POWER', "Power STATUS", callback);
  }
Onkyo.prototype.Mute = function(callback)
  {
    this.SendCommand('AUDIO', "Mute", callback);
  }
Onkyo.prototype.UnMute = function(callback)
  {
    this.SendCommand('AUDIO', "UnMute", callback);
  }
Onkyo.prototype.VolUp = function(callback)
  {
    this.SendCommand('AUDIO', "Volume Up", callback)
  }
Onkyo.prototype.VolDown = function(callback)
  {
    this.SendCommand('AUDIO', "Volume Down", callback)
  }
Onkyo.prototype.SetSource = function(source, callback)
  {
    this.SendCommand('SOURCE_SELECT', source, callback)
  }

exports.init = function(opts) {
  return new Onkyo(opts);
}
