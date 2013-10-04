var net = require('net');
var dgram = require('dgram');
var fs = require('fs');


var Onkyo = function()
{
	var destinationPort = 60128;
	var broadcastPort = 60128;
	var broadcastAddress = "192.168.0.255";
	var broadcastCallback;
	var detectedDevice;
	var client;
	var server = dgram.createSocket("udp4");
	var cmds = require('./onkyo.commands.js');
	
	var doBuffer = function(msg)
	{
		//msg += "\x1A";
		var buffer = new Buffer("ISCP\x00\x00\x00\x10\x00\x00\x00\x00\x01\x00\x00\x00"+msg+"\x0D\x0A");
		buffer.writeUInt8(msg.length, 11);
		return buffer;
	}
	function parseDetectionResponse(msg){
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
	}
	var deviceState = {}

	function ParsePacket(packetstring) {
		var obj;
      var group = packetstring.slice(18, 21).toString();
      var command = packetstring.slice(21).toString();
      if( !command || !command.match ) return false;
      command = command.match(/[^\x1a\x0d\x0a]{1,}/);
      if( !command || !command[0] ) return false;
      command = command[0];
  	  console.log({group: group, cmd: command});
      switch (group) {
        case "MVL":
          if((obj=command.match(/([0-9A-F]{2})/)))
			{
				var volume = parseInt(obj[1], 16);
				deviceState['masterVolume'] = volume;
				console.log("masterVolume: "+deviceState['masterVolume'] );
				return true;
			}return MasterVolume.ParsePacket(command);
        case "PWR":
          if((obj=command.match(/([0-1]{2})/)))
			{
				deviceState['power'] = parseInt(obj[1])==1;
				console.log("Power: "+deviceState['power']);
				return true;	 
			}
        case "AMT":
          if((obj=command.match(/([0-1]{2})/)))
			{
				deviceState['mute'] = parseInt(obj[1])==1;
				console.log("Mute: "+deviceState['mute']);	 
			}
        case "IFA":
          return Audio.ParsePacket(command);
        case "SLI":
          return Input.ParsePacket(packetstring);
        default: return false;
      }
    }
	function parseEventMessage(data)
	{
		if(!ParsePacket(data))
		{
			
			var msg = "RX: unknown event: "+data;
			console.log(msg);
			fs.appendFile('unknown_msgs.txt', msg+"\n", function (err) {

			});
		
		}
		/*
		data = data.slice(16).toString();
		var obj;
		
		else if((obj=data.match(/NLSC-P/))){
			console.log("NLSC-P?");
		}*/
		//!1IFAHDMI 3,PCM,48 kHz,2.0 ch,All Ch Stereo,5.1 ch,
		//!1IFVHDMI 3,1280 x 720p   50 Hz,RGB,24 bit,HDMI Main,1280 x 720p   50 Hz,RGB,24 bit,Custom,

	}

	var MessageList = 
	{
		"discover": "!xECNQSTN",
		"PWR ON": "!1PWR01",
		"PWR OFF": "!1PWR00",
		"PWR GET": "!1PWRQSTN"
	}
	server.on("error", function (err) {
	  console.log("server error:\n" + err.stack);
	  server.close();
	});

	server.on("message", function (msg, rinfo) {
		detectedDevice = parseDetectionResponse(msg);
		detectedDevice.address = rinfo.address;
		detectedDevice.port = rinfo.port;
		broadcastCallback(null, detectedDevice);
	});

	server.on("listening", function () {
	  server.setBroadcast(true);
	  var address = server.address();
	  console.log("server listening " + address.address + ":" + address.port);
	});

	server.bind(broadcastPort, "192.168.0.100");
	
	function SendCommand(group, cmd)
	{
		if( !cmds[group] || !cmds[group][cmd]) return false;
		var cmd = cmds[group][cmd];
		if( !cmd.match(/^\!1/) )
			cmd = "!1"+cmd;
		var buffer = doBuffer(cmd);
		console.log(buffer);
		console.log("TX: "+buffer.toString());
		client.write(buffer);
	}
	function Discover(callback)
	{
		broadcastCallback = callback;
		var buf = doBuffer(cmds.DISCOVER);
		server.send(buf, 0, buf.length, broadcastPort, 
			broadcastAddress, function(err, bytes) {
		   if(err)callback(err)
		});
	}
	function Connect(callback){
		client = net.connect({port: destinationPort, host: detectedDevice.address},
		    function() { //'connect' listener
		  
		  if(callback)callback(null, "Connected")
		});
		client.on('data', function(data) {
		  parseEventMessage(data);
		  //client.end();
		});
		client.on('end', function() {
		  console.log('client disconnected');
		});
	}

	function On(callback)
	{
		console.log("Power on..");
		SendCommand('POWER', 'Power ON');
	}
	function Off(callback)
	{
		console.log("Power off..");
		SendCommand('POWER', 'Power OFF')	}
	function Get(callback)
	{
		console.log("Power Status?..");
		SendCommand('POWER', "Power STATUS");
	}
	return {
		Discover: Discover,
		Connect: Connect,
		On: On,
		Off: Off,
		Get: Get,
		SendCommand: SendCommand
	}
}

module.exports = Onkyo;
