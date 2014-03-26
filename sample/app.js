var Onkyo = require('../lib/onkyo');

var onkyo = Onkyo.init({log: true});
onkyo.on("error", function(err){
    console.log(err);
});

onkyo.on("detected", function(device){
    console.log(device);
});
onkyo.on("connected", function(host){
    console.log("connected to: "+JSON.stringify(host));
    onkyo.PwrOn(function(error, ok){
        if(error)console.log("error:", error);
        if(ok)console.log("success:", ok);
        onkyo.VolUp(function(error, ok){
            onkyo.VolDown(function(error, ok){
              onkyo.SetSource("VIDEO2", function(error, ok){
                onkyo.PwrOff(function(error, ok){
                    onkyo.Close(function(error, ok){
                        process.exit();
                    });
                });
              });
            });
        });
    });

});
onkyo.Discover( function(err, device){
    onkyo.Connect( function(){
        console.log('connected');

        //onkyo.SendCommand("SOURCE_SELECT", "FM");

    });
});
//setTimeout( onkyo.Close, 10000);
