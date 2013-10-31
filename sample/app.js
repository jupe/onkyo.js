var Onkyo = require('../lib/Onkyo');

var onkyo = new Onkyo({log: true});
onkyo.on("error", function(err){
	console.log(err);
});
/*
onkyo.on("detected", function(device){
	console.log(device);
});
onkyo.on("connected", function(host){
	console.log("connected to: "+JSON.stringify(host));
});*/
onkyo.Discover( function(err, device){
	onkyo.Connect( function(){
		console.log('connected');
	 	onkyo.PwrOn(function(error, ok){
	 		if(error)console.log(error);
	 		if(ok)console.log(ok);

	 		
	 	});
	 	onkyo.VolUp();
	 	//onkyo.SendCommand("SOURCE_SELECT", "FM");
	 	
	});
});
setTimeout( onkyo.Close, 10000);