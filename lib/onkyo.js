var net = require('net');
var dgram = require('dgram');

var Onkoy = function()
{
	var destinationPort = 60128;
	var broadcastPort = 60128;
	var broadcastAddress = "192.168.0.255";
	var broadcastCallback;
	var detectedDevice;
	var client;
	var server = dgram.createSocket("udp4");

	
	var doBuffer = function(msg)
	{
		msg += "\x1A";
		var buffer = new Buffer("ISCP\x00\x00\x00\x10\x00\x00\x00\x00\x01\x00\x00\x00"+msg+"\x0D\x0A");
		buffer.writeUInt8(msg.length, 8);
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
	function parseEventMessage(data)
	{
		//!1MVL21
		data = data.slice(16).toString();
		var obj;
		if((obj=data.match(/MVL([0-9A-F]{2})/)))
		{
			deviceState['masterVolume'] = parseInt(obj[1], 16);
			console.log("masterVolume: "+deviceState['masterVolume'] );
			 
		}
		else if((obj=data.match(/MT([0-1]{2})/)))
		{
			deviceState['mute'] = parseInt(obj[1])==1;
			console.log("Mute: "+deviceState['mute']);	 
		}
		else if((obj=data.match(/PWR([0-1]{2})/)))
		{
			deviceState['power'] = parseInt(obj[1])==1;
			console.log("Power: "+deviceState['power']);	 
		}
		else {
			console.log("unknown event: "+data);
		}
		//!1IFAHDMI 3,PCM,48 kHz,2.0 ch,All Ch Stereo,5.1 ch,
		//!1IFVHDMI 3,1280 x 720p   50 Hz,RGB,24 bit,HDMI Main,1280 x 720p   50 Hz,RGB,24 bit,Custom,

	}

	var MessageList = 
	{
		"discover": doBuffer("!xECNQSTN"),
		"PWR ON": doBuffer("PWR01"),
		"PWR OFF": doBuffer("PWR00"),
		"PWR GET": doBuffer("QSTN")
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

	function Discover(callback)
	{
		broadcastCallback = callback;
		server.send(MessageList["discover"], 0, 
					MessageList["discover"].length, broadcastPort, 
			broadcastAddress, function(err, bytes) {
		   if(err)callback(err)
		});
	}
	function Connect(callback){
		client = net.connect({port: destinationPort, host: detectedDevice.address},
		    function() { //'connect' listener
		  console.log('client connected');
		  //client.write('world!\r\n');
		});
		client.on('data', function(data) {
		  parseEventMessage(data);
		  //client.end();
		});
		client.on('end', function() {
		  console.log('client disconnected');
		});
	}
	function SendCommand(cmd)
	{
		var buffer = MessageList[cmd];
		console.log(buffer);
		console.log("TX: "+buffer.toString());
		client.write(buffer);
	}
	function On(callback)
	{
		console.log("Power on..");
		SendCommand("PWR ON")
	}
	function Off(callback)
	{
		console.log("Power off..");
		SendCommand("PWR OFF")
	}
	return {
		Discover: Discover,
		Connect: Connect,
		On: On,
		Off: Off
	}
}
