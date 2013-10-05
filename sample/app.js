var Onkyo = require('../lib/Onkyo');

var onkyo = new Onkyo();
onkyo.on("error", function(err){
	console.log(err);
});
onkyo.on("detected", function(device){
	console.log(device);
});
onkyo.on("connected", function(host){
	console.log("connected to: "+JSON.stringify(host));
});
onkyo.Discover( function(err, device){
	onkyo.Connect( function(){
	 	onkyo.PwrOn();
	 	//onkyo.SendCommand("SOURCE_SELECT", "FM");
	 	onkyo.VolUp();
	 	
	});
});
setTimeout( onkyo.Close, 10000);