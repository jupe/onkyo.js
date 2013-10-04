var Onkyo = require('../lib/Onkyo');

var onkyo = new Onkyo();
onkyo.Discover( function(err, device){
	console.log(device);
	onkyo.Connect( function(){
		console.log('client connected');
	 	//onkyo.On();
	 	onkyo.SendCommand("SOURCE_SELECT", "FM");
	});
});
