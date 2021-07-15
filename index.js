var appletv = require('node-appletv-x');

var Service, Characteristic;
module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-appletv-onoff-switch", "appletvswitch", AppleTVAccessory);
}

function AppleTVAccessory(log, config) {
    this.log = log;
    this.name = config.name;
    this.credentials = config.credentials;
    this.updateRate = 5000;
    this.retryRate = 2000;
    this.reconnectInterval = 3600000; //3600000; 60000
    this.skipCheck = false;
    this.checkATVTimer = null;

    this.services = [];

    this.atvService = new Service.Television(this.name, 'atvService');
    this.atvService.setCharacteristic(Characteristic.ConfiguredName, this.name);
    this.atvService
        .setCharacteristic(
            Characteristic.SleepDiscoveryMode,
            Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
        );
    this.atvService
        .getCharacteristic(Characteristic.Active)
        .on('set', this.setPowerState.bind(this))
        .on('get', this.getPowerState.bind(this));

    this.services.push(this.atvService);

    this.atvConnect();
}

AppleTVAccessory.prototype.getServices = function () {
    this.informationService = new Service.AccessoryInformation();
    this.informationService
        .setCharacteristic(Characteristic.Manufacturer, "Apple")
        .setCharacteristic(Characteristic.Model, "Apple TV")
        .setCharacteristic(Characteristic.SerialNumber, "ST7FZN1NSXG6")
        .setCharacteristic(Characteristic.FirmwareRevision, '13.3');
    this.services.push(this.informationService);
    return this.services;
}

AppleTVAccessory.prototype.atvConnect = function () {
    var that = this;
    if (this.checkATVTimer != null)
    {   
        //clearInterval(this.checkATVTimer);
        this.checkATVTimer = null;
        that.log("Clearerd Timer Interval");
    }
    var credentials = appletv.parseCredentials(this.credentials);
    appletv.scan(credentials.uniqueIdentifier)
        .then(function (devices) {
            that.device = devices[0];
            that.device.on('error', function (error) {
                that.log("ERROR: " + error.message);
                that.log("ERROR Code: " + error.code);
                setTimeout(function () {
                    that.log("Trying to reconnect to AppleTV: " + that.name);
                    that.atvConnect();
                }, that.retryRate);
            });
            return that.device.openConnection(credentials);
        })
        .then(function (device) {
            that.log("Connected to AppleTV: " + that.name);
            that.updateStatus();
            that.reconnectTimer();
        })
        .catch(function (error) {
            that.log("ERROR: " + error.message);
            that.log("ERROR Code: " + error.code);
            setTimeout(function () {
                that.log("Trying to reconnect to AppleTV: " + that.name);
                that.atvConnect();
            }, that.retryRate);
        });
}

AppleTVAccessory.prototype.reconnectTimer = function  ()
{  
    var that = this;
    that.log("Will reconnect to Apple TV after 1 Hour: " + that.name);
    //reconnect every hour?
    setTimeout(() => {     
        this.skipCheck = true;   
        
        that.log("Reconnecting to Apple TV after 1 Hour: " + that.name);
        
        that.atvConnect();
        this.skipCheck = false;     
    }, this.reconnectInterval);
}

AppleTVAccessory.prototype.updateStatus = function () {
    var that = this;
    
    //if (this.checkATVTimer == null)
    //{
       
        //that.log("Timer Interval null - Setting up Refresh");
        this.checkATVTimer = setTimeout(function () {


            if(!that.skipCheck) {
                that.checkATVStatus();
                
                //that.updateStatus();
            } else {
                that.skipCheck = false;
                //that.updateStatus();
            }
            
            //clearInterval(this.checkATVTimer);
            //this.checkATVTimer = null;
            that.updateStatus();
    
        }, this.updateRate);

        //that.log("Set Timer Interval");
    //}
   

    // this.checkATVTimer = setTimeout(function () {
        
    // }, this.updateRate);

}

AppleTVAccessory.prototype.checkATVStatus = function () {
    var that = this;

    that.device.sendIntroduction().then(function (deviceInfo) {
            var currentPowerState = deviceInfo.payload.logicalDeviceCount;
            
            that.log("CURRENT ATV POWER STATE: " + currentPowerState);
            
            if (currentPowerState >= 1) {
                that.updatePowerState(true);
            } else {
                that.updatePowerState(false);
            }
        })
        .catch(function (error) {
            if (error)
            {
                that.log("ERROR: " + error.message);
                that.log("ERROR Code: " + error.code);
            }   
            setTimeout(function () {
                that.log("Trying to reconnect to AppleTV: " + that.name);
                that.atvConnect();
            }, that.retryRate);
        });
}

AppleTVAccessory.prototype.getPowerState = function (callback) {
    callback(null, this.atvService.getCharacteristic(Characteristic.Active).value);
}

AppleTVAccessory.prototype.updatePowerState = function (state) {
    
    //this.log("UPDATING ATV POWER STATE: " + state);
    //this.atvService.updateCharacteristic(Characteristic.Active, state);

    if (this.atvService.getCharacteristic(Characteristic.Active).value != state) {
        this.log("UPDATING ATV POWER STATE: " + state);
        this.updateRate = 15000;
        this.skipCheck = true;
        this.atvService.updateCharacteristic(Characteristic.Active, state);

        //this.atvService.getCharacteristic(Characteristic.Active).updateValue(state);
    }
    else
    {
        this.updateRate = 5000;
    }
}

AppleTVAccessory.prototype.setPowerState = function (state, callback) {
    var that = this;

    if(this.atvService.getCharacteristic(Characteristic.Active).value != state) {
        if (state) {
            that.device.sendKeyCommand(appletv.AppleTV.Key.Tv).then(function () {
                that.log("AppleTV: " + that.name + " is turned on");
                that.skipCheck = true;
                this.updateRate = 15000;
                that.updatePowerState(state);
                //that.getPowerState(callback);
                callback(null);
            
            }).catch(function (error) {
                that.log("ERROR: " + error.message);
                that.log("ERROR Code: " + error.code);
                setTimeout(function () {
                    that.log("Trying to reconnect to AppleTV: " + that.name);
                    that.atvConnect();
                }, that.retryRate);
            });
        } else {
            that.device.sendKeyCommand(appletv.AppleTV.Key.LongTv).then(function () {
                that.device.sendKeyCommand(appletv.AppleTV.Key.Select).then(function () {
                    that.log("AppleTV: " + that.name + " is turned off");
                    that.skipCheck = true;
                    this.updateRate = 15000;
                    that.updatePowerState(state);
                    //that.getPowerState(callback);
                    callback(null);
                    
                }).catch(function (error) {
                    that.log("ERROR: " + error.message);
                    that.log("ERROR Code: " + error.code);
                    setTimeout(function () {
                        that.log("Trying to reconnect to AppleTV: " + that.name);
                        that.atvConnect();
                    }, that.retryRate);
                });
            }).catch(function (error) {
                that.log("ERROR: " + error.message);
                that.log("ERROR Code: " + error.code);
                setTimeout(function () {
                    that.log("Trying to reconnect to AppleTV: " + that.name);
                    that.atvConnect();
                }, that.retryRate);
            });
        }
    } else {
        that.getPowerState(callback);
    }
}